import { cacheGet, cacheSet } from "./db";
import { fetchJson, UpstreamError } from "./http";
import { sanitizeUrl } from "./crypto";

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
}

export interface AddonMeta extends AddonMetaPreview {
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
  const cacheKey = `addon:catalog:${addon.id}:${type}:${catalogId}:${JSON.stringify(extra)}`;
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
  const cacheKey = `addon:meta:${addon.id}:${type}:${id}`;
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
  const cacheKey = `addon:streams:${addon.id}:${type}:${id}`;
  const cached = cacheGet<RawAddonStream[]>(cacheKey);
  if (cached) return cached;
  const path = `stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`;
  const { data } = await fetchJson<{ streams?: RawAddonStream[] }>(endpoint(addon.url, path), {
    timeoutMs: 20000,
  });
  const streams = Array.isArray(data.streams) ? data.streams : [];
  cacheSet(cacheKey, streams, 2 * 60_000);
  return streams;
}

export async function getAddonSubtitles(
  addon: AddonRef,
  type: string,
  id: string,
  extra: Record<string, string | number | undefined> = {},
): Promise<AddonSubtitle[]> {
  const path = `subtitles/${encodeURIComponent(type)}/${encodeURIComponent(id)}${extraPath(extra)}.json`;
  const cacheKey = `addon:subs:${addon.id}:${path}`;
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
