import { json, readJson, requireSession, route } from "@/lib/api";
import { verifyStreamToken } from "@/lib/stream-token";
import { fetchSubtitleAsVtt, audioSync } from "@/lib/subs/service";
import { estimateOffset } from "@/lib/subs/sync";
import { parseCues } from "@/lib/subs/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  mode?: "reference" | "audio";
  reference?: string;
  target?: string;
  stream?: string;
}

export const POST = route("subtitle_sync", async (request) => {
  await requireSession("vod");
  const body = await readJson<Body>(request);
  const mode = body.mode ?? "reference";

  if (mode === "audio") {
    const subtitlePayload = verifyStreamToken(body.target);
    const streamPayload = verifyStreamToken(body.stream);
    if (!subtitlePayload || !streamPayload) {
      return json({ error: "Tokens inválidos" }, { status: 401 });
    }
    const result = await audioSync(subtitlePayload.u, streamPayload.u);
    return json(result);
  }

  const referencePayload = verifyStreamToken(body.reference);
  const targetPayload = verifyStreamToken(body.target);
  if (!referencePayload || !targetPayload) {
    return json({ error: "Tokens inválidos" }, { status: 401 });
  }

  const [reference, target] = await Promise.all([
    fetchSubtitleAsVtt(referencePayload.u, { headers: referencePayload.h }),
    fetchSubtitleAsVtt(targetPayload.u, { headers: targetPayload.h }),
  ]);

  const estimate = estimateOffset(parseCues(reference.vtt), parseCues(target.vtt));
  return json({ ...estimate, source: "reference" });
});
