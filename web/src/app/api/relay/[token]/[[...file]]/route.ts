import fs from "node:fs/promises";
import { getSession } from "@/lib/auth";
import { sanitizeHeaders, verifyStreamToken } from "@/lib/stream-token";
import {
  ensureRelay,
  relayContentType,
  relayFileName,
  relayHeight,
  relayKey,
  touchRelay,
  waitForRelayFile,
} from "@/lib/live/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; file?: string[] }> },
): Promise<Response> {
  const { token, file } = await context.params;
  const payload = verifyStreamToken(token);
  if (!payload || payload.k !== "live") {
    return Response.json({ error: "Token inválido" }, { status: 401 });
  }
  const session = await getSession();
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (session.role === "link" && !session.permissions.includes("live")) {
    return Response.json({ error: "Sin permiso para esta señal" }, { status: 403 });
  }
  if (!file || file.length !== 1) {
    return Response.json({ error: "Archivo inválido" }, { status: 404 });
  }
  const name = relayFileName(file[0]);
  if (!name) return Response.json({ error: "Archivo inválido" }, { status: 404 });

  const height = relayHeight(payload.d);
  const headers = sanitizeHeaders(payload.h) ?? {};
  if (payload.r) headers.referer = payload.r;
  const key = relayKey(payload.u, headers, height);
  const started = ensureRelay({ key, url: payload.u, height, headers });
  if (!started.ok) {
    return Response.json({ error: started.error }, { status: started.status });
  }
  touchRelay(key);

  const relayed = await waitForRelayFile(started.dir, name, name === "index.m3u8" ? 20_000 : 6_000);
  if (!relayed) {
    return Response.json(
      { error: name === "index.m3u8" ? "La señal no respondió a tiempo" : "Segmento no disponible" },
      { status: name === "index.m3u8" ? 504 : 404 },
    );
  }

  try {
    if (name === "index.m3u8") {
      const playlist = await fs.readFile(relayed, "utf8");
      if (!playlist.trimStart().startsWith("#EXTM3U")) {
        return Response.json({ error: "Señal inválida" }, { status: 502 });
      }
      return new Response(playlist, {
        status: 200,
        headers: {
          "content-type": relayContentType(name),
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
    const segment = await fs.readFile(relayed);
    return new Response(new Uint8Array(segment), {
      status: 200,
      headers: {
        "content-type": relayContentType(name),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Archivo no disponible" }, { status: 404 });
  }
}
