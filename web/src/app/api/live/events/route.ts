import { json, requireSession, route } from "@/lib/api";
import { getFixtures, matchFixtureChannels } from "@/lib/live/fixtures";
import { getAllChannels } from "@/lib/live/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("live_events", async (request) => {
  await requireSession("live");
  const params = new URL(request.url).searchParams;
  const withChannels = params.get("channels") === "1";
  const fixtures = await getFixtures({ daysBack: 0, daysForward: 1 });
  if (!withChannels) return json({ fixtures });

  const channels = await getAllChannels().catch(() => []);
  const enriched = fixtures.map((fixture) => {
    const match = matchFixtureChannels(fixture, channels);
    return {
      ...fixture,
      channelCount: match.channels.length,
      channels: match.channels.slice(0, 4).map((channel) => ({
        id: channel.id,
        name: channel.name,
        sourceName: channel.sourceName,
      })),
    };
  });
  return json({ fixtures: enriched });
});
