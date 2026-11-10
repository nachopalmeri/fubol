import { fetchUpstream, readTextLimited, detectGate, looksLikePlaylist, UpstreamError } from "@/lib/http";
import { signStreamUrl, verifyStreamToken, sanitizeHeaders } from "@/lib/stream-token";
import { rewritePlaylist } from "@/lib/live/playlist";
import { noteFailure, noteSuccess } from "@/lib/live/rank";
import { logger } from "@/lib/logger";
import { sanitizeUrl } from "@/lib/crypto";
import { getSession } from "@/lib/auth";
import { torrentServerBase } from "@/lib/vod/torrent";
import { getStreams } from "@/lib/addons";
import { getLiveSource } from "@/lib/live/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASS_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

/**
 * Stable part of a stream URL, used to pick the same variant after the addon
 * is asked again: `/m3u/now-sky-sports-premiere/live.m3u8` keeps the channel
 * slug whatever token the provider mints.
 */
function streamKey(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const slug = parts.length > 1 ? (parts[parts.length - 2] ?? last) : last;
    return slug.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Asks the addon for the stream again.
 *
 * The provider mints the stream URL with a token that names the IP that asked
 * for it, and rejects the same URL from any other address ("Stream already
 * active on another device"). On a platform where each request leaves from a
 * different address, the URL resolved when the session was built is dead by
 * the time the player asks for it, so the addon is queried here — from the
 * same request that will fetch the playlist.
 */
async function resolveAddonTarget(
  ref: { i: string; t: string; s: string },
  original: string,
): Promise<string | null> {
  const source = await getLiveSource(ref.s);
  if (!source) return null;
  const addonRef = { id: source.id, name: source.name, url: source.url, kind: "live" as const };
  const streams = await getStreams(addonRef, ref.t, ref.i, { fresh: true });
  const usable = streams.filter((stream): stream is typeof stream & { url: string } => Boolean(stream.url));
  if (usable.length === 0) return null;
  const key = streamKey(original);
  const match = usable.find((stream) => streamKey(stream.url) === key);
  return (match ?? usable[0]!).url;
}

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t");
  const payload = verifyStreamToken(token);
  if (!payload) {
    return Response.json({ error: "Token inválido" }, { status: 401 });
  }
  const session = await getSession();
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (session.role === "link" && (!payload.k || !session.permissions.includes(payload.k))) {
    return Response.json({ error: "Sin permiso para esta señal" }, { status: 403 });
  }

  const headers = sanitizeHeaders(payload.h) ?? {};
  if (payload.r) headers.referer = payload.r;
  const remainingTtl = Math.max(60_000, Number(payload.exp) - Date.now());
  const range = request.headers.get("range") ?? undefined;

  // The upstream URL may have been minted by another instance, from another
  // address, and the provider only honours it for the address that asked for
  // it. Re-resolving here keeps both requests on the same one.
  let target = payload.u;
  if (payload.a) {
    try {
      const fresh = await resolveAddonTarget(payload.a, payload.u);
      if (fresh) target = fresh;
    } catch (error) {
      logger.warn("stream_addon_resolve_failed", {
        sourceId: payload.s,
        error: error instanceof Error ? error.message : "error",
      });
    }
  }

  // A swarm-backed file has to find peers before the first byte arrives:
  // measured at 63.7 s against a cold torrent and 6.6 s once the streaming
  // server had the pieces. The ordinary 15 s budget turned every first play
  // into a 504, so the local torrent server gets a longer one.
  const base = torrentServerBase();
  const viaTorrent = base !== undefined && target.startsWith(`${base}/`);

  try {
    const { res, finalUrl } = await fetchUpstream(target, {
      headers,
      range,
      timeoutMs: viaTorrent ? 90_000 : 15_000,
      signal: request.signal,
    });

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const isPlaylist =
      /mpegurl|m3u8/.test(contentType) || /\.m3u8?(\?|$)/i.test(finalUrl);

    if (isPlaylist) {
      if (!res.ok) throw new UpstreamError(`El origen respondió ${res.status}`, 502);
      const text = await readTextLimited(res, 2_500_000);
      const gate = detectGate(text);
      if (gate) throw new UpstreamError(`La fuente pide ${gate}`, 502);
      if (!looksLikePlaylist(text)) throw new UpstreamError("Playlist inválida", 502);

      const rewritten = rewritePlaylist(text, finalUrl, (absolute) =>
        signStreamUrl(
          absolute,
          { headers: payload.h, referer: payload.r, sourceId: payload.s, kind: payload.k },
          remainingTtl,
        ),
      );
      noteSuccess(target);
      return new Response(rewritten, {
        status: 200,
        headers: {
          "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (!res.ok) {
      noteFailure(target);
      return new Response(`Origen ${res.status}`, { status: res.status >= 500 ? 502 : res.status });
    }

    noteSuccess(target);
    const outHeaders = new Headers();
    for (const name of PASS_HEADERS) {
      const value = res.headers.get(name);
      if (value) outHeaders.set(name, value);
    }
    outHeaders.set("cache-control", "private, no-store");
    return new Response(res.body, { status: res.status, headers: outHeaders });
  } catch (error) {
    noteFailure(target);
    const status = error instanceof UpstreamError ? error.status : 502;
    logger.warn("stream_proxy_error", {
      target: sanitizeUrl(payload.u),
      status,
      error: error instanceof Error ? error.message : "error",
    });
    return new Response(error instanceof Error ? error.message : "Proxy error", { status });
  }
}
