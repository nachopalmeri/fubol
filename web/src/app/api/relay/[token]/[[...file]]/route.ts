import fs from "node:fs/promises";
import { getSession } from "@/lib/auth";
import { sanitizeHeaders, verifyStreamToken } from "@/lib/stream-token";
import {
  ensureRelay,
  noteRelayProgress,
  RELAY_MIN_READY_SEGMENTS,
  relayAvailable,
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

  if (!relayAvailable()) {
    return Response.json(
      {
        error:
          "El relay con ffmpeg no está disponible en este despliegue. La sesión ya usa el modo directo.",
        code: "relay_unavailable",
      },
      { status: 503 },
    );
  }

  const height = relayHeight(payload.d);
  const headers = sanitizeHeaders(payload.h) ?? {};
  if (payload.r) headers.referer = payload.r;
  const key = relayKey(payload.u, headers, height);
  const started = ensureRelay({ key, url: payload.u, height, headers });
  if (!started.ok) {
    return Response.json({ error: started.error }, { status: started.status });
  }
  touchRelay(key);

  const isPlaylist = name === "index.m3u8";
  // hls.js aborts a manifest request at ten seconds by default, so waiting
  // twenty here only produced a client-side timeout. Stay inside its budget
  // and ask for a playlist deep enough to play, not just the first write.
  const relayed = await waitForRelayFile(
    started.dir,
    name,
    isPlaylist ? 8_000 : 6_000,
    isPlaylist ? RELAY_MIN_READY_SEGMENTS : 0,
  );
  if (!relayed) {
    return Response.json(
      { error: isPlaylist ? "La señal todavía no arrancó. Reintentá en unos segundos." : "Segmento no disponible" },
      {
        status: isPlaylist ? 503 : 404,
        headers: isPlaylist ? { "retry-after": "2" } : undefined,
      },
    );
  }

  try {
    if (isPlaylist) {
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
    noteRelayProgress(key);
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
