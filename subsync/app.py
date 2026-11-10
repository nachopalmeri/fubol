"""
Audio-based subtitle alignment for Fubol.

Completes the sync feature. The app already aligns one subtitle track against
another ("reference" mode, pure JavaScript); this service aligns a track
against the film's own audio, which is what you need when there is no second
track to compare with.

Contract expected by `src/lib/subs/service.ts` (audioSync):

    POST /align  {"subtitle_url": "...", "video_url": "..."}
    200          {"offset_seconds": <float>, "confidence": <0..1>}

ffsubsync does the work: it builds a speech-activity signal from the audio and
from the subtitle timings, then finds the shift that best correlates them.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

LOG = logging.getLogger("subsync")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# The caller (audioSync) gives up at 180 s, so the whole job must fit inside
# that. The budget is split: pulling the audio down is the slow part and gets
# most of it, while ffsubsync on a short mono WAV finishes in seconds.
EXTRACT_TIMEOUT_S = int(os.environ.get("SUBSYNC_EXTRACT_TIMEOUT", "200"))
ALIGN_TIMEOUT_S = int(os.environ.get("SUBSYNC_TIMEOUT", "60"))
MAX_SUBTITLE_BYTES = 4 * 1024 * 1024

# Seconds of audio decoded for the alignment. Ten minutes of dialogue is
# plenty to lock a constant offset, and the cap is what keeps a feature film
# from being pulled down in full just to time its subtitles: thirty minutes
# took longer than the caller's whole 180 s budget.
AUDIO_WINDOW_S = int(os.environ.get("SUBSYNC_AUDIO_WINDOW", "240"))

# Sampling starts at zero on purpose. Seeking into the film is much faster —
# -ss before -i uses an HTTP range request — but it shifts the audio timebase
# while the subtitle cues keep their original timings, so every reported
# offset comes back displaced by exactly the seek. Measured: a 420 s seek
# produced a confident but meaningless -88.75 s. Correctness wins; the window
# below is what keeps the cost bounded.
AUDIO_SEEK_S = int(os.environ.get("SUBSYNC_AUDIO_SEEK", "0"))

# ffsubsync prints the shift it settled on; this is how we read it back.
OFFSET_PATTERNS = (
    re.compile(r"offset\s*(?:seconds)?\s*[:=]\s*(-?\d+(?:\.\d+)?)", re.I),
    re.compile(r"shift\s*of\s*(-?\d+(?:\.\d+)?)\s*seconds", re.I),
)
SCORE_PATTERN = re.compile(r"score\s*[:=]\s*(-?\d+(?:\.\d+)?)", re.I)


class BadRequest(Exception):
    """Rejected before any work is done."""


def _check_url(raw: str, what: str) -> str:
    """
    Only plain http(s) is accepted. Both URLs come from the app's own signed
    proxy, but this service must not be turned into a fetcher for arbitrary
    schemes just because a request says so.
    """
    if not raw or not isinstance(raw, str):
        raise BadRequest(f"{what} ausente")
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        raise BadRequest(f"{what} debe ser http/https")
    if not parsed.netloc:
        raise BadRequest(f"{what} sin host")
    return raw


def _download(url: str, target: str, max_bytes: int) -> None:
    request = urllib.request.Request(url, headers={"user-agent": "Fubol-subsync/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        written = 0
        with open(target, "wb") as handle:
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise BadRequest("El subtítulo excede el tamaño permitido")
                handle.write(chunk)


def _parse_output(text: str, window_s: int) -> tuple[float | None, float, float | None]:
    """
    Pulls the offset out of ffsubsync's log and states how much to trust it.

    ffsubsync prints a `score`, which is a raw correlation total that grows
    with the amount of audio analysed. It is not a confidence, and mapping it
    through `score/(score+1)` returned 0.95 for anything above about twenty —
    which reported a suspicious -97.9 s result from four minutes of a film
    whose opening is mostly ambient as near-certain.

    Confidence here is driven by how much evidence there actually was: the
    analysed window relative to a feature film, scaled down further when the
    proposed shift is large compared with that window. A short window can
    still produce the right answer, it just cannot prove it.
    """
    offset: float | None = None
    for pattern in OFFSET_PATTERNS:
        found = pattern.search(text)
        if found:
            offset = float(found.group(1))
            break

    raw_score: float | None = None
    score = SCORE_PATTERN.search(text)
    if score:
        raw_score = float(score.group(1))

    if offset is None:
        return None, 0.0, raw_score

    # A full-length pass is the only thing that earns high confidence.
    coverage = min(1.0, window_s / 3600)
    confidence = 0.25 + 0.55 * coverage

    # A shift the window can barely contain is more likely a spurious peak
    # than a real one: a 98 s offset found in 240 s of audio is a guess.
    ratio = abs(offset) / max(window_s, 1)
    if ratio > 0.3:
        confidence *= 0.45
    elif ratio > 0.15:
        confidence *= 0.7

    if raw_score is not None and abs(raw_score) < 10:
        confidence *= 0.6

    return offset, round(max(0.05, min(0.9, confidence)), 3), raw_score


def _run_ffmpeg(video_url: str, target: str, seek: int, window: int, budget: int) -> str:
    process = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            # -ss before -i makes ffmpeg seek with an HTTP range request
            # instead of reading and discarding everything up to that point.
            *(["-ss", str(seek)] if seek > 0 else []),
            "-t", str(window),
            "-i", video_url,
            "-vn", "-sn", "-dn",
            "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
            target,
        ],
        capture_output=True,
        text=True,
        timeout=budget,
    )
    if process.returncode != 0 or not os.path.exists(target) or os.path.getsize(target) < 32_000:
        raise RuntimeError(process.stderr.strip()[:300] or "ffmpeg no produjo audio")
    return process.stderr


def _extract_audio(video_url: str, target: str) -> int:
    """
    Pulls a speech-friendly mono track out of the video with ffmpeg.

    ffsubsync cannot open a remote URL itself — it reports "unable to read
    reference" even for a URL ffmpeg reads without complaint — so the audio is
    extracted here and ffsubsync is pointed at a local file.

    The source, not the CPU, is the constraint: the same film answered a 240 s
    window in 23 s on one attempt and a 300 s window in 181 s on another. So
    the first try samples a useful stretch of dialogue, and a timeout falls
    back to a short clip from the start rather than failing outright.
    """
    attempts = (
        (AUDIO_SEEK_S, AUDIO_WINDOW_S, EXTRACT_TIMEOUT_S),
        (AUDIO_SEEK_S, 240, max(40, EXTRACT_TIMEOUT_S // 3)),
    )
    last: Exception | None = None
    for seek, window, budget in attempts:
        try:
            _run_ffmpeg(video_url, target, seek, window, budget)
            # The caller needs to know how much evidence there was, because
            # that is what the confidence is derived from.
            return window
        except (subprocess.TimeoutExpired, RuntimeError) as error:
            last = error
            LOG.warning("extraccion falló (seek=%s window=%s): %s", seek, window, str(error)[:200])
    raise RuntimeError(f"No se pudo extraer audio del video: {str(last)[:240]}")


def align(subtitle_url: str, video_url: str) -> dict:
    _check_url(subtitle_url, "subtitle_url")
    _check_url(video_url, "video_url")

    workdir = tempfile.mkdtemp(prefix="subsync-")
    try:
        source = os.path.join(workdir, "in.srt")
        synced = os.path.join(workdir, "out.srt")
        audio = os.path.join(workdir, "ref.wav")
        _download(subtitle_url, source, MAX_SUBTITLE_BYTES)
        window_s = _extract_audio(video_url, audio)
        LOG.info("audio extraido: %.1f MB (%ss)", os.path.getsize(audio) / 1e6, window_s)

        process = subprocess.run(
            ["ffsubsync", audio, "-i", source, "-o", synced, "--max-offset-seconds", "120"],
            capture_output=True,
            text=True,
            timeout=ALIGN_TIMEOUT_S,
        )
        combined = f"{process.stdout}\n{process.stderr}"
        offset, confidence, score = _parse_output(combined, window_s)
        if offset is None:
            LOG.warning("sin offset en la salida: %s", combined[-600:])
            raise RuntimeError("ffsubsync no devolvió un offset")
        LOG.info("alineado offset=%.3fs confianza=%.2f score=%s ventana=%ss", offset, confidence, score, window_s)
        return {"offset_seconds": offset, "confidence": confidence, "score": score, "window_seconds": window_s}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    server_version = "fubol-subsync/1.0"

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        LOG.info("%s - %s", self.address_string(), fmt % args)

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") == "/health":
            self._send(200, {"ok": True, "ffsubsync": shutil.which("ffsubsync") is not None})
            return
        self._send(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/align":
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("content-length") or 0)
            if length <= 0 or length > 64 * 1024:
                raise BadRequest("Cuerpo inválido")
            payload = json.loads(self.rfile.read(length))
            result = align(payload.get("subtitle_url", ""), payload.get("video_url", ""))
            self._send(200, result)
        except BadRequest as error:
            self._send(400, {"error": str(error)})
        except subprocess.TimeoutExpired:
            self._send(504, {"error": "El alineado excedió el tiempo permitido"})
        except Exception as error:  # noqa: BLE001
            LOG.exception("fallo de alineado")
            self._send(502, {"error": str(error)})


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    LOG.info("subsync escuchando en :%d (ffsubsync=%s)", port, shutil.which("ffsubsync"))
    server.serve_forever()


if __name__ == "__main__":
    main()
