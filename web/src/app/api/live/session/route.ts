import { json, requireSession, route } from "@/lib/api";
import { buildLiveSession } from "@/lib/live/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("live_session", async (request) => {
  await requireSession("live");
  const channelId = new URL(request.url).searchParams.get("channel");
  if (!channelId) return json({ error: "Falta el canal" }, { status: 400 });
  try {
    const session = await buildLiveSession(channelId);
    return json(session);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Sin señal disponible", channelId },
      { status: 404 },
    );
  }
});
