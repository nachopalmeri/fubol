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
    const existing = await getLiveSource(id);
    if (!existing) return json({ error: "Fuente no encontrada" }, { status: 404 });
    const body = await readJson<{
      enabled?: boolean;
      priority?: number;
      name?: string;
      url?: string;
      config?: LiveSourceConfig;
    }>(request);

    // The manifest URL is the part that changes when a provider hands out a
    // personal manifest after its one-time verification. Without this the
    // only way to swap it was deleting the source and creating it again.
    let url = existing.url;
    if (body.url?.trim() && body.url.trim() !== existing.url) {
      const candidate = body.url.trim();
      if (!/^https:\/\//i.test(candidate)) {
        return json({ error: "La URL del manifest tiene que ser https" }, { status: 400 });
      }
      url = candidate;
    }

    let config = body.config ?? existing.config;
    const existingSecret = existing.config as LiveSourceConfig & { password?: string };
    const incomingSecret = config as LiveSourceConfig & { password?: string };
    if (incomingSecret.password === "__SET__" && existingSecret.password) {
      config = { ...config, password: existingSecret.password } as LiveSourceConfig;
    }

    const source = await upsertLiveSource({
      id,
      kind: existing.kind,
      name: body.name?.trim() || existing.name,
      url,
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
    await deleteLiveSource(id);
    return json({ ok: true });
  },
);
