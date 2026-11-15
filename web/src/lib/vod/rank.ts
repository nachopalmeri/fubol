import type { AddonRef, RawAddonStream } from "../addons";
import { shortHash } from "../crypto";
import { readRelease, shortAddonName } from "./release";
import { looksWebPlayable, resolveTorrentHlsUrl, resolveTorrentUrl, torrentKeyOf, webPlayableBonus } from "./torrent";

export interface VodSource {
  /**
   * Stable across visits: the addon plus the copy. It used to include the
   * position in the addon's answer, which changes whenever the addon re-ranks,
   * so anything remembered for a source (its subtitle alignment) was lost.
   */
  id: string;
  /**
   * The file itself, whichever addon listed it: `hash/index` for a torrent,
   * a hash of the address otherwise. Subtitle alignment belongs to the copy.
   */
  copyId: string;
  /** Release name without the addon's decoration. */
  releaseName: string;
  /** Origin, codec and audio, read from the name. */
  releaseTags: string[];
  /** Spoken languages the name mentions. */
  languages: string[];
  /** People sharing the torrent, when the addon says so. */
  seeders: number | null;
  addonId: string;
  addonName: string;
  title: string;
  description: string;
  url: string;
  quality: string;
  height: number | null;
  sizeBytes: number | null;
  sizeLabel: string | null;
  cached: boolean;
  hdr: boolean;
  remux: boolean;
  cam: boolean;
  spanish: boolean;
  headers?: Record<string, string>;
  filename?: string;
  /** Resolved from a BitTorrent infoHash by the local streaming server. */
  viaTorrent?: boolean;
  /** The release had to be remuxed to HLS to be playable in a browser. */
  transcoded?: boolean;
  score: number;
}

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
};

export function parseSize(label: string): number | null {
  const match = label.match(/([\d.]+)\s*(tb|gb|mb|kb|b)\b/i);
  if (!match?.[1] || !match[2]) return null;
  const unit = SIZE_UNITS[match[2].toLowerCase()];
  if (!unit) return null;
  return Math.round(Number(match[1]) * unit);
}

function detectHeight(text: string): number | null {
  if (/\b(2160p|4k|uhd)\b/i.test(text)) return 2160;
  if (/\b1080p\b/i.test(text)) return 1080;
  if (/\b720p\b/i.test(text)) return 720;
  if (/\b480p\b/i.test(text)) return 480;
  return null;
}

export function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function scoreSource(source: Omit<VodSource, "score">): number {
  let score = 50;
  if (source.height === 1080) score += 40;
  else if (source.height === 2160) score += 32;
  else if (source.height === 720) score += 22;
  else if (source.height === 480) score += 8;
  if (source.cached) score += 35;
  if (source.remux) score += 8;
  if (source.hdr) score += 4;
  if (source.spanish) score += 10;
  if (source.cam) score -= 90;
  if (source.sizeBytes) {
    if (source.sizeBytes > 40 * 1024 ** 3) score -= 8;
    if (source.sizeBytes < 700 * 1024 ** 2 && (source.height ?? 0) >= 1080) score -= 12;
  }
  return Math.round(score);
}

export interface EpisodeRef {
  season: number;
  episode: number;
}

/** `tt0903747:1:1` → season 1, episode 1. Other id shapes carry no episode. */
export function episodeOf(type: string, id: string): EpisodeRef | undefined {
  if (type !== "series") return undefined;
  const match = /^tt\d+:(\d+):(\d+)$/.exec(id);
  if (!match?.[1] || !match[2]) return undefined;
  return { season: Number(match[1]), episode: Number(match[2]) };
}

/** Whether a release name says it is this very episode (S01E01, 1x01). */
export function namesEpisode(text: string, ref: EpisodeRef): boolean {
  const pattern = `s0*${ref.season}[\\s._-]*e0*${ref.episode}(?!\\d)|(?<!\\d)${ref.season}x0*${ref.episode}(?!\\d)`;
  return new RegExp(pattern, "i").test(text);
}

export function normalizeStreams(
  addon: AddonRef,
  streams: RawAddonStream[],
  options: { episode?: EpisodeRef } = {},
): VodSource[] {
  const sources: VodSource[] = [];
  for (const stream of streams) {
    const title = stream.title || stream.name || "Fuente";
    const description = stream.description || "";
    const filename = stream.behaviorHints?.filename;
    const haystack = `${title} ${description} ${filename ?? ""}`;

    // A BitTorrent result has no URL. When a local streaming server is
    // configured it joins the swarm and re-serves the file over HTTP, which is
    // how Stremio and Nuvio play these same streams; without one, hundreds of
    // torrents remain unplayable in a browser and are dropped as before.
    let url = stream.url;
    let viaTorrent = false;
    let transcoded = false;
    if (!url && stream.infoHash) {
      // A season pack without a file index gives no way to find the episode:
      // the server would pick the largest file, which is some other chapter.
      // Offering it would play the wrong one, so it is left out unless the
      // release itself is named after the episode that was asked for.
      if (
        options.episode &&
        !Number.isInteger(stream.fileIdx) &&
        !namesEpisode(haystack, options.episode)
      ) {
        continue;
      }
      // A release the browser can decode is served as it is; the rest needs
      // the server to remux it to HLS.
      // Without a file index the server picks the file, and the release name
      // is then all there is to go on: unless it says MP4 outright, the safe
      // form is the remux, which plays whatever the container turns out to be.
      const knownFile = Number.isInteger(stream.fileIdx) || /\bmp4\b|\bm4v\b|\bwebm\b/i.test(haystack);
      const plain =
        knownFile && looksWebPlayable(haystack) ? resolveTorrentUrl(stream.infoHash, stream.fileIdx) : null;
      const hls = plain ? null : resolveTorrentHlsUrl(stream.infoHash, stream.fileIdx);
      const resolved = plain ?? hls;
      if (!resolved) continue;
      url = resolved;
      viaTorrent = true;
      transcoded = Boolean(hls);
    }
    if (!url) continue;

    const height = detectHeight(haystack);
    const release = readRelease({
      title: stream.title || stream.name,
      description,
      filename,
      seeders: stream.behaviorHints?.seeders,
    });
    const copyId = (viaTorrent ? torrentKeyOf(url) : null) ?? shortHash(url.split("?")[0] ?? url, 20);
    const sizeBytes = stream.behaviorHints?.videoSize ?? parseSize(description) ?? parseSize(title);
    const base = {
      id: `${addon.id}:${copyId}`,
      copyId,
      releaseName: release.name || title,
      releaseTags: release.tags,
      languages: release.languages,
      seeders: release.seeders,
      addonId: addon.id,
      addonName: shortAddonName(addon.name),
      title,
      description,
      url,
      viaTorrent,
      quality: height ? `${height}p` : "auto",
      height,
      sizeBytes,
      sizeLabel: formatSize(sizeBytes),
      cached: /⚡|cached|instant|✅|ready/i.test(haystack),
      hdr: /\b(hdr|dolby vision|dovi|dv)\b/i.test(haystack),
      remux: /\bremux|blu-?ray\b/i.test(haystack),
      cam: /\b(cam|hdcam|telesync|telecine|\bts\b)\b/i.test(haystack),
      spanish: /\b(dual|latino|castellano|español|espanol|spanish|vose)\b/i.test(haystack),
      headers: stream.behaviorHints?.proxyHeaders?.request,
      filename,
      /** The server had to remux the release for the browser. */
      transcoded,
    };
    // A swarm-backed file only plays as well as its seeders and container, so
    // a well-seeded MP4/H.264 release outranks a bigger one that may stall.
    // Some addons state the seeders as a field instead of in the text. A
    // swarm nobody shares never starts: it is what left the player on
    // "Conectando…", so it goes to the bottom instead of first in line.
    const seeders = release.seeders;
    let seedBonus = 0;
    if (viaTorrent && seeders !== null) {
      if (seeders === 0) seedBonus = -45;
      else if (seeders < 3) seedBonus = -15;
      else if (!haystack.includes("👤")) seedBonus = Math.min(10, seeders / 50);
    }
    // Two decimals: enough to order by seeders without float noise in the API.
    const score =
      Math.round((scoreSource(base) + (viaTorrent ? webPlayableBonus(haystack) : 0) + seedBonus) * 100) / 100;
    sources.push({ ...base, score });
  }
  return sources.sort((a, b) => b.score - a.score);
}

export function dedupeSources(sources: VodSource[]): VodSource[] {
  const seen = new Set<string>();
  const out: VodSource[] = [];
  for (const source of sources) {
    // Two addons often index the same torrent: the same file is one source,
    // and the HLS form keeps the file in the query, not in the path.
    const key = source.copyId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}

/**
 * Takes sources from every addon in turn instead of from the first one.
 *
 * Each addon answers a popular film with hundreds of torrents (measured: 500
 * from Torrentio, 1006 from Comet, 154 from Meteor). Cutting the concatenated
 * list kept only the first addon's results, so the other three were installed,
 * answering, and never offered. Different addons index different swarms, and a
 * second swarm is exactly what the player needs when the first one stalls.
 *
 * The input keeps each addon's own order (best first); the output is ordered
 * by score.
 */
export function interleaveByAddon(sources: VodSource[], limit: number): VodSource[] {
  const queues = new Map<string, VodSource[]>();
  for (const source of sources) {
    const queue = queues.get(source.addonId);
    if (queue) queue.push(source);
    else queues.set(source.addonId, [source]);
  }
  const lists = [...queues.values()];
  const picked: VodSource[] = [];
  for (let round = 0; picked.length < limit; round++) {
    let took = false;
    for (const list of lists) {
      const source = list[round];
      if (!source) continue;
      took = true;
      picked.push(source);
      if (picked.length >= limit) break;
    }
    if (!took) break;
  }
  return picked.sort((a, b) => b.score - a.score);
}
