import { signToken, verifyToken } from "./crypto";

export interface StreamTokenPayload extends Record<string, unknown> {
  u: string;
  r?: string;
  h?: Record<string, string>;
  s?: string;
  k?: "live" | "vod";
  d?: string;
}

const ALLOWED_HEADERS = new Set(["user-agent", "referer", "origin", "accept", "accept-language"]);

export function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (!ALLOWED_HEADERS.has(lower)) continue;
    if (typeof value !== "string" || value.length > 500) continue;
    safe[lower] = value;
  }
  return Object.keys(safe).length ? safe : undefined;
}

export function signStreamUrl(
  url: string,
  options: { referer?: string; headers?: Record<string, string>; sourceId?: string; kind?: "live" | "vod" } = {},
  ttlMs = 6 * 3600_000,
): string {
  const token = signToken(
    {
      u: url,
      ...(options.referer ? { r: options.referer } : {}),
      ...(options.headers ? { h: sanitizeHeaders(options.headers) } : {}),
      ...(options.sourceId ? { s: options.sourceId } : {}),
      ...(options.kind ? { k: options.kind } : {}),
    },
    ttlMs,
  );
  return `/api/stream?t=${encodeURIComponent(token)}`;
}

export function verifyStreamToken(token: string | null | undefined): StreamTokenPayload | null {
  return verifyToken<StreamTokenPayload>(token);
}

/** Signed URL for the local compatibility relay (re-encodes broken HLS for the browser). */
export function signRelayUrl(
  url: string,
  options: { referer?: string; headers?: Record<string, string>; sourceId?: string; height?: number } = {},
  ttlMs = 6 * 3600_000,
): string {
  const token = signToken(
    {
      u: url,
      ...(options.referer ? { r: options.referer } : {}),
      ...(options.headers ? { h: sanitizeHeaders(options.headers) } : {}),
      ...(options.sourceId ? { s: options.sourceId } : {}),
      k: "live",
      d: String(options.height ?? 720),
    },
    ttlMs,
  );
  return `/api/relay/${token}/index.m3u8`;
}

export function signSubtitleUrl(url: string, ttlMs = 12 * 3600_000): string {
  const token = signToken({ u: url, k: "vod" }, ttlMs);
  return `/api/subtitles/proxy?t=${encodeURIComponent(token)}`;
}
