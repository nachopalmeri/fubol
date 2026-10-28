import { json, requireAdmin, route } from "@/lib/api";
import { revokeShareLink } from "@/lib/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ params: Promise<{ id: string }> }>(
  "admin_links_delete",
  async (_request, context) => {
    await requireAdmin();
    const { id } = await context.params;
    const numeric = Number(id);
    if (!Number.isFinite(numeric)) return json({ error: "Id inválido" }, { status: 400 });
    const revoked = revokeShareLink(numeric);
    return json({ revoked });
  },
);
