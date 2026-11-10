import { clientIp, json, requireSession, route } from "@/lib/api";
import { buildLiveSession } from "@/lib/live/session";
import { AddonSetupRequired } from "@/lib/addons";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("live_session", async (request) => {
  // Named `viewer`, not `session`: the live session built below used to shadow
  // it inside the try block, which made the catch block's `session.role`
  // read like a bug even though it resolved to the outer binding.
  const viewer = await requireSession("live");
  const channelId = new URL(request.url).searchParams.get("channel");
  if (!channelId) return json({ error: "Falta el canal" }, { status: 400 });

  // Each call fires up to six parallel probes at external origins, and
  // "Reanalizar" is a manual trigger. Several relatives refreshing at kickoff
  // was enough to earn the HTTP 429 the earlier sweeps recorded, so the
  // expensive path gets its own budget rather than none at all.
  const bucket = viewer.role === "admin" ? "admin" : `link:${viewer.code}`;
  if (!rateLimit(`live_session:${bucket}:${clientIp(request)}`, 30, 60_000)) {
    return json(
      { error: "Demasiados reintentos seguidos. Esperá unos segundos.", channelId },
      { status: 429, headers: { "retry-after": "10" } },
    );
  }
  try {
    return json(await buildLiveSession(channelId));
  } catch (error) {
    if (error instanceof AddonSetupRequired) {
      return json({
        error: viewer.role === "admin" ? error.message : "La fuente necesita actualizarse. Avisale a quien administra este espacio.",
        code: "source_setup_required",
        ...(viewer.role === "admin" ? { configureUrl: error.configureUrl } : {}),
        channelId,
      }, { status: 409 });
    }
    return json(
      { error: error instanceof Error ? error.message : "Sin señal disponible", channelId },
      { status: 404 },
    );
  }
});
