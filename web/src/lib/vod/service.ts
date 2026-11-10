import { cacheGet, cacheSet } from "../cache";
import { mapLimit, withTimeout } from "../http";
import {
  configureUrlFor,
  getCatalog,
  getManifest,
  getMeta,
  getStreams,
  needsConfiguration,
  supports,
  type AddonMeta,
  type AddonMetaPreview,
  type AddonCatalog,
} from "../addons";
import { listAddonRows, type AddonRow } from "./store";
import { dedupeSources, normalizeStreams, type VodSource } from "./rank";
import { filterAvailable, validateVodSource } from "./availability";
import { shortHash } from "../crypto";
import { getOpenFilm, getOpenFilmMetas, OPEN_FILM_ADDON, openFilmsEnabled } from "./open-films";

const BLOCKED = /(xxx|adult|porn|erotic|hentai)/i;

export interface HomeRow {
  addon: AddonRow;
  catalog: AddonCatalog;
  metas: AddonMetaPreview[];
}

async function manifestsFor(addons: AddonRow[], timeoutMs = 4_000) {
  const results = await Promise.allSettled(
    addons.map(async (addon) => ({
      addon,
      manifest: await withTimeout(getManifest(addon.url), timeoutMs, "manifest lento"),
    })),
  );
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

/** Catalogs only need providers that can publish movies or series, not subtitle addons. */
async function catalogAddons(): Promise<AddonRow[]> {
  return (await listAddonRows()).filter((addon) => addon.kind === "vod" || addon.kind === "meta");
}

/**
 * Serving the home page used to cost up to 10.7 s on a cold cache: every load
 * re-validated availability for 48 titles, and each validation queried every
 * VOD addon. The result is now cached with a short fresh window and a long
 * stale one — a stale payload is served immediately while a single background
 * refresh runs, so only the very first visitor after a restart ever waits.
 */
const HOME_FRESH_MS = 5 * 60_000;
const HOME_STALE_MS = 6 * 3600_000;
let homeRefresh: Promise<HomeRow[]> | null = null;

export async function getHomeRows(maxRows = 10): Promise<HomeRow[]> {
  const revision = await providerRevision();
  const key = `vod:home:v1:${revision}:${maxRows}`;
  const staleKey = `vod:home:stale:v1:${revision}:${maxRows}`;
  const fresh = cacheGet<HomeRow[]>(key);
  if (fresh) return fresh;

  const stale = cacheGet<HomeRow[]>(staleKey);
  if (stale) {
    // Refresh behind the response, and only once no matter how many visitors
    // arrive at the same moment.
    if (!homeRefresh) {
      homeRefresh = computeHomeRows(maxRows)
        .then((rows) => {
          cacheSet(key, rows, HOME_FRESH_MS);
          cacheSet(staleKey, rows, HOME_STALE_MS);
          return rows;
        })
        .catch(() => stale)
        .finally(() => {
          homeRefresh = null;
        });
    }
    return stale;
  }

  const rows = await computeHomeRows(maxRows);
  cacheSet(key, rows, HOME_FRESH_MS);
  cacheSet(staleKey, rows, HOME_STALE_MS);
  return rows;
}

async function computeHomeRows(maxRows: number): Promise<HomeRow[]> {
  const addons = await catalogAddons();
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
        6000,
        "catálogo lento",
      );
      if (metas.length === 0) return null;
      return { addon, catalog, metas: metas.slice(0, 16) };
    } catch {
      return null;
    }
  });

  const seen = new Set<string>();
  const openMetas = await getOpenFilmMetas();
  const out: HomeRow[] = openMetas.length ? [{ addon: OPEN_FILM_ADDON, catalog: { id: "open-films", type: "movie", name: "Cine abierto · Internet Archive" }, metas: openMetas }] : [];
  for (const row of rows) {
    if (!row) continue;
    const key = `${row.catalog.type}:${row.catalog.name}`;
    if (seen.has(key) && row.addon.kind !== "meta") continue;
    seen.add(key);
    out.push(row);
    if (out.length >= maxRows) break;
  }
  const available = await filterAvailable(
    [...new Map(out.flatMap((row) => row.metas).map((meta) => [`${meta.type}:${meta.id}`, meta])).values()].slice(0, 48),
    await providerRevision(),
    { streams: probeVodStreams, meta: getVodMeta },
    6_000,
  );
  const availableById = new Map(available.map((meta) => [`${meta.type}:${meta.id}`, meta]));
  return out.map((row) => ({
    ...row,
    metas: row.metas.flatMap((meta) => {
      const ready = availableById.get(`${meta.type}:${meta.id}`);
      return ready ? [ready] : [];
    }),
  })).filter((row) => row.metas.length > 0);
}

export interface SearchResult {
  meta: AddonMetaPreview;
  addonId: string;
  addonName: string;
}

export async function searchVod(query: string, timeoutMs = 10_000): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const deadline = Date.now() + timeoutMs;
  const addons = await catalogAddons();
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
    const remaining = deadline - Date.now();
    if (remaining <= 500) return [] as AddonMetaPreview[];
    try {
      return await withTimeout(
        getCatalog(task.addon, task.type, task.catalogId, { search: trimmed }),
        Math.min(8_000, remaining - 250),
        "búsqueda lenta",
      );
    } catch {
      return [] as AddonMetaPreview[];
    }
  });

  const seen = new Set<string>();
  const openMetas = await getOpenFilmMetas(trimmed);
  const merged: SearchResult[] = openMetas.map((meta) => ({ meta, addonId: OPEN_FILM_ADDON.id, addonName: OPEN_FILM_ADDON.name }));
  for (const meta of openMetas) seen.add(`${meta.type}:${meta.id}`);
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
  const ordered = merged
    .sort((a, b) => {
      const aExact = a.meta.name.toLowerCase() === needle ? 0 : 1;
      const bExact = b.meta.name.toLowerCase() === needle ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.meta.name.localeCompare(b.meta.name);
    })
    .slice(0, 144);
  const available = await filterAvailable(
    ordered.map((result) => result.meta),
    await providerRevision(),
    { streams: probeVodStreams, meta: getVodMeta },
    Math.max(1_000, deadline - Date.now() - 250),
  );
  const byId = new Map(available.map((meta) => [`${meta.type}:${meta.id}`, meta]));
  return ordered.flatMap((result) => {
    const meta = byId.get(`${result.meta.type}:${result.meta.id}`);
    return meta ? [{ ...result, meta }] : [];
  }).slice(0, 48);
}

async function providerRevision(): Promise<string> {
  const addons = await listAddonRows("vod");
  return shortHash(JSON.stringify([openFilmsEnabled(), ...addons.map((addon) => [addon.id, addon.url])]), 16);
}

export async function getVodMeta(type: string, id: string): Promise<AddonMeta | null> {
  const openFilm = type === "movie" ? await getOpenFilm(id) : null;
  if (openFilm) return openFilm.meta;
  const addons = await catalogAddons();
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
  /**
   * Streams the providers returned that a browser cannot play: BitTorrent
   * `infoHash` entries with no HTTP URL. Measured against the real providers,
   * Torrentio answers a movie with 100 of these and the user's own AIOStreams
   * with 522, all of them P2P and none of them a URL. Counting them is the
   * difference between "no hay fuentes" and "hay 522 fuentes y ninguna se
   * puede abrir sin un resolver debrid".
   */
  p2pOnly: number;
  /** Addons that declare themselves unconfigured and were skipped. */
  unconfigured: { name: string; configureUrl: string | null }[];
}

export async function getVodStreams(type: string, id: string): Promise<VodStreamsResult> {
  const openFilm = type === "movie" ? await getOpenFilm(id) : null;
  const addons = await listAddonRows("vod");
  const unconfigured: { name: string; configureUrl: string | null }[] = [];
  const results = await mapLimit(addons, 5, async (addon) => {
    try {
      const manifest = await getManifest(addon.url);
      if (!supports(manifest, "stream")) return { sources: [] as VodSource[], p2p: 0 };
      if (needsConfiguration(manifest)) {
        unconfigured.push({ name: addon.name, configureUrl: configureUrlFor(addon.url) });
        return { sources: [] as VodSource[], p2p: 0 };
      }
      const streams = await withTimeout(getStreams(addon, type, id), 20000, "streams lentos");
      const p2p = streams.filter((stream) => !stream.url && stream.infoHash).length;
      return { sources: normalizeStreams(addon, streams), p2p };
    } catch {
      return { sources: [] as VodSource[], p2p: 0 };
    }
  });
  return {
    sources: dedupeSources([
      ...(openFilm?.sources ?? []),
      ...results.flatMap((result) => result.sources),
    ]).slice(0, 40),
    addonsTried: addons.length + (openFilm ? 1 : 0),
    p2pOnly: results.reduce((total, result) => total + result.p2p, 0),
    unconfigured,
  };
}

export interface SubtitleProvider {
  addon: AddonRow;
  manifestName: string;
}

/**
 * Which addons have ever answered with a link a browser can open.
 *
 * With a debrid configured, the stream addons return HTTP URLs; without one,
 * they all answer with `infoHash`. Asking every addon for every title is the
 * difference between a home that loads in half a second and one that takes
 * eight: four addons over fifty titles is two hundred requests. Once the app
 * knows that no addon produces direct links, one is enough to know that a
 * title exists as a torrent, and the rest are only asked again once one of
 * them starts returning something playable.
 */
const directCapable = new Set<string>();
const p2pCapable = new Set<string>();
/**
 * Addons that just failed are left alone for a while. A rate-limited provider
 * answers every request with an error, and asking it again for every title
 * turned the catalog sweep into a queue of timeouts.
 */
const quarantined = new Map<string, number>();
const QUARANTINE_MS = 90_000;

export interface VodProbe {
  sources: VodSource[];
  p2pOnly: number;
}

/**
 * Cheap availability probe used by the browse rails and by search.
 *
 * It answers the two questions browsing needs: is there something playable
 * here, and is this title offered at all. The full fan-out to every addon is
 * what the title page uses, where the user asked for the sources.
 */
export async function probeVodStreams(type: string, id: string): Promise<VodProbe> {
  const addons = await listAddonRows("vod");
  if (addons.length === 0) return { sources: [], p2pOnly: 0 };

  const capable = addons.filter((addon) => directCapable.has(addon.id));
  // Nobody is known to answer with a direct link yet: one addon is enough to
  // learn whether the title exists, and the others are only worth asking when
  // one of them starts returning links.
  const healthy = addons.filter((addon) => (quarantined.get(addon.id) ?? 0) <= Date.now());
  const usable = healthy.length > 0 ? healthy : addons;
  let targets = capable.length > 0 ? capable.filter((addon) => usable.includes(addon)) : usable.slice(0, 1);
  if (targets.length === 0) targets = usable.slice(0, 1);

  let results = await probeVodAddons(targets, type, id);
  const nothing = results.every((result) => result.direct.length === 0 && result.p2p === 0);
  if (nothing && targets.length < addons.length) {
    // The addon that answered nothing may simply be having a bad moment (a
    // rate limit answers 429 and no streams). Asking one more is cheaper than
    // dropping a title that three other providers do have.
    const rest = addons
      .filter((addon) => !targets.some((target) => target.id === addon.id))
      .filter((addon) => (quarantined.get(addon.id) ?? 0) <= Date.now())
      .slice(0, 2);
    targets = [...targets, ...rest];
    results = [...results, ...(await probeVodAddons(rest, type, id))];
  }

  const sources: VodSource[] = [];
  let p2pOnly = 0;
  for (const result of results) {
    p2pOnly = Math.max(p2pOnly, result.p2p);
    // Validating one candidate is enough to know whether the addon is really
    // serving playable files; the title page lists them all.
    const inspected = await mapLimit(result.direct.slice(0, 2), 2, async (source) => ({
      source,
      kind: await validateVodSource(source),
    }));
    for (const item of inspected) {
      if (item.kind) sources.push(item.source);
    }
  }
  return { sources, p2pOnly };
}

async function probeVodAddons(
  addons: AddonRow[],
  type: string,
  id: string,
): Promise<{ addon: AddonRow; direct: VodSource[]; p2p: number }[]> {
  return mapLimit(addons, 3, async (addon) => {
    const until = quarantined.get(addon.id);
    if (until && until > Date.now()) return { addon, direct: [] as VodSource[], p2p: 0 };
    try {
      const manifest = await getManifest(addon.url);
      if (!supports(manifest, "stream")) return { addon, direct: [] as VodSource[], p2p: 0 };
      const streams = await withTimeout(getStreams(addon, type, id), 12_000, "streams lentos");
      const direct = normalizeStreams(addon, streams).filter((source) => !source.viaTorrent);
      const p2p = streams.filter((stream) => !stream.url && stream.infoHash).length;
      if (direct.length > 0) directCapable.add(addon.id);
      if (p2p > 0) p2pCapable.add(addon.id);
      quarantined.delete(addon.id);
      return { addon, direct, p2p };
    } catch {
      quarantined.set(addon.id, Date.now() + QUARANTINE_MS);
      return { addon, direct: [] as VodSource[], p2p: 0 };
    }
  });
}

export async function getPlayableVodStreams(type: string, id: string): Promise<VodStreamsResult & { kinds: Record<string, "hls" | "mp4"> }> {
  const result = await getVodStreams(type, id);

  // Swarm-backed sources are not probed. Measured against a cold swarm, the
  // first bytes took 63.7 s to arrive (6.6 s once the server had the pieces
  // cached), so a synchronous container check would either time out and
  // discard every torrent or hold the page for a minute. The release-name
  // filter in `torrent.ts` already removes the containers a browser cannot
  // decode, and the player fails over if a source turns out to be dead.
  const torrents = result.sources.filter((source) => source.viaTorrent);
  const direct = result.sources.filter((source) => !source.viaTorrent);

  const inspected = await mapLimit(direct.slice(0, 6), 3, async (source) => ({
    source,
    kind: await validateVodSource(source),
  }));

  const kinds: Record<string, "hls" | "mp4"> = {};
  const sources: VodSource[] = [];
  for (const item of inspected) {
    if (!item.kind) continue;
    sources.push(item.source);
    kinds[item.source.id] = item.kind;
  }
  for (const source of torrents.slice(0, 8)) {
    sources.push(source);
    kinds[source.id] = "mp4";
  }

  // Ask the streaming server for the first bytes of the best candidate now, so
  // the swarm is warm by the time somebody presses play instead of after it.
  if (torrents[0]) warmTorrent(torrents[0].url);

  return { ...result, sources: sources.sort((a, b) => b.score - a.score), kinds };
}

/** In-flight and recently warmed torrent URLs, so one request is enough. */
const warming = new Set<string>();

function warmTorrent(url: string): void {
  if (warming.has(url)) return;
  warming.add(url);
  if (warming.size > 200) warming.clear();
  void fetch(url, {
    headers: { range: "bytes=0-65535" },
    signal: AbortSignal.timeout(120_000),
  })
    .then((response) => response.body?.cancel())
    .catch(() => undefined);
}

export async function subtitleProviders(): Promise<SubtitleProvider[]> {
  const addons = await listAddonRows(undefined, false);
  const withManifests = await manifestsFor(addons);
  return withManifests
    .filter(({ manifest }) => supports(manifest, "subtitles"))
    // An addon whose manifest says it is not configured answers every
    // `subtitles/...` request with 404. Querying it only spends a timeout.
    .filter(({ manifest }) => !needsConfiguration(manifest))
    .map(({ addon, manifest }) => ({ addon, manifestName: manifest.name }));
}

export interface AddonDiagnostic {
  id: string;
  name: string;
  kind: AddonRow["kind"];
  url: string;
  manifestOk: boolean;
  /** The addon's own manifest declares it unusable until configured. */
  needsConfiguration: boolean;
  configureUrl: string | null;
  resources: string[];
  error?: string;
}

/**
 * Per-addon state for the admin panel. Deliberately reports whether the addon
 * can serve resources, not merely whether its manifest answers: five of the six
 * subtitle providers return a 200 manifest and then 404 on every actual
 * request, which earlier audits recorded as "PASS, limited".
 */
export async function addonDiagnostics(): Promise<AddonDiagnostic[]> {
  const addons = await listAddonRows(undefined, true);
  return mapLimit(addons, 5, async (addon) => {
    const base = {
      id: addon.id,
      name: addon.name,
      kind: addon.kind,
      url: addon.url,
      configureUrl: configureUrlFor(addon.url),
    };
    try {
      const manifest = await withTimeout(getManifest(addon.url), 10_000, "manifest lento");
      return {
        ...base,
        manifestOk: true,
        needsConfiguration: needsConfiguration(manifest),
        resources: (manifest.resources ?? []).map((resource) =>
          typeof resource === "string" ? resource : resource.name,
        ),
      };
    } catch (error) {
      return {
        ...base,
        manifestOk: false,
        needsConfiguration: false,
        resources: [],
        error: error instanceof Error ? error.message : "error",
      };
    }
  });
}
