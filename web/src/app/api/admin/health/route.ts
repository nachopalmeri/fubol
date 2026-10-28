import { json, requireAdmin, route } from "@/lib/api";
import { all } from "@/lib/db";
import { listLiveSources } from "@/lib/live/sources";
import { getAllChannels } from "@/lib/live/sources";
import { listAddonRows } from "@/lib/vod/store";
import { listShareLinks } from "@/lib/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CheckRow {
  source_id: string | null;
  total: number;
  ok: number;
  avg_ttfb: number | null;
  max_edge: number | null;
  last: number;
}

export const GET = route("admin_health", async () => {
  await requireAdmin();
  const since = Date.now() - 24 * 3600_000;
  const checks = all<CheckRow>(
    `SELECT source_id, COUNT(*) AS total, SUM(ok) AS ok,
            AVG(ttfb_ms) AS avg_ttfb, MAX(edge_age_s) AS max_edge, MAX(checked_at) AS last
     FROM source_checks WHERE checked_at > ? GROUP BY source_id`,
    since,
  );
  const channels = await getAllChannels().catch(() => []);
  const bySource = new Map<string, number>();
  for (const channel of channels) {
    bySource.set(channel.sourceId, (bySource.get(channel.sourceId) ?? 0) + 1);
  }
  const sources = listLiveSources(true).map((source) => {
    const stats = checks.find((check) => check.source_id === source.id);
    return {
      id: source.id,
      name: source.name,
      kind: source.kind,
      enabled: source.enabled,
      channels: bySource.get(source.id) ?? 0,
      checks: stats?.total ?? 0,
      okRate: stats?.total ? Math.round((stats.ok / stats.total) * 100) : null,
      avgTtfbMs: stats?.avg_ttfb ? Math.round(stats.avg_ttfb) : null,
      maxEdgeAgeS: stats?.max_edge ?? null,
      lastCheck: stats?.last ?? null,
    };
  });
  return json({
    sources,
    totalChannels: channels.length,
    addons: listAddonRows(undefined, true).length,
    links: listShareLinks().filter((link) => !link.revokedAt).length,
  });
});
