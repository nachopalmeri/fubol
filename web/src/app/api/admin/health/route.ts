import { json, requireAdmin, route } from "@/lib/api";
import { listLiveSources } from "@/lib/live/sources";
import { getAllChannels } from "@/lib/live/sources";
import { listAddonRows } from "@/lib/vod/store";
import { listShareLinks } from "@/lib/links";
import { relayStatus } from "@/lib/live/relay";
import { recentChecks } from "@/lib/metrics";
import { storageInfo } from "@/lib/state";
import { egressInfo } from "@/lib/egress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SourceStats {
  total: number;
  ok: number;
  ttfb: number;
  maxEdge: number | null;
  measured: number;
  implausible: number;
  unknown: number;
  last: number;
}

function aggregate(): Map<string, SourceStats> {
  const stats = new Map<string, SourceStats>();
  for (const check of recentChecks(24 * 3600_000)) {
    const key = check.sourceId ?? "unknown";
    const entry = stats.get(key) ?? {
      total: 0,
      ok: 0,
      ttfb: 0,
      maxEdge: null,
      measured: 0,
      implausible: 0,
      unknown: 0,
      last: 0,
    };
    entry.total += 1;
    if (check.ok) entry.ok += 1;
    entry.ttfb += check.ttfbMs;
    if (check.edgeAgeS !== null) entry.maxEdge = Math.max(entry.maxEdge ?? 0, check.edgeAgeS);
    if (check.edgeTrust === "measured" || check.edgeTrust === "extrapolated") entry.measured += 1;
    else if (check.edgeTrust === "implausible") entry.implausible += 1;
    else entry.unknown += 1;
    entry.last = Math.max(entry.last, check.checkedAt);
    stats.set(key, entry);
  }
  return stats;
}

export const GET = route("admin_health", async () => {
  await requireAdmin();
  // Counting how often a source's delay could actually be measured is the
  // difference between "our sources are fast" and "our sources do not say".
  // The numbers come from this instance's ring buffer: the app also runs where
  // there is no shared disk to keep a check history.
  const stats = aggregate();
  const channels = await getAllChannels().catch(() => []);
  const bySource = new Map<string, number>();
  for (const channel of channels) {
    bySource.set(channel.sourceId, (bySource.get(channel.sourceId) ?? 0) + 1);
  }
  const sources = (await listLiveSources(true)).map((source) => {
    const entry = stats.get(source.id);
    return {
      id: source.id,
      name: source.name,
      kind: source.kind,
      enabled: source.enabled,
      channels: bySource.get(source.id) ?? 0,
      checks: entry?.total ?? 0,
      okRate: entry?.total ? Math.round((entry.ok / entry.total) * 100) : null,
      avgTtfbMs: entry?.total ? Math.round(entry.ttfb / entry.total) : null,
      maxEdgeAgeS: entry?.maxEdge ?? null,
      /** How many checks produced a delay number we are willing to show. */
      delayMeasured: entry?.measured ?? 0,
      /** Origin clocks that place their newest frame at or after "now". */
      delayImplausible: entry?.implausible ?? 0,
      /** Playlists with no usable PROGRAM-DATE-TIME at all. */
      delayUnknown: entry?.unknown ?? 0,
      lastCheck: entry?.last || null,
    };
  });
  const links = await listShareLinks();
  return json({
    sources,
    totalChannels: channels.length,
    addons: (await listAddonRows(undefined, true)).length,
    links: links.filter((link) => !link.revokedAt).length,
    relay: relayStatus(),
    storage: storageInfo(),
    network: await egressInfo(),
  });
});
