import { json, requireSession, route } from "@/lib/api";
import { getAllChannels, searchChannels } from "@/lib/live/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("live_channels", async (request) => {
  await requireSession("live");
  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";
  const limit = Math.min(200, Number(params.get("limit") ?? 80) || 80);
  const channels = await getAllChannels();
  const filtered = query ? searchChannels(channels, query, limit) : channels.slice(0, limit);
  return json({
    total: channels.length,
    channels: filtered.map((channel) => ({
      id: channel.id,
      name: channel.name,
      group: channel.group,
      logo: channel.logo,
      sourceName: channel.sourceName,
      kind: channel.kind,
    })),
  });
});
