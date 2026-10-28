import { json, requireAdmin, route } from "@/lib/api";
import { deleteAddon } from "@/lib/vod/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ params: Promise<{ id: string }> }>(
  "admin_addons_delete",
  async (_request, context) => {
    await requireAdmin();
    const { id } = await context.params;
    deleteAddon(id);
    return json({ ok: true });
  },
);
