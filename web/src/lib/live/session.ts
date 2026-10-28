import { getStreams, type RawAddonStream } from "../addons";
import { signStreamUrl, sanitizeHeaders } from "../stream-token";
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
  let candidates: Candidate[] = [];

  if (channel.addon) {
    try {
      candidates = await resolveAddonChannel(channel);
    } catch (error) {
      notes.push("El addon de vivo no respondió");
      logger.warn("addon_live_resolve_failed", { channelId, error });
    }
  }

  if (candidates.length === 0) {
    const siblings = await relatedChannels(channel, 5);
    const all = [channel, ...siblings];
    candidates = all.flatMap((item) =>
      item.urls.map((url) => ({
        url,
        label:
          item.id === channel.id
            ? item.sourceName
            : `${item.sourceName} · ${normalizeChannelName(item.name) === normalizeChannelName(channel.name) ? "espejo" : item.name}`,
        channel: item,
        headers: item.headers,
      })),
    );
  }

  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.url)) unique.set(candidate.url, candidate);
  }
  const list = [...unique.values()].slice(0, maxSources);

  if (list.length === 0) {
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
  // Even failed probes can recover; put the best two last as manual retries.
  for (const { candidate, probe } of failed.slice(0, 2)) {
    playSources.push({
      ...toPlaySource(candidate, probe),
      score: 0,
      note: probe.error ?? "No se pudo verificar",
    });
  }

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
  return {
    id: `${candidate.channel.id}:${probe.url.slice(-24)}`,
    label: candidate.label,
    url: signStreamUrl(probe.url, {
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
    note: probe.error,
    proxied: true,
    headers: candidate.headers,
  };
}
