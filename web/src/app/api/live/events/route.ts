import { json, requireSession, route } from "@/lib/api";
import { getFixtures, matchFixtureChannels, mergeChannelFixtures } from "@/lib/live/fixtures";
import { getAllChannels } from "@/lib/live/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("live_events", async (request) => {
  await requireSession("live");
  const params = new URL(request.url).searchParams;
  const withChannels = params.get("channels") === "1";
  const [scheduled, channels] = await Promise.all([
    getFixtures({ daysBack: 0, daysForward: 1 }),
    getAllChannels().catch(() => []),
  ]);
  // Live catalogs list individual matches as channels. Those are the only
  // matches the app can actually open, so they belong in the agenda too.
  const fixtures = mergeChannelFixtures(scheduled, channels);
  if (!withChannels) return json({ fixtures });

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
