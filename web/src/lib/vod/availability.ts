import type { AddonMeta, AddonMetaPreview } from "../addons";
import { cacheGet, cacheSet } from "../cache";
import { shortHash } from "../crypto";
import { detectGate, fetchUpstream, mapLimit, withTimeout } from "../http";
import { parseHlsPlaylist, selectVariant } from "../live/playlist";
import { sanitizeHeaders } from "../stream-token";
import type { VodSource } from "./rank";

export interface AvailableMeta extends AddonMetaPreview {
  playableId?: string;
  availabilityCheckedAt?: number;
  /** Torrent sources found when no direct source exists. */
  p2p?: number;
}

async function readPrefix(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => undefined); }, 5000);
  try {
    while (bytes < maxBytes) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value.subarray(0, maxBytes - bytes);
      chunks.push(chunk);
      bytes += chunk.length;
    }
    if (timedOut) throw new Error("Media body timeout");
    const result = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => undefined);
  }
}

/** A reachable, browser container is evidence of a source, not guaranteed decoding. */
export async function validateVodSource(source: VodSource): Promise<"hls" | "mp4" | null> {
  const headers = sanitizeHeaders(source.headers);
  const key = `vod:media:v1:${shortHash(JSON.stringify([source.url, headers]), 32)}`;
  const cached = cacheGet<{ kind: "hls" | "mp4" | null }>(key);
  if (cached) return cached.kind;
  // A swarm-backed source has to find peers and fetch the first pieces before
  // it can answer at all: measured at 6.6 s against a well-seeded torrent, so
  // the five-second budget used for an ordinary CDN rejected every one of them.
  const timeoutMs = source.viaTorrent ? 25_000 : 5_000;
  let kind: "hls" | "mp4" | null = null;
  try {
    const { res, finalUrl } = await fetchUpstream(source.url, { headers, range: "bytes=0-4095", timeoutMs });
    if (!res.ok) {
      await res.body?.cancel();
    } else {
      const contentType = res.headers.get("content-type") ?? "";
      if (/mpegurl/i.test(contentType) || /\.m3u8(?:\?|$)/i.test(finalUrl)) {
        // A range may truncate a playlist. Fetch it with a bounded body instead.
        await res.body?.cancel();
        const full = await fetchUpstream(source.url, { headers, timeoutMs });
        const text = new TextDecoder().decode(await readPrefix(full.res, 1_000_000));
        if (full.res.ok && text.trimStart().startsWith("#EXTM3U") && !detectGate(text)) {
          const playlist = parseHlsPlaylist(text, full.finalUrl);
          if (playlist.segments.length > 0) kind = "hls";
          else {
            const variant = selectVariant(playlist.variants, 1080);
            if (variant) {
              const child = await fetchUpstream(variant.uri, { headers, timeoutMs: 5000 });
              const childText = new TextDecoder().decode(await readPrefix(child.res, 1_000_000));
              if (child.res.ok && !detectGate(childText) && childText.trimStart().startsWith("#EXTM3U") && parseHlsPlaylist(childText, child.finalUrl).segments.length > 0) kind = "hls";
            }
          }
        }
      } else if (!/text\/html|json|matroska/i.test(contentType) && !/\.mkv(?:\?|$)/i.test(finalUrl)) {
        if (res.body) {
          const prefix = await readPrefix(res, 32);
          const box = new TextDecoder().decode(prefix.subarray(4, 8));
          const mp4 = prefix.length >= 12 && /^(ftyp|styp)$/.test(box);
          const webm = /video\/webm/i.test(contentType) && prefix[0] === 0x1a && prefix[1] === 0x45 && prefix[2] === 0xdf && prefix[3] === 0xa3;
          if (mp4 || webm) kind = "mp4";
        }
      } else {
        await res.body?.cancel();
      }
    }
  } catch {
    // Unknown, slow and inaccessible media stays out of family browsing.
  }
  cacheSet(key, { kind }, kind ? 2 * 60_000 : 30_000);
  return kind;
}

interface Resolver {
  streams(type: string, id: string): Promise<{ sources: VodSource[]; p2pOnly?: number }>;
  meta(type: string, id: string): Promise<AddonMeta | null>;
}

const pending = new Map<string, Promise<AvailableMeta | null>>();

export async function availableMeta(
  meta: AddonMetaPreview,
  providerRevision: string,
  resolver: Resolver,
  timeoutMs = 12_000,
): Promise<AvailableMeta | null> {
  if (!["movie", "series"].includes(meta.type)) return null;
  const key = `vod:available:v2:${providerRevision}:${meta.type}:${meta.id}`;
  const cached = cacheGet<{ playableId: string | null; checkedAt: number; p2p: number }>(key);
  if (cached) {
    if (cached.playableId) {
      return { ...meta, playableId: cached.playableId, availabilityCheckedAt: cached.checkedAt, p2p: cached.p2p };
    }
    // A title the providers only offer as torrent is still a real title with
    // real sources. It is shown with its count instead of being hidden.
    return cached.p2p > 0 ? { ...meta, availabilityCheckedAt: cached.checkedAt, p2p: cached.p2p } : null;
  }
  const inFlight = pending.get(key);
  if (inFlight) {
    const result = await inFlight;
    return result ? { ...meta, ...result } : null;
  }
  const task = (async () => {
    let playableId: string | null = null;
    let p2p = 0;
    const deadline = Date.now() + Math.max(1, timeoutMs);
    try {
      let ids = [meta.id];
      if (meta.type === "series") {
        const detail = await withTimeout(resolver.meta(meta.type, meta.id), Math.max(1, deadline - Date.now()), "Availability deadline");
        ids = (detail?.videos ?? [])
          .filter((video) => (video.season ?? 1) > 0 && (!video.released || Date.parse(video.released) <= Date.now()))
          .sort((a, b) => (a.season ?? 1) - (b.season ?? 1) || (a.episode ?? 1) - (b.episode ?? 1))
          // Four episodes are enough to know whether the series has sources
          // without giving up on the first ones that come out empty. Checking
          // twelve made every series blow the browse deadline and the whole
          // "Series" page came back empty.
          .slice(0, 4)
          .map((video) => video.id);
      }
      for (const id of ids) {
        if (Date.now() >= deadline) break;
        const result = await withTimeout(resolver.streams(meta.type, id), Math.max(1, deadline - Date.now()), "Availability deadline");
        p2p = Math.max(p2p, result.p2pOnly ?? 0);
        if (result.sources.length > 0) { playableId = id; break; }
      }
    } catch {
      // Fail closed for the direct sources; a torrent count is a bonus.
    }
    const checkedAt = Date.now();
    cacheSet(key, { playableId, checkedAt, p2p }, playableId ? 90_000 : 30_000);
    if (playableId) return { ...meta, playableId, availabilityCheckedAt: checkedAt, p2p };
    return p2p > 0 ? { ...meta, availabilityCheckedAt: checkedAt, p2p } : null;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

export async function filterAvailable(
  metas: AddonMetaPreview[],
  revision: string,
  resolver: Resolver,
  timeoutMs = 120_000,
): Promise<AvailableMeta[]> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  const results = await mapLimit(metas, 6, (meta) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return Promise.resolve(null);
    return availableMeta(meta, revision, resolver, Math.min(12_000, remaining));
  });
  return results.filter((meta): meta is AvailableMeta => meta !== null);
}
