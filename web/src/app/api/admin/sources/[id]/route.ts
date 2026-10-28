import { json, readJson, requireAdmin, route } from "@/lib/api";
import { deleteLiveSource, getLiveSource, upsertLiveSource } from "@/lib/live/sources";
import type { LiveSourceConfig } from "@/lib/live/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ params: Promise<{ id: string }> }>(
  "admin_sources_update",
  async (request, context) => {
    await requireAdmin();
    const { id } = await context.params;
    const existing = getLiveSource(id);
    if (!existing) return json({ error: "Fuente no encontrada" }, { status: 404 });
    const body = await readJson<{
      enabled?: boolean;
      priority?: number;
      name?: string;
      config?: LiveSourceConfig;
    }>(request);

    let config = body.config ?? existing.config;
    const existingSecret = existing.config as LiveSourceConfig & { password?: string };
    const incomingSecret = config as LiveSourceConfig & { password?: string };
    if (incomingSecret.password === "__SET__" && existingSecret.password) {
      config = { ...config, password: existingSecret.password } as LiveSourceConfig;
    }

    const source = upsertLiveSource({
      id,
      kind: existing.kind,
      name: body.name?.trim() || existing.name,
      url: existing.url,
      config,
      enabled: body.enabled ?? existing.enabled,
      priority: body.priority ?? existing.priority,
    });
    return json({ source });
  },
);

export const DELETE = route<{ params: Promise<{ id: string }> }>(
  "admin_sources_delete",
  async (_request, context) => {
    await requireAdmin();
    const { id } = await context.params;
    deleteLiveSource(id);
    return json({ ok: true });
  },
);
