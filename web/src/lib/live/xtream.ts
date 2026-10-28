import { fetchJson } from "../http";
import { shortHash } from "../crypto";
import type { Channel, LiveSource, LiveSourceConfig } from "./types";

export interface XtreamCredentials {
  username: string;
  password: string;
  output: "m3u8" | "ts";
}

interface XtreamLiveStream {
  stream_id: number | string;
  name: string;
  stream_icon?: string;
  category_id?: string | number;
  tv_archive?: number | string;
  stream_type?: string;
}

interface XtreamCategory {
  category_id: string | number;
  category_name: string;
}

export function parseXtreamConfig(config: LiveSourceConfig): XtreamCredentials {
  const raw = config as LiveSourceConfig & {
    username?: string;
    password?: string;
    output?: string;
  };
  if (!raw.username || !raw.password) {
    throw new Error("Xtream necesita username y password en la configuración");
  }
  return {
    username: raw.username,
    password: raw.password,
    output: raw.output === "ts" ? "ts" : "m3u8",
  };
}

export function xtreamBase(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/player_api\.php$/i, "")
    .replace(/\/get\.php$/i, "");
}

export function xtreamLiveUrl(
  base: string,
  credentials: XtreamCredentials,
  streamId: string | number,
): string {
  return `${xtreamBase(base)}/live/${encodeURIComponent(credentials.username)}/${encodeURIComponent(
    credentials.password,
  )}/${streamId}.${credentials.output}`;
}

export function xtreamApiUrl(
  base: string,
  credentials: XtreamCredentials,
  action: string,
): string {
  const params = new URLSearchParams({
    username: credentials.username,
    password: credentials.password,
    action,
  });
  return `${xtreamBase(base)}/player_api.php?${params.toString()}`;
}

export async function fetchXtreamChannels(source: LiveSource): Promise<Channel[]> {
  const credentials = parseXtreamConfig(source.config);
  const [streamsResult, categoriesResult] = await Promise.allSettled([
    fetchJson<XtreamLiveStream[]>(xtreamApiUrl(source.url, credentials, "get_live_streams"), {
      timeoutMs: 15000,
    }),
    fetchJson<XtreamCategory[]>(xtreamApiUrl(source.url, credentials, "get_live_categories"), {
      timeoutMs: 12000,
    }),
  ]);

  if (streamsResult.status === "rejected") throw streamsResult.reason;
  const streams = streamsResult.value.data;
  if (!Array.isArray(streams)) throw new Error("Xtream no devolvió canales");

  const categories = new Map<string, string>();
  if (categoriesResult.status === "fulfilled" && Array.isArray(categoriesResult.value.data)) {
    for (const category of categoriesResult.value.data) {
      categories.set(String(category.category_id), category.category_name);
    }
  }

  const filter = source.config.groupFilter?.toLowerCase();
  return streams
    .filter((stream) => stream && stream.stream_id !== undefined)
    .map((stream) => {
      const group = categories.get(String(stream.category_id ?? "")) ?? "IPTV";
      return {
        id: shortHash(`xtream:${source.id}:${stream.stream_id}`, 16),
        name: String(stream.name ?? "Canal"),
        group,
        logo: stream.stream_icon || undefined,
        sourceId: source.id,
        sourceName: source.name,
        kind: "xtream" as const,
        urls: [xtreamLiveUrl(source.url, credentials, stream.stream_id)],
        headers: source.config.headers,
      };
    })
    .filter((channel) => !filter || channel.group.toLowerCase().includes(filter));
}
