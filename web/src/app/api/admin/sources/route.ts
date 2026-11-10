import { json, readJson, requireAdmin, route } from "@/lib/api";
import { listLiveSources, upsertLiveSource } from "@/lib/live/sources";
import type { LiveSourceConfig, LiveSourceKind } from "@/lib/live/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: LiveSourceKind[] = ["hls", "m3u", "xtream", "addon"];

export function maskConfig(config: LiveSourceConfig): LiveSourceConfig {
  const masked = { ...config } as LiveSourceConfig & { password?: string };
  if (masked.password) masked.password = "__SET__";
  return masked;
}

export const GET = route("admin_sources", async () => {
  await requireAdmin();
  const sources = (await listLiveSources(true)).map((source) => ({
    ...source,
    config: maskConfig(source.config),
  }));
  return json({ sources });
});

export const POST = route("admin_sources_upsert", async (request) => {
  await requireAdmin();
  const body = await readJson<{
    id?: string;
    kind?: LiveSourceKind;
    name?: string;
    url?: string;
    config?: LiveSourceConfig;
    enabled?: boolean;
    priority?: number;
  }>(request);

  if (!body.kind || !KINDS.includes(body.kind)) {
    return json({ error: "Tipo de fuente inválido" }, { status: 400 });
  }
  if (!body.name?.trim() || !body.url?.trim()) {
    return json({ error: "Nombre y URL son obligatorios" }, { status: 400 });
  }
  if (body.kind === "xtream") {
    const config = body.config as LiveSourceConfig & { username?: string; password?: string };
    if (!config?.username || !config?.password) {
      return json({ error: "Xtream necesita usuario y password" }, { status: 400 });
    }
  }
  if (body.kind === "addon" && !body.config?.catalogId) {
    return json({ error: "El addon de vivo necesita catalogId" }, { status: 400 });
  }

  const source = await upsertLiveSource({
    id: body.id,
    kind: body.kind,
    name: body.name.trim().slice(0, 80),
    url: body.url.trim(),
    config: body.config ?? {},
    enabled: body.enabled,
    priority: body.priority,
  });
  return json({ source: { ...source, config: maskConfig(source.config) } });
});
