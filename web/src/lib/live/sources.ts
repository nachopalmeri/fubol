import { cacheGet, cacheSet } from "../cache";
import { fetchText, UpstreamError } from "../http";
import { shortHash, sanitizeUrl } from "../crypto";
import { logger } from "../logger";
import { getCatalog, getManifest, type AddonMetaPreview } from "../addons";
import { mutateState, readState } from "../state";
import type { SourceRecord } from "../state/types";
import { entriesToChannels, parseM3u } from "./m3u";
import { fetchXtreamChannels } from "./xtream";
import type { Channel, LiveSource, LiveSourceConfig, LiveSourceKind } from "./types";

function toSource(record: SourceRecord): LiveSource {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    url: record.url,
    config: record.config as LiveSourceConfig,
    enabled: record.enabled,
    priority: record.priority,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function listLiveSources(includeDisabled = false): Promise<LiveSource[]> {
  const doc = await readState();
  return doc.sources
    .filter((source) => (includeDisabled ? true : source.enabled))
    .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt)
    .map(toSource);
}

export async function getLiveSource(id: string): Promise<LiveSource | undefined> {
  const doc = await readState();
  const record = doc.sources.find((source) => source.id === id);
  return record ? toSource(record) : undefined;
}

export async function upsertLiveSource(input: {
  id?: string;
  kind: LiveSourceKind;
  name: string;
  url: string;
  config?: LiveSourceConfig;
  enabled?: boolean;
  priority?: number;
}): Promise<LiveSource> {
  const now = Date.now();
  const id = input.id ?? shortHash(`${input.kind}:${input.url}:${now}`, 12);
  const source = await mutateState((doc) => {
    const existing = doc.sources.find((item) => item.id === id);
    if (existing) {
      existing.kind = input.kind;
      existing.name = input.name;
      existing.url = input.url;
      existing.config = (input.config ?? {}) as Record<string, unknown>;
      existing.enabled = input.enabled !== false;
      existing.priority = input.priority ?? existing.priority;
      existing.updatedAt = now;
      return { ...existing };
    }
    const record: SourceRecord = {
      id,
      kind: input.kind,
      name: input.name,
      url: input.url,
      config: (input.config ?? {}) as Record<string, unknown>,
      enabled: input.enabled !== false,
      priority: input.priority ?? 100,
      createdAt: now,
      updatedAt: now,
    };
    doc.sources.push(record);
    return { ...record };
  });
  invalidateChannelCache();
  return toSource(source);
}

export async function deleteLiveSource(id: string): Promise<void> {
  await mutateState((doc) => {
    doc.sources = doc.sources.filter((source) => source.id !== id);
  });
  invalidateChannelCache();
}

async function loadChannels(source: LiveSource): Promise<Channel[]> {
  const revision = shortHash(JSON.stringify([source.kind, source.url, source.name, source.config]), 16);
  const cacheKey = `channels:${source.id}:${revision}`;
  const staleKey = `channels:stale:${source.id}:${revision}`;
  const cached = cacheGet<Channel[]>(cacheKey);
  if (cached) return cached;

  try {
    let channels: Channel[] = [];
    if (source.kind === "m3u") {
      const { text } = await fetchText(source.url, {
        timeoutMs: 20_000,
        maxBytes: 8_000_000,
        headers: source.config.headers,
      });
      channels = entriesToChannels(parseM3u(text), source);
      const filter = source.config.groupFilter?.toLowerCase();
      if (filter) channels = channels.filter((channel) => channel.group.toLowerCase().includes(filter));
    } else if (source.kind === "xtream") {
      channels = await fetchXtreamChannels(source);
    } else if (source.kind === "hls") {
      const direct = source.config.channels ?? [];
      channels = direct.map((entry) => ({
        id: shortHash(`${source.id}|${entry.url}`, 16),
        name: entry.name,
        group: entry.group ?? "Canales",
        logo: entry.logo,
        tvgId: entry.tvgId,
        sourceId: source.id,
        sourceName: source.name,
        kind: "hls" as const,
        urls: [entry.url],
        headers: entry.headers ?? source.config.headers,
      }));
      if (channels.length === 0) {
        channels = [
          {
            id: shortHash(`${source.id}|${source.url}`, 16),
            name: source.name,
            group: source.config.group ?? "Canales",
            sourceId: source.id,
            sourceName: source.name,
            kind: "hls",
            urls: [source.url],
            headers: source.config.headers,
          },
        ];
      }
    } else if (source.kind === "addon") {
      const catalogId = source.config.catalogId;
      if (!catalogId) throw new UpstreamError("El addon de vivo necesita catalogId", 400);
      const manifest = await getManifest(source.url);
      const catalog = manifest.catalogs?.find((item) => item.id === catalogId);
      const type = source.config.catalogType ?? catalog?.type ?? "sports";
      const addonRef = { id: source.id, name: source.name, url: source.url, kind: "live" as const };
      const metas = await getCatalog(addonRef, type, catalogId);
      channels = metas.slice(0, 300).map((meta: AddonMetaPreview) => ({
        id: shortHash(`${source.id}|${type}|${meta.id}`, 16),
        name: meta.name,
        group: catalog?.name ?? "Addon",
        logo: meta.logo ?? meta.poster,
        sourceId: source.id,
        sourceName: source.name,
        kind: "addon" as const,
        urls: [],
        addon: { addonId: source.id, type, itemId: meta.id },
      }));
    }

    channels = channels.filter((channel) => channel.name && !channel.drm);
    cacheSet(cacheKey, channels, 10 * 60_000);
    cacheSet(staleKey, channels, 7 * 86_400_000);
    return channels;
  } catch (error) {
    const stale = cacheGet<Channel[]>(staleKey);
    logger.warn("source_channels_failed", {
      sourceId: source.id,
      kind: source.kind,
      target: sanitizeUrl(source.url),
      error: error instanceof Error ? error.message : "error",
      stale: Boolean(stale),
    });
    if (stale) return stale;
    throw error;
  }
}

let indexCache: { at: number; channels: Channel[] } | null = null;

export function invalidateChannelCache(): void {
  indexCache = null;
}

export async function getAllChannels(): Promise<Channel[]> {
  if (indexCache && Date.now() - indexCache.at < 60_000) return indexCache.channels;
  const sources = await listLiveSources();
  const results = await Promise.allSettled(sources.map((source) => loadChannels(source)));
  const channels: Channel[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") channels.push(...result.value);
  }
  indexCache = { at: Date.now(), channels };
  return channels;
}

export async function getChannelById(id: string): Promise<Channel | undefined> {
  const channels = await getAllChannels();
  return channels.find((channel) => channel.id === id);
}

export function normalizeChannelName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\b(uhd|fhd|hd|sd|4k|1080p|720p|480p|hevc|h264)\b/g, " ")
    .replace(/^[a-z]{2}\s*[|:-]\s*/, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Other sources carrying the same channel: failover candidates. */
export async function relatedChannels(channel: Channel, limit = 6): Promise<Channel[]> {
  const channels = await getAllChannels();
  const targetName = normalizeChannelName(channel.name);
  const matches = channels.filter((candidate) => {
    if (candidate.id === channel.id) return false;
    if (candidate.drm) return false;
    if (channel.tvgId && candidate.tvgId && channel.tvgId === candidate.tvgId) return true;
    const name = normalizeChannelName(candidate.name);
    if (!name || !targetName) return false;
    return name === targetName || (name.length > 5 && targetName.length > 5 && (name.includes(targetName) || targetName.includes(name)));
  });
  return matches.slice(0, limit);
}

export function searchChannels(channels: Channel[], query: string, limit = 60): Channel[] {
  const normalized = normalizeChannelName(query);
  if (!normalized) return channels.slice(0, limit);
  const tokens = normalized.split(" ").filter((token) => token.length > 1);
  return channels
    .map((channel) => {
      const haystack = normalizeChannelName(`${channel.name} ${channel.group}`);
      let score = 0;
      for (const token of tokens) if (haystack.includes(token)) score += 1;
      if (normalizeChannelName(channel.name) === normalized) score += 3;
      return { channel, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.channel);
}
