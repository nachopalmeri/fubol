import { json, readJson, requireAdmin, route } from "@/lib/api";
import { deleteAddon, updateAddon, type AddonKind } from "@/lib/vod/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ params: Promise<{ id: string }> }>(
  "admin_addons_update",
  async (request, context) => {
    await requireAdmin();
    const { id } = await context.params;
    const body = await readJson<{
      url?: string;
      name?: string;
      kind?: AddonKind;
      enabled?: boolean;
    }>(request);
    try {
      const addon = await updateAddon(id, body);
      return json({ addon });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "No se pudo actualizar el addon";
      const status = /no encontrado/i.test(message) ? 404 : 400;
      return json({ error: message }, { status });
    }
  },
);

export const DELETE = route<{ params: Promise<{ id: string }> }>(
  "admin_addons_delete",
  async (_request, context) => {
    await requireAdmin();
    const { id } = await context.params;
    await deleteAddon(id);
    return json({ ok: true });
  },
);
