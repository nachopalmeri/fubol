import { json, readJson, requireSession, route } from "@/lib/api";
import { verifyStreamToken } from "@/lib/stream-token";
import { fetchSubtitleAsVtt, audioSync } from "@/lib/subs/service";
import { estimateOffset } from "@/lib/subs/sync";
import { parseCues } from "@/lib/subs/format";
import { getSync, setSync } from "@/lib/state/sync";

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
    // Both tokens must belong to the VOD side. Without this a link holding
    // only the `vod` permission could hand in a signed *live* stream token and
    // have the server run ffmpeg against a channel it may not watch.
    if (streamPayload.k !== "vod" || (subtitlePayload.k && subtitlePayload.k !== "vod")) {
      return json({ error: "Este token no corresponde a una película o serie" }, { status: 403 });
    }
    // Already measured? The alignment belongs to the copy, not to the device:
    // answering from the shared state saves every other screen the wait.
    const titleId = typeof subtitlePayload.t === "string" ? subtitlePayload.t : null;
    if (titleId) {
      const known = await getSync(titleId, streamPayload.s ?? "unknown").catch(() => null);
      if (known) {
        return json({
          offsetMs: known.offsetMs,
          confidence: known.confidence,
          source: known.source,
          cached: true,
        });
      }
    }
    const result = await audioSync(subtitlePayload.u, streamPayload.u);
    if (titleId && streamPayload.s) {
      await setSync(titleId, streamPayload.s, {
        offsetMs: result.offsetMs,
        confidence: result.confidence,
        source: "audio",
      }).catch(() => undefined);
    }
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
