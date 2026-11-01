import { json, requireSession, route } from "@/lib/api";
import { getPlayableVodStreams } from "@/lib/vod/service";
import { listSubtitles } from "@/lib/subs/service";
import { signStreamUrl, signSubtitleUrl, sanitizeHeaders } from "@/lib/stream-token";

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
      spanish: source.spanish,
      filename: source.filename,
      score: source.score,
      kind: streams.kinds[source.id],
      matchedSubtitleIds: source.addonId === "open-films" ? subtitles.filter((track) => track.addonId === "open-films").map((track) => track.id) : [],
      url: signStreamUrl(source.url, {
        headers: sanitizeHeaders(source.headers),
        kind: "vod",
      }),
    })),
    subtitles: subtitles.map((subtitle) => ({
      id: subtitle.id,
      label: `${subtitle.langLabel} · ${subtitle.addonName}${subtitle.forced ? " (forzados)" : ""}`,
      lang: subtitle.lang,
      forced: subtitle.forced,
      url: signSubtitleUrl(subtitle.url),
    })),
    addonsTried: streams.addonsTried,
  });
});
