import { verifyStreamToken } from "@/lib/stream-token";
import { fetchSubtitleAsVtt } from "@/lib/subs/service";
import { logger } from "@/lib/logger";
import { sanitizeUrl } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t");
  const payload = verifyStreamToken(token);
  if (!payload) return new Response("Token inválido", { status: 401 });
  try {
    const { vtt, cached } = await fetchSubtitleAsVtt(payload.u, {
      headers: payload.h,
      referer: payload.r,
    });
    return new Response(vtt, {
      headers: {
        "content-type": "text/vtt; charset=utf-8",
        "cache-control": "private, max-age=3600",
        "x-subtitle-cache": cached ? "hit" : "miss",
      },
    });
  } catch (error) {
    logger.warn("subtitle_proxy_failed", {
      target: sanitizeUrl(payload.u),
      error: error instanceof Error ? error.message : "error",
    });
    return new Response("No se pudo obtener el subtítulo", { status: 502 });
  }
}
