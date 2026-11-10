import { json, requireAdmin, route } from "@/lib/api";
import { addonDiagnostics, type AddonDiagnostic } from "@/lib/vod/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The last good reading, so a network hiccup does not make the panel say
 * that every addon is down. Fourteen manifests fetched in parallel can all
 * time out at once when the network stutters, and "todo caído" is both wrong
 * and alarming.
 */
let lastGood: { at: number; addons: AddonDiagnostic[] } | null = null;
const GOOD_FOR_MS = 10 * 60_000;

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
  const allDown = addons.length > 0 && addons.every((addon) => !addon.manifestOk);
  let stale = false;
  let reported = addons;
  if (allDown && lastGood && Date.now() - lastGood.at < GOOD_FOR_MS) {
    reported = lastGood.addons;
    stale = true;
  } else if (addons.some((addon) => addon.manifestOk)) {
    lastGood = { at: Date.now(), addons };
  }
  return json({
    addons: reported,
    stale,
    summary: {
      total: reported.length,
      serving: reported.filter((addon) => addon.manifestOk && !addon.needsConfiguration).length,
      needConfiguration: reported.filter((addon) => addon.needsConfiguration).length,
      unreachable: reported.filter((addon) => !addon.manifestOk).length,
    },
  });
});
