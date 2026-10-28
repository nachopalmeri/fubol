import type { Metadata } from "next";
import Link from "next/link";
import TitleHero from "@/components/TitleHero";
import { IconAlert, IconPlay, IconSeries } from "@/components/icons";
import { requirePageSession } from "@/lib/auth";
import { withTimeout } from "@/lib/http";
import { getVodMeta } from "@/lib/vod/service";
import type { AddonMeta } from "@/lib/addons";

export const dynamic = "force-dynamic";

type Episode = NonNullable<AddonMeta["videos"]>[number];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = await withTimeout(getVodMeta("series", id), 9000, "metadata").catch(() => null);
  return { title: meta?.name ?? "Serie" };
}

function seasonName(season: number): string {
  if (season === 0) return "Especiales";
  return `Temporada ${season}`;
}

function episodeCode(episode: Episode): string {
  const season = episode.season ?? 0;
  const number = episode.episode ?? 0;
  return `S${String(season).padStart(2, "0")}E${String(number).padStart(2, "0")}`;
}

export default async function SeriesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession("vod");
  const { id } = await params;
  const meta = await withTimeout(getVodMeta("series", id), 15000, "metadata").catch(() => null);
  const name = meta?.name ?? "Serie sin metadata";
  const videos = meta?.videos ?? [];

  const seasons = new Map<number, Episode[]>();
  for (const video of videos) {
    const season = video.season ?? 0;
    const list = seasons.get(season) ?? [];
    list.push(video);
    seasons.set(season, list);
  }
  for (const list of seasons.values()) {
    list.sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0) || (a.released ?? "").localeCompare(b.released ?? ""));
  }
  const orderedSeasons = [...seasons.entries()].sort(([a], [b]) => a - b);
  const first = orderedSeasons.flatMap(([, list]) => list)[0];

  const credits = [
    meta?.director?.length ? `Dirección: ${meta.director.join(", ")}` : null,
    meta?.cast?.length ? `Reparto: ${meta.cast.slice(0, 5).join(", ")}` : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <main className="shell title-page">
      <Link href="/series" className="back-link">
        ← Volver a series
      </Link>

      <TitleHero
        name={name}
        poster={meta?.poster}
        eyebrow="Serie"
        meta={[
          meta?.imdbRating,
          meta?.year ?? meta?.releaseInfo,
          videos.length > 0 ? `${videos.length} episodios` : null,
        ]}
        description={meta?.description ?? undefined}
        tags={meta?.genres}
        credits={credits}
      >
        {first && (
          <div className="page-actions" style={{ marginTop: 4 }}>
            <Link
              href={`/watch/series/${encodeURIComponent(id)}?ep=${encodeURIComponent(first.id)}`}
              className="btn btn-primary"
            >
              <IconPlay size={16} /> Ver {episodeCode(first)}
            </Link>
          </div>
        )}
      </TitleHero>

      {!meta && (
        <div className="empty-inline" style={{ marginTop: 18 }}>
          <span className="empty-icon">
            <IconAlert size={20} />
          </span>
          <div>
            <h3>No encontramos metadata para esta serie</h3>
            <p>
              Sin metadata no hay lista de episodios. Podés probar a reproducir con el id{" "}
              <code>{id}</code>, pero lo normal es que un addon de streams necesite el id del
              episodio.
            </p>
            <Link
              href={`/watch/series/${encodeURIComponent(id)}`}
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 10 }}
            >
              Probar igual
            </Link>
          </div>
        </div>
      )}

      {meta && videos.length === 0 && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <IconSeries size={28} />
          <h2>Sin episodios en la metadata</h2>
          <p>
            El addon de metadata devolvió la serie pero no su lista de episodios. Probá con otro
            addon de metadata o buscá el título desde el addon de streams.
          </p>
          <Link href="/buscar" className="btn btn-ghost btn-sm">
            Buscar otro título
          </Link>
        </div>
      )}

      {orderedSeasons.length > 0 && (
        <div className="title-body">
          {orderedSeasons.map(([season, list]) => (
            <section className="season-block" key={season}>
              <div className="season-head">
                <h3>{seasonName(season)}</h3>
                <span>{list.length} episodios</span>
              </div>
              <div className="episode-list">
                {list.map((episode) => (
                  <Link
                    key={episode.id}
                    href={`/watch/series/${encodeURIComponent(id)}?ep=${encodeURIComponent(episode.id)}`}
                    className="episode-row"
                  >
                    <span className="episode-num">{episode.episode ?? "—"}</span>
                    <span className="episode-copy">
                      <strong>
                        {episodeCode(episode)} · {episode.title || `Episodio ${episode.episode ?? ""}`}
                      </strong>
                      <span>{episode.overview || episode.released || "Sin descripción"}</span>
                    </span>
                    <span className="episode-play">
                      <IconPlay size={13} /> Ver
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
