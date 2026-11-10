import type { EdgeTrust } from "./playlist";

export type { EdgeTrust };

export type LiveSourceKind = "hls" | "m3u" | "xtream" | "addon";

export interface DirectChannel {
  name: string;
  url: string;
  group?: string;
  logo?: string;
  tvgId?: string;
  headers?: Record<string, string>;
}

export interface LiveSourceConfig {
  channels?: DirectChannel[];
  groupFilter?: string;
  headers?: Record<string, string>;
  catalogId?: string;
  catalogType?: string;
  referer?: string;
  /** Optional group label for a single-URL source. */
  group?: string;
  /** Re-encode through the local relay when the origin is not browser-compatible. */
  relay?: boolean;
  relayHeight?: number;
}

export interface LiveSource {
  id: string;
  kind: LiveSourceKind;
  name: string;
  url: string;
  config: LiveSourceConfig;
  enabled: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
}

export interface Channel {
  id: string;
  name: string;
  group: string;
  logo?: string;
  tvgId?: string;
  sourceId: string;
  sourceName: string;
  kind: LiveSourceKind;
  /** Direct playable URLs, best first. */
  urls: string[];
  headers?: Record<string, string>;
  /** Addon-backed channel: resolved on demand. */
  addon?: { addonId: string; type: string; itemId: string };
  drm?: boolean;
}

export interface ProbeResult {
  url: string;
  sourceId?: string;
  channelId?: string;
  ok: boolean;
  kind: "hls" | "mp4" | "ts" | "unknown";
  score: number;
  ttfbMs: number;
  /** Null unless the playlist carried a usable PROGRAM-DATE-TIME. */
  edgeAgeS: number | null;
  edgeTrust: EdgeTrust;
  /** Unclamped edge reading, kept even when rejected, for diagnostics. */
  edgeRawS: number | null;
  targetDuration: number | null;
  live: boolean;
  height: number | null;
  bitrate: number | null;
  error?: string;
  gate?: string;
  checkedAt: number;
}

export interface PlaySource {
  id: string;
  label: string;
  url: string;
  kind: "hls" | "mp4";
  score: number;
  ttfbMs: number;
  edgeAgeS: number | null;
  edgeTrust: EdgeTrust;
  /** Segment length at the origin: the player sizes its buffer from this. */
  targetDuration: number | null;
  height: number | null;
  note?: string;
  /** True when the URL must go through /api/stream (no CORS or custom headers). */
  proxied: boolean;
  /** Playback goes through the local ffmpeg relay, which adds its own delay. */
  relayed?: boolean;
  headers?: Record<string, string>;
}
