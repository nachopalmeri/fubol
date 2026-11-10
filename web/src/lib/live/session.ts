import { AddonSetupRequired, getStreams, type RawAddonStream } from "../addons";
import { signRelayUrl, signStreamUrl, sanitizeHeaders } from "../stream-token";
import { mapLimit } from "../http";
import { logger } from "../logger";
import { getChannelById, getLiveSource, normalizeChannelName, relatedChannels } from "./sources";
import { probeSource } from "./probe";
import { relayAvailable } from "./relay";
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
  /** The source asks for a relay but this host cannot run one (serverless). */
  relayBlocked?: boolean;
  relayHeight?: number;
  /**
   * How to ask the addon for this stream again. Providers that bind the
   * stream token to the caller's IP only accept it from the same address, so
   * the proxy re-resolves instead of replaying a URL minted elsewhere.
   */
  addon?: { i: string; t: string; s: string };
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
      addon: { i: channel.addon!.itemId, t: channel.addon!.type, s: channel.addon!.addonId },
    });
  }
  return candidates;
}

async function resolveAddonChannel(channel: Channel): Promise<Candidate[]> {
  if (!channel.addon) return [];
  const source = await getLiveSource(channel.sourceId);
  if (!source) throw new Error("Fuente de addon no encontrada");
  const ref = { id: channel.sourceId, name: channel.sourceName, url: source.url, kind: "live" as const };
  const streams = await getStreams(ref, channel.addon.type, channel.addon.itemId, { fresh: true });
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
    const configs = new Map(
      await Promise.all(
        all.map(async (item) => [item.id, (await getLiveSource(item.sourceId))?.config] as const),
      ),
    );
    const canRelay = relayAvailable();
    candidates = all.flatMap((item) => {
      const config = configs.get(item.id);
      const wantsRelay = config?.relay === true;
      return item.urls.map((url) => ({
        url,
        label:
          item.id === channel.id
            ? item.sourceName
            : `${item.sourceName} · ${normalizeChannelName(item.name) === normalizeChannelName(channel.name) ? "espejo" : item.name}`,
        channel: item,
        headers: item.headers,
        relay: wantsRelay && canRelay,
        relayBlocked: wantsRelay && !canRelay,
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

  const probe = (candidate: Candidate, timeoutMs: number) =>
    probeSource(candidate.url, {
      sourceId: candidate.channel.sourceId,
      channelId: candidate.channel.id,
      headers: candidate.headers,
      referer: candidate.referer,
      timeoutMs,
    });

  let probes = await mapLimit(list, 4, async (candidate) => ({
    candidate,
    probe: await probe(candidate, 7000),
  }));

  // A restreamer that has just been woken up (or that throttles a burst of
  // parallel requests) fails the whole first batch with a timeout. Retrying one
  // at a time with a longer budget recovers that case instead of telling the
  // viewer the channel is down.
  if (!probes.some((entry) => entry.probe.ok)) {
    logger.info("live_session_probe_retry", { channelId, candidates: probes.length });
    const retried = await mapLimit(list, 1, async (candidate) => ({
      candidate,
      probe: await probe(candidate, 12_000),
    }));
    probes = retried.map((entry, index) => (entry.probe.ok ? entry : probes[index] ?? entry));
  }

  const sorted = rankProbes(probes);
  const ok = sorted.filter((entry) => entry.probe.ok);
  const failed = sorted.filter((entry) => !entry.probe.ok);

  const playSources: PlaySource[] = ok.map(({ candidate, probe }) => toPlaySource(candidate, probe));
  // Rejected HTML, gates and unsupported media are not playable fallbacks.
  // Reanalysis can probe a recovered origin again without feeding it to Hls.js.

  if (playSources.length === 0) notes.push(rejectionNote(failed.map((entry) => entry.probe)));

  const dispersion = edgeDispersionNote(playSources);
  if (dispersion) notes.push(dispersion);

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
          addon: candidate.addon,
        }),
    kind: probe.kind === "mp4" ? "mp4" : "hls",
    score: probe.score,
    ttfbMs: probe.ttfbMs,
    edgeAgeS: probe.edgeAgeS,
    edgeTrust: probe.edgeTrust,
    targetDuration: probe.targetDuration,
    height: probe.height,
    note: [
      candidate.relay ? "Re-encode local: suma su propio delay" : null,
      candidate.relayBlocked
        ? "La fuente pedía re-encode y este servidor no lo hace: se sirve la señal original"
        : null,
      probe.edgeTrust === "implausible"
        ? "El origen informa un reloj imposible; su delay no se puede verificar"
        : null,
      probe.error,
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
    proxied: true,
    relayed: candidate.relay === true,
    headers: candidate.headers,
  };
}

/**
 * Explains why nothing played. "Ninguna fuente respondió" was accurate and
 * useless: in practice the addon answers a scheduled-but-unavailable match
 * with a placeholder like a Google page or its own /health endpoint, and the
 * probe rejects it. Saying which of those happened is the difference between
 * "esperá y reintentá" and "este partido no tiene señal todavía".
 */
function rejectionNote(probes: ProbeResult[]): string {
  if (probes.length === 0) return "La fuente no ofreció ninguna señal para este partido";
  const gates = probes.filter((probe) => probe.gate || probe.error?.includes("html")).length;
  const unsupported = probes.filter((probe) => probe.kind === "ts" || probe.error?.includes("Formato")).length;
  const dead = probes.filter((probe) => probe.error?.includes("respondió") || probe.error?.includes("Timeout")).length;
  if (gates === probes.length) {
    return "La fuente devolvió una página web en lugar de una señal: este partido todavía no tiene transmisión";
  }
  if (gates + unsupported === probes.length) {
    return `La fuente devolvió ${probes.length} entrada(s) que no son video reproducible: es agenda, no señal`;
  }
  if (dead > 0) {
    return `${dead} de ${probes.length} fuente(s) no respondieron. Puede ser momentáneo: probá "Reanalizar"`;
  }
  return `Se descartaron ${probes.length} fuente(s) por no ser video válido`;
}

/**
 * Four sources carrying the same match reported PROGRAM-DATE-TIME values up to
 * 33 seconds apart, so at most one of them can be right. When the readings
 * disagree that badly they cannot be compared against each other, and saying so
 * is more useful than ranking by a number that is mostly noise.
 */
const EDGE_DISPERSION_WARN_S = 10;

function edgeDispersionNote(sources: PlaySource[]): string | null {
  const ages = sources
    .filter((source) => source.edgeTrust === "measured" || source.edgeTrust === "extrapolated")
    .map((source) => source.edgeAgeS)
    .filter((age): age is number => age !== null);
  if (ages.length < 2) return null;
  const spread = Math.max(...ages) - Math.min(...ages);
  if (spread < EDGE_DISPERSION_WARN_S) return null;
  return `Las fuentes informan delays que difieren en ${Math.round(spread)} s: los relojes de origen no coinciden y el delay mostrado es aproximado`;
}
