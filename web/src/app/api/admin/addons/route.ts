import { json, readJson, requireAdmin, route } from "@/lib/api";
import { addAddon, listAddonRows, toggleAddon, type AddonKind } from "@/lib/vod/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: AddonKind[] = ["vod", "subs", "meta", "live"];

export const GET = route("admin_addons", async () => {
  await requireAdmin();
  return json({ addons: await listAddonRows(undefined, true) });
});

export const POST = route("admin_addons_create", async (request) => {
  await requireAdmin();
  const body = await readJson<{ url?: string; kind?: AddonKind; name?: string }>(request);
  if (!body.url) return json({ error: "Falta la URL del manifest" }, { status: 400 });
  const kind = body.kind && KINDS.includes(body.kind) ? body.kind : "vod";
  const addon = await addAddon({ url: body.url, kind, name: body.name });
  return json({ addon });
});

export const PATCH = route("admin_addons_toggle", async (request) => {
  await requireAdmin();
  const body = await readJson<{ id?: string; enabled?: boolean }>(request);
  if (!body.id || typeof body.enabled !== "boolean") {
    return json({ error: "Faltan datos" }, { status: 400 });
  }
  await toggleAddon(body.id, body.enabled);
  return json({ ok: true });
});
