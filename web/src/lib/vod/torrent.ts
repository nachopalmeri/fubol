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
  const index = Number.isInteger(fileIdx) && (fileIdx as number) >= 0 ? (fileIdx as number) : 0;
  return `${base}/${infoHash.toLowerCase()}/${index}`;
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
