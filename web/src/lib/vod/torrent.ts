/**
 * Turns an addon's BitTorrent result into something a browser can open.
 *
 * Torrentio and the user's own AIOStreams answer a movie with hundreds of
 * streams that carry only an `infoHash` and no URL: measured 2026-11-01, 100
 * and 522 respectively, zero HTTP URLs between them. An HTML `<video>` element
 * cannot open a torrent, which is why the VOD half of the app had nothing to
 * play without a paid debrid subscription.
 *
 * Stremio solves this with its own streaming server, which joins the swarm and
 * re-serves the selected file over plain HTTP with Range support. It is free,
 * self-hosted and the exact mechanism Stremio and Nuvio use. Verified against
 * `stremio/server:4.22.5`: a Torrentio infoHash returned HTTP 206,
 * `content-type: video/mp4`, and the payload began with an `ftyp` box.
 */

/** Base URL of the streaming server, e.g. http://stremio-server:11470 */
export function torrentServerBase(): string | undefined {
  const value = process.env.FUBOL_TORRENT_SERVER?.trim();
  if (value) return value.replace(/\/+$/, "");
  return overrideBase;
}

/**
 * Runtime override, set from the panel.
 *
 * The resolver is the piece that turns a torrent into bytes, and where it
 * lives changes with the deployment: a container next to the app on the LAN,
 * or a public instance when the app runs on Vercel. Keeping it in the state
 * lets the admin point the app at it without a redeploy, which the
 * environment variable could not do.
 */
let overrideBase: string | undefined;

export function setTorrentServerBase(value: string | undefined): void {
  overrideBase = value?.trim() ? value.trim().replace(/\/+$/, "") : undefined;
}

/**
 * How the resolver sees itself.
 *
 * The HLS endpoint takes the media path as a query parameter, and that path is
 * resolved by the resolver itself, not by whoever asks for the playlist. With
 * the containerised server that address is its own loopback.
 */
let mediaBase: string | undefined;

export function setTorrentServerMediaBase(value: string | undefined): void {
  mediaBase = value?.trim() ? value.trim().replace(/\/+$/, "") : undefined;
}

export function torrentServerMediaBase(): string {
  return mediaBase ?? "http://127.0.0.1:11470";
}

/**
 * Whether the resolver answers right now.
 *
 * The resolver is a separate process behind a tunnel: it can die, and the
 * tunnel URL changes every time it restarts. When that happens the app would
 * say "this title has no sources", which is true and useless. Knowing that
 * the resolver is down is the difference between "nothing to play here" and
 * "the machine that plays the torrents is off".
 */
export interface ResolverStatus {
  configured: boolean;
  reachable: boolean;
  url: string | null;
}

let resolverProbe: { at: number; url: string; status: ResolverStatus } | null = null;

export async function resolverStatus(timeoutMs = 4000): Promise<ResolverStatus> {
  const base = torrentServerBase();
  if (!base) return { configured: false, reachable: false, url: null };
  // The cache is keyed by the address: when the tunnel is republished the
  // address changes, and a status measured for the old one says nothing about
  // the new one.
  if (resolverProbe && resolverProbe.url === base && Date.now() - resolverProbe.at < 20_000) {
    return resolverProbe.status;
  }
  let reachable = false;
  try {
    const res = await fetch(`${base}/settings`, { signal: AbortSignal.timeout(timeoutMs) });
    reachable = res.ok;
    await res.body?.cancel();
  } catch {
    reachable = false;
  }
  const status: ResolverStatus = { configured: true, reachable, url: base };
  resolverProbe = { at: Date.now(), url: base, status };
  return status;
}

/**
 * Refreshes the resolver address from the shared state.
 *
 * The address lives in the state document so it can be changed from the panel
 * without a redeploy, but the app runs on many instances: reading it only at
 * boot would leave every instance that started before the change without a
 * resolver. The state read is memoized, so this costs nothing per request.
 */
let lastSync = 0;

export async function syncTorrentServerSettings(): Promise<void> {
  const now = Date.now();
  if (now - lastSync < 3_000) return;
  lastSync = now;
  try {
    const { getSetting } = await import("../state/settings");
    setTorrentServerBase(await getSetting("torrentServer"));
    setTorrentServerMediaBase(await getSetting("torrentServerMediaBase"));
  } catch {
    // Keep whatever is in memory; the state read can fail on a cold start.
  }
}

/**
 * Playlist URL for a torrent when the release is not playable as it is.
 *
 * Torrent releases are MKV with HEVC or x265, which no browser decodes. The
 * streaming server remuxes them to fragmented MP4 over HLS, which is the same
 * thing Stremio does with the very same addons. Without it the title is
 * simply not offered: a browser cannot open a torrent, and pretending
 * otherwise is how you get a player that never starts.
 */
export function resolveTorrentHlsUrl(infoHash: string | undefined, fileIdx: number | undefined): string | null {
  const base = torrentServerBase();
  if (!base || !infoHash || !INFO_HASH.test(infoHash)) return null;
  const hash = infoHash.toLowerCase();
  const index = torrentFileIndex(fileIdx);
  const media = `${torrentServerMediaBase()}/${hash}/${index}`;
  // The path segment after `hlsv2` names the transcoding session, and the
  // server keeps answering from a live session whatever `mediaURL` says. With
  // one fixed name for every title, asking for a film while another was still
  // open returned the other film's playlist (measured against
  // stremio/server 4.22.5). One session per file keeps two screens of the
  // house, or one screen changing title, from stepping on each other.
  const session = `${hash}-${index < 0 ? "auto" : index}`;
  return `${base}/hlsv2/${session}/video0.m3u8?mediaURL=${encodeURIComponent(media)}&profile=h264&maxWidth=1280`;
}

/**
 * Which file of the torrent to serve.
 *
 * Many results carry no `fileIdx` (measured: 206 of 500 from Torrentio, 675
 * of 1006 from Comet, every MediaFusion movie). Assuming the first file is
 * wrong whenever the torrent starts with a sample or a text file; `-1` asks
 * the streaming server to pick the largest video itself, which is what
 * Stremio sends in the same situation.
 */
export function torrentFileIndex(fileIdx: number | undefined): number {
  return Number.isInteger(fileIdx) && (fileIdx as number) >= 0 ? (fileIdx as number) : -1;
}

/**
 * The torrent file a resolver URL points at, as `hash/index`.
 *
 * The plain URL carries it in the path and the HLS one inside `mediaURL`, so
 * comparing URLs as text cannot tell that two entries are the same file.
 */
export function torrentKeyOf(url: string): string | null {
  let text = url;
  try {
    text = decodeURIComponent(url);
  } catch {
    // A malformed escape: fall back to the raw text.
  }
  // The session segment repeats the hash; the file is the one in the media path.
  const match = /([0-9a-f]{40})\/(-?\d+)(?![0-9a-f])/i.exec(text.replace(/\/hlsv2\/[^/]+\//, "/hlsv2/"));
  return match?.[1] && match[2] ? `${match[1].toLowerCase()}/${match[2]}` : null;
}

/**
 * The plain file behind a resolver URL, remuxed or not.
 *
 * Aligning subtitles against the audio only needs the first minutes of sound.
 * Asking the HLS form for it makes the resolver transcode video nobody will
 * watch; the plain file is read with range requests and only the audio is
 * decoded.
 */
export function directMediaUrl(url: string): string {
  const base = torrentServerBase();
  if (!base || !url.startsWith(`${base}/`)) return url;
  const key = torrentKeyOf(url);
  return key ? `${base}/${key}` : url;
}

export function torrentResolverEnabled(): boolean {
  return torrentServerBase() !== undefined;
}

const INFO_HASH = /^[0-9a-f]{40}$/i;

/**
 * Stream URL for a torrent file. Returns null when the resolver is not
 * configured or the hash is not a 40-character hex info hash, so a malformed
 * addon response can never be turned into a request.
 */
export function resolveTorrentUrl(infoHash: string | undefined, fileIdx: number | undefined): string | null {
  const base = torrentServerBase();
  if (!base || !infoHash || !INFO_HASH.test(infoHash)) return null;
  return `${base}/${infoHash.toLowerCase()}/${torrentFileIndex(fileIdx)}`;
}

/**
 * Whether the file behind a torrent is likely to decode in a browser at all.
 *
 * The swarm is full of MKV and HEVC releases that no browser can play, and
 * joining a swarm only to discover that costs tens of seconds. Judging the
 * release name first keeps the expensive container probe for candidates that
 * can actually succeed. This is a filter on probability, not a guarantee: the
 * real decision still comes from sniffing the container.
 */
export function looksWebPlayable(haystack: string): boolean {
  const text = haystack.toLowerCase();
  // Matroska and HEVC/AV1 are the common dead ends in browsers.
  if (/\bmkv\b|\bx265\b|\bh\.?265\b|\bhevc\b|\bav1\b/.test(text)) return false;
  if (/\bavi\b|\bwmv\b|\bmpeg-?2\b|\bdivx\b|\bxvid\b/.test(text)) return false;
  return true;
}

/** Ranks a web-friendly release above one that merely might work. */
export function webPlayableBonus(haystack: string): number {
  const text = haystack.toLowerCase();
  let bonus = 0;
  if (/\bmp4\b/.test(text)) bonus += 12;
  if (/\bx264\b|\bh\.?264\b|\bavc\b/.test(text)) bonus += 10;
  if (/\baac\b/.test(text)) bonus += 4;
  // A torrent nobody is seeding will never finish buffering.
  const seeds = /👤\s*(\d+)/.exec(haystack);
  if (seeds?.[1]) bonus += Math.min(10, Number(seeds[1]) / 50);
  return bonus;
}
