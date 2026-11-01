import { verifyStreamToken } from "@/lib/stream-token";
import { fetchSubtitleAsVtt } from "@/lib/subs/service";
import { logger } from "@/lib/logger";
import { sanitizeUrl } from "@/lib/crypto";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t");
  const payload = verifyStreamToken(token);
  if (!payload) return new Response("Token inválido", { status: 401 });
  const session = await getSession();
  if (!session) return new Response("No autorizado", { status: 401 });
  if (session.role === "link" && !session.permissions.includes("vod")) return new Response("Sin permiso", { status: 403 });
  try {
    const { vtt, cached } = await fetchSubtitleAsVtt(payload.u, {
      headers: payload.h,
      referer: payload.r,
    });
    return new Response(vtt, {
      headers: {
        "content-type": "text/vtt; charset=utf-8",
        "cache-control": "private, no-store",
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
