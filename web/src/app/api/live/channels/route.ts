import { json, requireSession, route } from "@/lib/api";
import { getAllChannels, searchChannels } from "@/lib/live/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("live_channels", async (request) => {
  await requireSession("live");
  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";
  // The sports catalogs add up to a couple of hundred channels; a default of 80
  // hid most of them (tennis, golf, cricket…) behind a total that the browser
  // could not scroll to.
  const limit = Math.min(400, Number(params.get("limit") ?? 200) || 200);
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
