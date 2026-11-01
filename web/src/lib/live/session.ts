import { AddonSetupRequired, getStreams, type RawAddonStream } from "../addons";
import { signRelayUrl, signStreamUrl, sanitizeHeaders } from "../stream-token";
import { mapLimit } from "../http";
import { logger } from "../logger";
import { getChannelById, getLiveSource, normalizeChannelName, relatedChannels } from "./sources";
import { probeSource } from "./probe";
import { rankProbes } from "./rank";
import type { Channel, PlaySource, ProbeResult } from "./types";

export interface LiveSession {
  channel: Channel;
  sources: PlaySource[];
  failed: number;
  checkedAt: number;
  notes: string[];
}

interface Candidate {
  url: string;
  label: string;
  channel: Channel;
  headers?: Record<string, string>;
  referer?: string;
  /** Origin is not browser-compatible and must be re-encoded by the local relay. */
  relay?: boolean;
  relayHeight?: number;
}

function addonCandidates(
  channel: Channel,
  source: { id: string; name: string; url: string },
  streams: RawAddonStream[],
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const stream of streams) {
    if (!stream.url) continue;
    const requestHeaders = sanitizeHeaders(stream.behaviorHints?.proxyHeaders?.request);
    const height = /2160p|4k/i.test(`${stream.name} ${stream.title}`)
      ? 2160
      : /1080p/i.test(`${stream.name} ${stream.title}`)
        ? 1080
        : /720p/i.test(`${stream.name} ${stream.title}`)
          ? 720
          : null;
    candidates.push({
      url: stream.url,
      label: `${source.name}${height ? ` · ${height}p` : ""}`,
      channel,
      headers: requestHeaders,
    });
  }
  return candidates;
}

async function resolveAddonChannel(channel: Channel): Promise<Candidate[]> {
  if (!channel.addon) return [];
  const source = getLiveSource(channel.sourceId);
  if (!source) throw new Error("Fuente de addon no encontrada");
  const ref = { id: channel.sourceId, name: channel.sourceName, url: source.url, kind: "live" as const };
  const streams = await getStreams(ref, channel.addon.type, channel.addon.itemId);
  return addonCandidates(channel, source, streams);
}

export async function buildLiveSession(channelId: string, maxSources = 6): Promise<LiveSession> {
  const channel = await getChannelById(channelId);
  if (!channel) throw new Error("Canal no encontrado");

  const notes: string[] = [];
  let setupRequired: AddonSetupRequired | null = null;
  let candidates: Candidate[] = [];

  if (channel.addon) {
    try {
      candidates = await resolveAddonChannel(channel);
    } catch (error) {
      if (error instanceof AddonSetupRequired) setupRequired = error;
      notes.push(error instanceof AddonSetupRequired ? "La fuente necesita actualizar su configuración" : "El addon de vivo no respondió");
      logger.warn("addon_live_resolve_failed", { channelId, error });
    }
  }

  if (candidates.length === 0) {
    const siblings = await relatedChannels(channel, 5);
    const all = [channel, ...siblings];
    candidates = all.flatMap((item) => {
      const config = getLiveSource(item.sourceId)?.config;
      return item.urls.map((url) => ({
        url,
        label:
          item.id === channel.id
            ? item.sourceName
            : `${item.sourceName} · ${normalizeChannelName(item.name) === normalizeChannelName(channel.name) ? "espejo" : item.name}`,
        channel: item,
        headers: item.headers,
        relay: config?.relay === true,
        relayHeight: config?.relayHeight,
      }));
    });
  }

  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = `${candidate.relay ? "relay:" : ""}${candidate.url}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  const list = [...unique.values()].slice(0, maxSources);

  if (list.length === 0) {
    if (setupRequired) throw setupRequired;
    throw new Error("Este canal no tiene fuentes configuradas");
  }

  const probes = await mapLimit(list, 4, async (candidate) => ({
    candidate,
    probe: await probeSource(candidate.url, {
      sourceId: candidate.channel.sourceId,
      channelId: candidate.channel.id,
      headers: candidate.headers,
      referer: candidate.referer,
      timeoutMs: 7000,
    }),
  }));

  const sorted = rankProbes(probes);
  const ok = sorted.filter((entry) => entry.probe.ok);
  const failed = sorted.filter((entry) => !entry.probe.ok);

  const playSources: PlaySource[] = ok.map(({ candidate, probe }) => toPlaySource(candidate, probe));
  // Rejected HTML, gates and unsupported media are not playable fallbacks.
  // Reanalysis can probe a recovered origin again without feeding it to Hls.js.

  if (playSources.length === 0) notes.push("Ninguna fuente respondió");

  return {
    channel,
    sources: playSources,
    failed: failed.length,
    checkedAt: Date.now(),
    notes,
  };
}

function toPlaySource(candidate: Candidate, probe: ProbeResult): PlaySource {
  const targetHeight = probe.height && probe.height >= 720
    ? 720
    : probe.height && probe.height > 0
      ? 480
      : candidate.relayHeight ?? 720;
  return {
    id: `${candidate.channel.id}:${probe.url.slice(-24)}`,
    label: candidate.relay ? `${candidate.label} · relay` : candidate.label,
    url: candidate.relay
      ? signRelayUrl(probe.url, {
          headers: candidate.headers,
          referer: candidate.referer,
          sourceId: candidate.channel.sourceId,
          height: targetHeight,
        })
      : signStreamUrl(probe.url, {
          headers: candidate.headers,
          referer: candidate.referer,
          sourceId: candidate.channel.sourceId,
          kind: "live",
        }),
    kind: probe.kind === "mp4" ? "mp4" : "hls",
    score: probe.score,
    ttfbMs: probe.ttfbMs,
    edgeAgeS: probe.edgeAgeS,
    height: probe.height,
    note: [candidate.relay ? "Re-encode local para compatibilidad web" : null, probe.error]
      .filter(Boolean)
      .join(" · ") || undefined,
    proxied: true,
    headers: candidate.headers,
  };
}
