import { json, requireSession, route } from "@/lib/api";
import { getPlayableVodStreams } from "@/lib/vod/service";
import { listSubtitles } from "@/lib/subs/service";
import { signStreamUrl, signSubtitleUrl, sanitizeHeaders } from "@/lib/stream-token";
import { getSync } from "@/lib/state/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("vod_streams", async (request) => {
  await requireSession("vod");
  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "movie";
  const id = params.get("id");
  if (!id) return json({ error: "Falta el id" }, { status: 400 });

  const [streams, subtitles] = await Promise.all([
    getPlayableVodStreams(type, id),
    listSubtitles(type, id).catch(() => []),
  ]);

  // The alignment each source was measured with, if it was measured: the same
  // copy has to land the same way on every screen of the house.
  const alignments = await Promise.all(
    streams.sources.map(async (source) => ({
      id: source.id,
      sync: await getSync(id, source.id).catch(() => null),
    })),
  );
  const syncBySource = new Map(alignments.map((entry) => [entry.id, entry.sync]));

  return json({
    type,
    id,
    sources: streams.sources.map((source) => ({
      id: source.id,
      addonName: source.addonName,
      title: source.title,
      description: source.description,
      quality: source.quality,
      height: source.height,
      sizeLabel: source.sizeLabel,
      cached: source.cached,
      /** Served from the swarm: the first play can take up to a minute. */
      viaTorrent: source.viaTorrent === true,
      /** The release had to be remuxed to HLS by the streaming server. */
      transcoded: source.transcoded === true,
      spanish: source.spanish,
      filename: source.filename,
      score: source.score,
      kind: streams.kinds[source.id],
      matchedSubtitleIds: source.addonId === "open-films" ? subtitles.filter((track) => track.addonId === "open-films").map((track) => track.id) : [],
      /** Alignment already measured for this title and source. */
      syncOffsetMs: syncBySource.get(source.id)?.offsetMs ?? null,
      syncConfidence: syncBySource.get(source.id)?.confidence ?? null,
      url: signStreamUrl(source.url, {
        headers: sanitizeHeaders(source.headers),
        kind: "vod",
        // The source travels with the token so an alignment measured for it
        // can be found again by the next device.
        sourceId: source.id,
      }),
    })),
    subtitles: subtitles.map((subtitle) => ({
      id: subtitle.id,
      label: `${subtitle.langLabel} · ${subtitle.addonName}${subtitle.forced ? " (forzados)" : ""}`,
      lang: subtitle.lang,
      forced: subtitle.forced,
      url: signSubtitleUrl(subtitle.url, undefined, { titleId: id }),
    })),
    addonsTried: streams.addonsTried,
    /** Whether the resolver that turns torrents into playable files answers. */
    resolver: streams.resolver,
    // Why nothing is playable, when nothing is. P2P-only means the providers
    // answered with BitTorrent hashes, which need a debrid resolver before a
    // browser can open them; it does not mean the title is unavailable.
    p2pOnly: streams.p2pOnly,
    unconfigured: streams.unconfigured,
    reason:
      streams.sources.length > 0
        ? null
        : streams.p2pOnly > 0
          ? `Los proveedores devolvieron ${streams.p2pOnly} fuente(s) P2P (torrent). El navegador no puede abrirlas: hace falta un resolver debrid configurado.`
          : streams.unconfigured.length > 0
            ? `Falta configurar ${streams.unconfigured.length} proveedor(es) de video con tu cuenta.`
            : "Ningún proveedor devolvió una fuente para este título.",
  });
});
