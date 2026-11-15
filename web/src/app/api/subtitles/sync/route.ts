import { json, readJson, requireSession, route } from "@/lib/api";
import { verifyStreamToken, type StreamTokenPayload } from "@/lib/stream-token";
import { fetchSubtitleAsVtt, audioSync } from "@/lib/subs/service";
import { estimateOffset } from "@/lib/subs/sync";
import { audioIsUsable, consensusOffset } from "@/lib/subs/consensus";
import { parseCues } from "@/lib/subs/format";
import { COPY_TRACK, clearManualSync, getSync, setSync } from "@/lib/state/sync";
import { mapLimit, withTimeout } from "@/lib/http";
import { directMediaUrl, syncTorrentServerSettings } from "@/lib/vod/torrent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Extracting the audio is the slow part of aligning against it.
export const maxDuration = 300;

interface Body {
  mode?: "reference" | "audio" | "manual" | "clear";
  /** One reference track (older clients). */
  reference?: string;
  /** Several reference tracks: the shift most of them agree on wins. */
  references?: string[];
  target?: string;
  stream?: string;
  offsetMs?: number;
}

/** Where an alignment is kept: the title, the copy and the track. */
function placeOf(subtitle: StreamTokenPayload, stream: StreamTokenPayload | null) {
  const title = typeof subtitle.t === "string" ? subtitle.t : null;
  const track = typeof subtitle.i === "string" ? subtitle.i : null;
  const copy = typeof stream?.s === "string" ? stream.s : null;
  return title && track && copy ? { title, track, copy } : null;
}

/*
 * How the two measurements fit together.
 *
 * Comparing tracks says where a track sits relative to the timing most
 * tracks share. It cannot say where that shared timing sits relative to the
 * video: measured on one copy of a film, five tracks from different uploads
 * agreed with each other at 0 while every one of them was 12.8 s early
 * against that copy's audio (a remastered release with a longer opening).
 *
 * The audio says exactly that missing part, and it is a property of the copy,
 * not of the track. So it is kept once per copy, as the shift between the
 * shared timing and this copy, and every track of that copy lands as
 * "its place among the tracks + the copy's shift" without minutes of audio
 * each.
 */
export const POST = route("subtitle_sync", async (request) => {
  await requireSession("vod");
  const body = await readJson<Body>(request);
  const mode = body.mode ?? "reference";

  const subtitlePayload = verifyStreamToken(body.target);
  if (!subtitlePayload) return json({ error: "Token de subtítulo inválido" }, { status: 401 });
  const streamPayload = body.stream ? verifyStreamToken(body.stream) : null;
  if (body.stream && !streamPayload) return json({ error: "Token de video inválido" }, { status: 401 });
  // Both tokens must belong to the VOD side. Without this a link holding only
  // the `vod` permission could hand in a signed *live* stream token and have
  // the server run ffmpeg against a channel it may not watch.
  if ((streamPayload && streamPayload.k !== "vod") || (subtitlePayload.k && subtitlePayload.k !== "vod")) {
    return json({ error: "Este token no corresponde a una película o serie" }, { status: 403 });
  }
  const place = placeOf(subtitlePayload, streamPayload);

  if (mode === "manual" || mode === "clear") {
    if (!place) return json({ error: "Falta saber qué copia y qué pista se ajustan" }, { status: 400 });
    if (mode === "clear") {
      await clearManualSync(place.title, place.copy, place.track);
      return json({ ok: true });
    }
    const offsetMs = Number(body.offsetMs);
    if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) > 600_000) {
      return json({ error: "Desfase fuera de rango" }, { status: 400 });
    }
    const saved = await setSync(
      place.title,
      place.copy,
      { offsetMs: Math.round(offsetMs), confidence: 1, source: "manual" },
      place.track,
    );
    return json({ offsetMs: saved.offsetMs, confidence: saved.confidence, method: saved.source });
  }

  if (mode === "audio") {
    if (!streamPayload) return json({ error: "Falta el video" }, { status: 400 });
    const known = place ? await getSync(place.title, place.copy, place.track).catch(() => null) : null;
    // Measured already, or set by hand: the alignment belongs to the copy and
    // the track, so every other screen gets it without the wait.
    if (known && known.source !== "reference") {
      return json({ offsetMs: known.offsetMs, confidence: known.confidence, method: known.source, cached: true });
    }
    // The copy's shift is already known from another track: this track only
    // needs its own place among the tracks.
    const copyShift = place ? await getSync(place.title, place.copy, COPY_TRACK).catch(() => null) : null;
    if (place && copyShift) {
      const offsetMs = (known?.offsetMs ?? 0) + copyShift.offsetMs;
      const saved = await setSync(
        place.title,
        place.copy,
        { offsetMs, confidence: copyShift.confidence, source: "audio" },
        place.track,
      ).catch(() => null);
      return json({ offsetMs: saved?.offsetMs ?? offsetMs, confidence: copyShift.confidence, method: saved?.source ?? "audio" });
    }

    // The sidecar only needs the sound: the plain file, not the transcode.
    await syncTorrentServerSettings();
    const result = await audioSync(subtitlePayload.u, directMediaUrl(streamPayload.u));
    if (!audioIsUsable(result)) {
      return json({ error: "No hubo suficiente diálogo para medir contra el audio" }, { status: 422 });
    }
    if (!place) return json({ ...result, method: "audio" });

    // Kept for the copy: the audio shift minus where this track sits among
    // the others, so the next track of this copy is aligned at once.
    await setSync(
      place.title,
      place.copy,
      { offsetMs: result.offsetMs - (known?.offsetMs ?? 0), confidence: result.confidence, source: "audio" },
      COPY_TRACK,
    ).catch(() => null);
    const saved = await setSync(
      place.title,
      place.copy,
      { offsetMs: result.offsetMs, confidence: result.confidence, source: "audio" },
      place.track,
    ).catch(() => null);
    return json({
      offsetMs: saved?.offsetMs ?? result.offsetMs,
      confidence: saved?.confidence ?? result.confidence,
      method: saved?.source ?? "audio",
    });
  }

  // Reference mode: where this track sits among several others.
  const tokens = [...(body.references ?? []), ...(body.reference ? [body.reference] : [])].slice(0, 5);
  const references = tokens
    .map((token) => verifyStreamToken(token))
    .filter((payload): payload is StreamTokenPayload => Boolean(payload));
  if (references.length === 0) return json({ error: "No hay pistas para comparar" }, { status: 400 });

  const target = await fetchSubtitleAsVtt(subtitlePayload.u, { headers: subtitlePayload.h });
  const targetCues = parseCues(target.vtt);
  const estimates = (
    await mapLimit(references, 3, async (reference) => {
      try {
        const vtt = await withTimeout(fetchSubtitleAsVtt(reference.u, { headers: reference.h }), 10_000, "pista lenta");
        return estimateOffset(parseCues(vtt.vtt), targetCues);
      } catch {
        return null;
      }
    })
  ).filter((estimate): estimate is NonNullable<typeof estimate> => estimate !== null);
  const result = consensusOffset(estimates);
  if (!place || result.agreeing === 0) return json({ ...result, method: "reference" });

  // With the copy's shift known, this is already a real alignment.
  const copyShift = await getSync(place.title, place.copy, COPY_TRACK).catch(() => null);
  const record = copyShift
    ? { offsetMs: result.offsetMs + copyShift.offsetMs, confidence: copyShift.confidence, source: "audio" as const }
    : { offsetMs: result.offsetMs, confidence: result.confidence, source: "reference" as const };
  // Kept so the next screen starts aligned; a hand adjustment or an audio
  // measurement already stored is never replaced by this.
  const saved = await setSync(place.title, place.copy, record, place.track).catch(() => null);
  return json({
    ...result,
    offsetMs: saved?.offsetMs ?? record.offsetMs,
    confidence: saved?.confidence ?? record.confidence,
    method: saved?.source ?? record.source,
  });
});
