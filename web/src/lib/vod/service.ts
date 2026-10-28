import { mapLimit, withTimeout } from "../http";
import {
  getCatalog,
  getManifest,
  getMeta,
  getStreams,
  supports,
  type AddonMeta,
  type AddonMetaPreview,
  type AddonCatalog,
} from "../addons";
import { listAddonRows, type AddonRow } from "./store";
import { dedupeSources, normalizeStreams, type VodSource } from "./rank";

const BLOCKED = /(xxx|adult|porn|erotic|hentai)/i;

export interface HomeRow {
  addon: AddonRow;
  catalog: AddonCatalog;
  metas: AddonMetaPreview[];
}

async function manifestsFor(addons: AddonRow[]) {
  const results = await Promise.allSettled(
    addons.map(async (addon) => ({ addon, manifest: await getManifest(addon.url) })),
  );
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

export async function getHomeRows(maxRows = 10): Promise<HomeRow[]> {
  const addons = listAddonRows();
  const withManifests = await manifestsFor(addons);
  const tasks: { addon: AddonRow; catalog: AddonCatalog }[] = [];
  for (const { addon, manifest } of withManifests) {
    if (!supports(manifest, "catalog")) continue;
    const catalogs = (manifest.catalogs ?? [])
      .filter((catalog) => ["movie", "series"].includes(catalog.type))
      .filter((catalog) => !BLOCKED.test(`${catalog.id} ${catalog.name}`))
      .filter((catalog) => catalog.id !== "search")
      .slice(0, addon.kind === "meta" ? 4 : 6);
    for (const catalog of catalogs) tasks.push({ addon, catalog });
  }

  const rows = await mapLimit(tasks, 6, async ({ addon, catalog }) => {
    try {
      const metas = await withTimeout(
        getCatalog(addon, catalog.type, catalog.id),
        9000,
        "catálogo lento",
      );
      if (metas.length === 0) return null;
      return { addon, catalog, metas: metas.slice(0, 16) };
    } catch {
      return null;
    }
  });

  const seen = new Set<string>();
  const out: HomeRow[] = [];
  for (const row of rows) {
    if (!row) continue;
    const key = `${row.catalog.type}:${row.catalog.name}`;
    if (seen.has(key) && row.addon.kind !== "meta") continue;
    seen.add(key);
    out.push(row);
    if (out.length >= maxRows) break;
  }
  return out;
}

export interface SearchResult {
  meta: AddonMetaPreview;
  addonId: string;
  addonName: string;
}

export async function searchVod(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const addons = listAddonRows();
  const withManifests = await manifestsFor(addons);
  const tasks: { addon: AddonRow; type: string; catalogId: string }[] = [];

  for (const { addon, manifest } of withManifests) {
    if (!supports(manifest, "catalog")) continue;
    const searchable = (manifest.catalogs ?? []).filter(
      (catalog) =>
        ["movie", "series"].includes(catalog.type) &&
        !BLOCKED.test(`${catalog.id} ${catalog.name}`) &&
        (catalog.extra ?? []).some((extra) => extra.name === "search"),
    );
    for (const catalog of searchable.slice(0, 3)) {
      tasks.push({ addon, type: catalog.type, catalogId: catalog.id });
    }
  }

  const results = await mapLimit(tasks, 4, async (task) => {
    try {
      return await withTimeout(
        getCatalog(task.addon, task.type, task.catalogId, { search: trimmed }),
        12000,
        "búsqueda lenta",
      );
    } catch {
      return [] as AddonMetaPreview[];
    }
  });

  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (let index = 0; index < results.length; index++) {
    const task = tasks[index];
    if (!task) continue;
    for (const meta of results[index] ?? []) {
      const key = `${meta.type}:${meta.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ meta, addonId: task.addon.id, addonName: task.addon.name });
    }
  }

  const needle = trimmed.toLowerCase();
  return merged
    .sort((a, b) => {
      const aExact = a.meta.name.toLowerCase() === needle ? 0 : 1;
      const bExact = b.meta.name.toLowerCase() === needle ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.meta.name.localeCompare(b.meta.name);
    })
    .slice(0, 48);
}

export async function getVodMeta(type: string, id: string): Promise<AddonMeta | null> {
  const addons = listAddonRows();
  const withManifests = await manifestsFor(addons);
  const ordered = withManifests
    .filter(({ manifest }) => supports(manifest, "meta"))
    .sort((a, b) => (a.addon.kind === "meta" ? -1 : 0) - (b.addon.kind === "meta" ? -1 : 0));

  const results = await mapLimit(ordered, 3, async ({ addon }) => {
    try {
      return await withTimeout(getMeta(addon, type, id), 9000, "metadata lenta");
    } catch {
      return null;
    }
  });
  return results.find((meta): meta is AddonMeta => meta !== null) ?? null;
}

export interface VodStreamsResult {
  sources: VodSource[];
  addonsTried: number;
}

export async function getVodStreams(type: string, id: string): Promise<VodStreamsResult> {
  const addons = listAddonRows("vod");
  const results = await mapLimit(addons, 5, async (addon) => {
    try {
      const manifest = await getManifest(addon.url);
      if (!supports(manifest, "stream")) return [];
      const streams = await withTimeout(getStreams(addon, type, id), 20000, "streams lentos");
      return normalizeStreams(addon, streams);
    } catch {
      return [] as VodSource[];
    }
  });
  return {
    sources: dedupeSources(results.flat()).slice(0, 40),
    addonsTried: addons.length,
  };
}

export interface SubtitleProvider {
  addon: AddonRow;
  manifestName: string;
}

export async function subtitleProviders(): Promise<SubtitleProvider[]> {
  const addons = listAddonRows(undefined, false);
  const withManifests = await manifestsFor(addons);
  return withManifests
    .filter(({ manifest }) => supports(manifest, "subtitles"))
    .map(({ addon, manifest }) => ({ addon, manifestName: manifest.name }));
}
