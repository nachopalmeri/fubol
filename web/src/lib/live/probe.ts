import { recordCheck } from "../metrics";
import { fetchText, fetchUpstream, detectGate, readTextLimited, looksLikePlaylist, UpstreamError } from "../http";
import { sanitizeUrl } from "../crypto";
import { parseHlsPlaylist, selectVariant } from "./playlist";
import { failureCount, scoreProbe } from "./rank";
import type { ProbeResult } from "./types";

export interface ProbeOptions {
  sourceId?: string;
  channelId?: string;
  headers?: Record<string, string>;
  referer?: string;
  timeoutMs?: number;
  now?: number;
}

function fail(url: string, options: ProbeOptions, error: string, extra: Partial<ProbeResult> = {}): ProbeResult {
  return {
    url,
    sourceId: options.sourceId,
    channelId: options.channelId,
    ok: false,
    kind: "unknown",
    score: 0,
    ttfbMs: 0,
    edgeAgeS: null,
    edgeTrust: "none",
    edgeRawS: null,
    targetDuration: null,
    live: false,
    height: null,
    bitrate: null,
    error,
    checkedAt: options.now ?? Date.now(),
    ...extra,
  };
}

function persist(result: ProbeResult, status: number | null): void {
  try {
    recordCheck({
      sourceId: result.sourceId ?? null,
      target: sanitizeUrl(result.url),
      ok: result.ok,
      ttfbMs: result.ttfbMs,
      edgeAgeS: result.edgeAgeS,
      edgeTrust: result.edgeTrust,
      edgeRawS: result.edgeRawS,
      status,
      error: result.error ?? null,
      checkedAt: result.checkedAt,
    });
  } catch {
    // Metrics must never break playback.
  }
}

/**
 * One source, at most two requests: the playlist and (for masters) the chosen
 * variant. Measures TTFB and live-edge age, rejects login/captcha/HTML gates.
 */
export async function probeSource(url: string, options: ProbeOptions = {}): Promise<ProbeResult> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.referer) headers.referer = options.referer;
  const now = options.now ?? Date.now();
  let status: number | null = null;

  try {
    const { res, finalUrl, ms } = await fetchUpstream(url, {
      headers,
      timeoutMs: options.timeoutMs ?? 7000,
    });
    status = res.status;
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();

    if (!res.ok) {
      return finalize(fail(url, options, `El origen respondió ${res.status}`), status);
    }

    if (/mpegurl|m3u8/.test(contentType) || /\.m3u8?(\?|$)/i.test(finalUrl)) {
      const text = await readTextLimited(res, 1_500_000);
      const gate = detectGate(text);
      if (gate) return finalize(fail(url, options, `Fuente con ${gate}`, { gate }), status);
      if (!looksLikePlaylist(text)) return finalize(fail(url, options, "El origen no es un HLS válido"), status);

      let playlist = parseHlsPlaylist(text, finalUrl, now);
      // A media playlist carries no RESOLUTION, so the height only exists on
      // the master's STREAM-INF. Remember it before descending, otherwise
      // every multi-variant source reports an unknown resolution.
      let variantHeight: number | null = null;
      if (playlist.isMaster) {
        const variant = selectVariant(playlist.variants, 1080);
        if (variant) {
          variantHeight = variant.height ?? null;
          const sub = await fetchText(variant.uri, {
            headers,
            timeoutMs: 6000,
            maxBytes: 1_500_000,
          });
          const subPlaylist = parseHlsPlaylist(sub.text, sub.finalUrl, now);
          if (subPlaylist.segments.length > 0) playlist = subPlaylist;
        }
      }

      if (playlist.segments.length === 0) {
        return finalize(fail(url, options, "Playlist sin segmentos"), status);
      }

      const base: ProbeResult = {
        url,
        sourceId: options.sourceId,
        channelId: options.channelId,
        ok: true,
        kind: "hls",
        score: 0,
        ttfbMs: ms,
        edgeAgeS: playlist.edgeAgeS,
        edgeTrust: playlist.edgeTrust,
        edgeRawS: playlist.edgeRawS,
        targetDuration: playlist.targetDuration,
        live: playlist.live,
        height: playlist.height ?? variantHeight,
        bitrate: playlist.bitrate,
        checkedAt: now,
      };
      base.score = scoreProbe(base, failureCount(url));
      return finalize(base, status);
    }

    if (contentType.includes("video/mp4") || /\.mp4(\?|$)/i.test(finalUrl)) {
      const result: ProbeResult = {
        ...fail(url, options, ""),
        ok: true,
        kind: "mp4",
        live: false,
        checkedAt: now,
        ttfbMs: ms,
      };
      result.score = scoreProbe(result, failureCount(url));
      return finalize(result, status);
    }

    if (contentType.includes("mp2t") || /\.ts(\?|$)/i.test(finalUrl)) {
      return finalize(
        fail(url, options, "MPEG-TS directo: el navegador necesita HLS", { kind: "ts" }),
        status,
      );
    }

    const head = await readTextLimited(res, 32_000);
    const gate = detectGate(head);
    if (gate) return finalize(fail(url, options, `Fuente con ${gate}`, { gate }), status);
    return finalize(fail(url, options, "Formato no reconocido"), status);
  } catch (error) {
    const message = error instanceof UpstreamError ? error.message : "No se pudo verificar la fuente";
    return finalize(fail(url, options, message), status);
  }
}

function finalize(result: ProbeResult, status: number | null): ProbeResult {
  persist(result, status);
  return result;
}
