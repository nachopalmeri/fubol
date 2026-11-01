import { json, requireSession, route } from "@/lib/api";
import { buildLiveSession } from "@/lib/live/session";
import { AddonSetupRequired } from "@/lib/addons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("live_session", async (request) => {
  const session = await requireSession("live");
  const channelId = new URL(request.url).searchParams.get("channel");
  if (!channelId) return json({ error: "Falta el canal" }, { status: 400 });
  try {
    const session = await buildLiveSession(channelId);
    return json(session);
  } catch (error) {
    if (error instanceof AddonSetupRequired) {
      return json({
        error: session.role === "admin" ? error.message : "La fuente necesita actualizarse. Avisale a quien administra este espacio.",
        code: "source_setup_required",
        ...(session.role === "admin" ? { configureUrl: error.configureUrl } : {}),
        channelId,
      }, { status: 409 });
    }
    return json(
      { error: error instanceof Error ? error.message : "Sin señal disponible", channelId },
      { status: 404 },
    );
  }
});
