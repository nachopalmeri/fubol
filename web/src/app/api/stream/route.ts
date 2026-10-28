import { fetchUpstream, readTextLimited, detectGate, looksLikePlaylist, UpstreamError } from "@/lib/http";
import { signStreamUrl, verifyStreamToken, sanitizeHeaders } from "@/lib/stream-token";
import { rewritePlaylist } from "@/lib/live/playlist";
import { noteFailure, noteSuccess } from "@/lib/live/rank";
import { logger } from "@/lib/logger";
import { sanitizeUrl } from "@/lib/crypto";

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

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t");
  const payload = verifyStreamToken(token);
  if (!payload) {
    return Response.json({ error: "Token inválido" }, { status: 401 });
  }

  const headers = sanitizeHeaders(payload.h) ?? {};
  if (payload.r) headers.referer = payload.r;
  const remainingTtl = Math.max(60_000, Number(payload.exp) - Date.now());
  const range = request.headers.get("range") ?? undefined;

  try {
    const { res, finalUrl } = await fetchUpstream(payload.u, {
      headers,
      range,
      timeoutMs: 15_000,
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
      noteSuccess(payload.u);
      return new Response(rewritten, {
        status: 200,
        headers: {
          "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (!res.ok) {
      noteFailure(payload.u);
      return new Response(`Origen ${res.status}`, { status: res.status >= 500 ? 502 : res.status });
    }

    noteSuccess(payload.u);
    const outHeaders = new Headers();
    for (const name of PASS_HEADERS) {
      const value = res.headers.get(name);
      if (value) outHeaders.set(name, value);
    }
    outHeaders.set("cache-control", "public, max-age=2");
    return new Response(res.body, { status: res.status, headers: outHeaders });
  } catch (error) {
    noteFailure(payload.u);
    const status = error instanceof UpstreamError ? error.status : 502;
    logger.warn("stream_proxy_error", {
      target: sanitizeUrl(payload.u),
      status,
      error: error instanceof Error ? error.message : "error",
    });
    return new Response(error instanceof Error ? error.message : "Proxy error", { status });
  }
}
