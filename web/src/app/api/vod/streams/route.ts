import { json, requireSession, route } from "@/lib/api";
import { getPlayableVodStreams } from "@/lib/vod/service";
import { listSubtitles } from "@/lib/subs/service";
import { signStreamUrl, signSubtitleUrl, sanitizeHeaders } from "@/lib/stream-token";
import { alignmentsFor } from "@/lib/state/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Track ids are only unique inside their addon: two providers can both call a
 * track "1". The pair is what identifies it, and what its alignment is kept by.
 */
function trackKey(addonId: string, id: string): string {
  return `${addonId}:${id}`;
}

export const GET = route("vod_streams", async (request) => {
  await requireSession("vod");
  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "movie";
  const id = params.get("id");
  if (!id) return json({ error: "Falta el id" }, { status: 400 });

  const [streams, subtitles, alignments] = await Promise.all([
    getPlayableVodStreams(type, id),
    listSubtitles(type, id).catch(() => []),
    // What the house already measured or set for this title: every screen
    // starts aligned instead of measuring again.
    alignmentsFor(id).catch(() => []),
  ]);

  const openFilmTracks = subtitles
    .filter((track) => track.addonId === "open-films")
    .map((track) => trackKey(track.addonId, track.id));

  return json({
    type,
    id,
    sources: streams.sources.map((source) => ({
      id: source.id,
      copyId: source.copyId,
      addonName: source.addonName,
      title: source.title,
      releaseName: source.releaseName,
      releaseTags: source.releaseTags,
      languages: source.languages,
      seeders: source.seeders,
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
      matchedSubtitleIds: source.addonId === "open-films" ? openFilmTracks : [],
      url: signStreamUrl(source.url, {
        headers: sanitizeHeaders(source.headers),
        kind: "vod",
        // The copy travels with the token, so an alignment measured for it
        // is found again by the next device and by the next visit.
        sourceId: source.copyId,
      }),
    })),
    subtitles: subtitles.map((subtitle) => {
      const key = trackKey(subtitle.addonId, subtitle.id);
      return {
        id: key,
        label: subtitle.langLabel,
        provider: subtitle.addonName,
        lang: subtitle.lang,
        forced: subtitle.forced,
        url: signSubtitleUrl(subtitle.url, undefined, { titleId: id, trackId: key }),
      };
    }),
    alignments,
    addonsTried: streams.addonsTried,
    /** Whether the resolver that turns torrents into playable files answers. */
    resolver: streams.resolver,
    // Why nothing is playable, when nothing is. P2P-only means the providers
    // answered with BitTorrent hashes, which need a resolver before a browser
    // can open them; it does not mean the title is unavailable.
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
