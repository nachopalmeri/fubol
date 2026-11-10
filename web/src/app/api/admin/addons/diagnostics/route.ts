import { json, requireAdmin, route } from "@/lib/api";
import { addonDiagnostics } from "@/lib/vod/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-addon state for the admin panel. Reports whether an addon can actually
 * serve, not merely whether its manifest answers: five of the six registered
 * subtitle providers return a 200 manifest and then HTTP 404 on every
 * `subtitles/...` request because they need a per-user configured manifest.
 * Earlier audits recorded that as "PASS, limited", which hid the problem.
 */
export const GET = route("admin_addon_diagnostics", async () => {
  await requireAdmin();
  const addons = await addonDiagnostics();
  return json({
    addons,
    summary: {
      total: addons.length,
      serving: addons.filter((addon) => addon.manifestOk && !addon.needsConfiguration).length,
      needConfiguration: addons.filter((addon) => addon.needsConfiguration).length,
      unreachable: addons.filter((addon) => !addon.manifestOk).length,
    },
  });
});
