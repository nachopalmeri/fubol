import { cacheGet, cacheSet } from "./db";
import { fetchJson, UpstreamError } from "./http";
import { sanitizeUrl, shortHash } from "./crypto";

export interface AddonResource {
  name: string;
  types?: string[];
  idPrefixes?: string[];
}

export interface AddonCatalog {
  type: string;
  id: string;
  name: string;
  extra?: { name: string; isRequired?: boolean; options?: string[] }[];
}

export interface AddonManifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  logo?: string;
  types: string[];
  resources?: (string | AddonResource)[];
  catalogs?: AddonCatalog[];
  idPrefixes?: string[];
}

export interface AddonMetaPreview {
  id: string;
  type: string;
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  runtime?: string;
  genres?: string[];
  /** Set by local source validation, never trusted from an upstream catalog. */
  playableId?: string;
  availabilityCheckedAt?: number;
}

export interface AddonMeta extends AddonMetaPreview {
  sourceNotice?: string;
  sourcePage?: string;
  videos?: {
    id: string;
    title?: string;
    season?: number;
    episode?: number;
    released?: string;
    thumbnail?: string;
    overview?: string;
  }[];
  cast?: string[];
  director?: string[];
  year?: string | number;
}

export interface RawAddonStream {
  url?: string;
  ytId?: string;
  infoHash?: string;
  fileIdx?: number;
  externalUrl?: string;
  name?: string;
  title?: string;
  description?: string;
  behaviorHints?: {
    notWebReady?: boolean;
    bingeGroup?: string;
    filename?: string;
    videoSize?: number;
    proxyHeaders?: { request?: Record<string, string>; response?: Record<string, string> };
  };
}

export interface AddonSubtitle {
  id: string;
  url: string;
  lang: string;
}

export class AddonSetupRequired extends UpstreamError {
  constructor(readonly configureUrl: string | null) {
    super(`La fuente requiere actualizar su configuración${configureUrl ? ` en ${configureUrl}` : " desde su proveedor"}. Completá la verificación del proveedor y guardá el nuevo manifest.`, 409);
    this.name = "AddonSetupRequired";
  }
}

/** Some providers return an installation notice disguised as a video stream. */
export function usableAddonStreams(streams: RawAddonStream[]): RawAddonStream[] {
  let setup: AddonSetupRequired | null = null;
  const playable = streams.filter((stream) => {
    if (!/please reinstall|reinstall the addon|update.{0,20}addon link|addon.{0,20}reconfigur/i.test(`${stream.name ?? ""} ${stream.title ?? ""}`)) return true;
    let configureUrl: string | null = null;
    try {
      const url = new URL(stream.url ?? stream.externalUrl ?? "");
      if (url.protocol === "https:" && url.hostname === "sports.highfly.to" && url.pathname === "/configure" && !url.username && !url.password) {
        configureUrl = "https://sports.highfly.to/configure";
      }
    } catch { /* An instruction without a URL is still not video. */ }
    setup = new AddonSetupRequired(configureUrl);
    return false;
  });
  if (playable.length === 0 && setup) throw setup;
  return playable;
}

export interface AddonRef {
  id: string;
  name: string;
  url: string;
  kind: "vod" | "subs" | "live" | "meta";
}

export function normalizeManifestUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Manifest vacío");
  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("El manifest debe ser http/https");
  }
  if (!/manifest\.json$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/manifest.json`;
  }
  return url.toString();
}

function endpoint(manifestUrl: string, path: string): string {
  const url = new URL(manifestUrl);
  const basePath = url.pathname.replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");
  const suffix = path.replace(/^\/+/, "");
  url.pathname = `${basePath}/${suffix}`;
  return url.toString();
}

export async function getManifest(manifestUrl: string, ttlMs = 30 * 60_000): Promise<AddonManifest> {
  const normalized = normalizeManifestUrl(manifestUrl);
  const cacheKey = `addon:manifest:${normalized}`;
  const cached = cacheGet<AddonManifest>(cacheKey);
  if (cached) return cached;
  const { data } = await fetchJson<AddonManifest>(normalized, { timeoutMs: 12000 });
  if (!data || typeof data.id !== "string" || typeof data.name !== "string") {
    throw new UpstreamError("Manifest inválido", 502);
  }
  cacheSet(cacheKey, data, ttlMs);
  return data;
}

function resourceNames(manifest: AddonManifest): string[] {
  return (manifest.resources ?? []).map((resource) =>
    typeof resource === "string" ? resource : resource.name,
  );
}

export function supports(manifest: AddonManifest, resource: "catalog" | "meta" | "stream" | "subtitles"): boolean {
  return resourceNames(manifest).includes(resource);
}

function extraPath(extra: Record<string, string | number | undefined>): string {
  const parts = Object.entries(extra)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length ? `/${parts.join("&")}` : "";
}

export async function getCatalog(
  addon: AddonRef,
  type: string,
  catalogId: string,
  extra: Record<string, string | number | undefined> = {},
): Promise<AddonMetaPreview[]> {
  const cacheKey = `addon:catalog:${addon.id}:${shortHash(addon.url, 16)}:${type}:${catalogId}:${JSON.stringify(extra)}`;
  const cached = cacheGet<AddonMetaPreview[]>(cacheKey);
  if (cached) return cached;
  const path = `catalog/${encodeURIComponent(type)}/${encodeURIComponent(catalogId)}${extraPath(extra)}.json`;
  const { data } = await fetchJson<{ metas?: AddonMetaPreview[] }>(endpoint(addon.url, path), {
    timeoutMs: extra.search ? 15000 : 12000,
  });
  const metas = Array.isArray(data.metas) ? data.metas.filter((m) => m && m.id && m.name) : [];
  cacheSet(cacheKey, metas, extra.search ? 3 * 60_000 : 15 * 60_000);
  return metas;
}

export async function getMeta(addon: AddonRef, type: string, id: string): Promise<AddonMeta | null> {
  const cacheKey = `addon:meta:${addon.id}:${shortHash(addon.url, 16)}:${type}:${id}`;
  const cached = cacheGet<AddonMeta>(cacheKey);
  if (cached) return cached;
  const path = `meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`;
  const { data } = await fetchJson<{ meta?: AddonMeta }>(endpoint(addon.url, path), {
    timeoutMs: 12000,
  });
  if (!data.meta) return null;
  cacheSet(cacheKey, data.meta, 60 * 60_000);
  return data.meta;
}

export async function getStreams(addon: AddonRef, type: string, id: string): Promise<RawAddonStream[]> {
  const cacheKey = `addon:streams:${addon.id}:${shortHash(addon.url, 16)}:${type}:${id}`;
  const cached = cacheGet<RawAddonStream[]>(cacheKey);
  if (cached) return usableAddonStreams(cached);
  const path = `stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`;
  const { data } = await fetchJson<{ streams?: RawAddonStream[] }>(endpoint(addon.url, path), {
    timeoutMs: 20000,
  });
  const streams = Array.isArray(data.streams) ? data.streams : [];
  cacheSet(cacheKey, streams, 2 * 60_000);
  return usableAddonStreams(streams);
}

export async function getAddonSubtitles(
  addon: AddonRef,
  type: string,
  id: string,
  extra: Record<string, string | number | undefined> = {},
): Promise<AddonSubtitle[]> {
  const path = `subtitles/${encodeURIComponent(type)}/${encodeURIComponent(id)}${extraPath(extra)}.json`;
  const cacheKey = `addon:subs:${addon.id}:${shortHash(addon.url, 16)}:${path}`;
  const cached = cacheGet<AddonSubtitle[]>(cacheKey);
  if (cached) return cached;
  const { data } = await fetchJson<{ subtitles?: AddonSubtitle[] }>(endpoint(addon.url, path), {
    timeoutMs: 15000,
  });
  const subtitles = (Array.isArray(data.subtitles) ? data.subtitles : []).filter(
    (sub) => sub && typeof sub.url === "string" && typeof sub.lang === "string",
  );
  cacheSet(cacheKey, subtitles, 10 * 60_000);
  return subtitles;
}

export function addonLabel(addon: AddonRef): string {
  return addon.name || sanitizeUrl(addon.url);
}
