import { Suspense } from "react";
import Link from "next/link";
import FixtureCard from "@/components/FixtureCard";
import PosterRow from "@/components/PosterRow";
import SearchShortcut from "@/components/SearchShortcut";
import { requirePageSession } from "@/lib/auth";
import { getFixtures, matchFixtureChannels, todaysFixtures, type Fixture } from "@/lib/live/fixtures";
import { getAllChannels } from "@/lib/live/sources";
import { getHomeRows } from "@/lib/vod/service";
import { withTimeout } from "@/lib/http";
import { IconArrowRight, IconFilm, IconSettings } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requirePageSession();
  const canVod = session.role === "admin" || session.permissions.includes("vod");
  const canLive = session.role === "admin" || session.permissions.includes("live");
  const [rows, fixtures, channels] = await Promise.all([
    canVod ? withTimeout(getHomeRows(12), 20000, "catalog").catch(() => []) : [],
    canLive ? withTimeout(getFixtures({ daysBack: 0, daysForward: 1 }), 12000, "fixtures").catch(() => [] as Fixture[]) : [],
    canLive ? withTimeout(getAllChannels(), 8000, "channels").catch(() => []) : [],
  ]);
  const metas = rows.flatMap((row) => row.metas);
  const featured = metas[0];
  const today = todaysFixtures(fixtures).slice(0, 5);

  return (
    <>
      <SearchShortcut />
      <main className="shell home-shell">
        {featured ? (
          <section className="home-feature" aria-labelledby="feature-title">
            {featured.background || featured.poster ? (
              <img className="home-feature-art" src={featured.background || featured.poster} alt="" fetchPriority="high" />
            ) : null}
            <div className="home-feature-copy">
              <span className="eyebrow">Disponible para reproducir</span>
              <h1 id="feature-title">{featured.name}</h1>
              <p>{featured.description || [featured.releaseInfo, featured.genres?.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || "En tu biblioteca"}</p>
              <div className="home-feature-actions">
                <Link className="btn btn-primary" href={featured.type === "series" && featured.playableId ? `/watch/series/${encodeURIComponent(featured.id)}?ep=${encodeURIComponent(featured.playableId)}` : `/${featured.type === "series" ? "series" : "movie"}/${encodeURIComponent(featured.id)}`}>
                  Ver título <IconArrowRight size={16} />
                </Link>
                <Link className="btn btn-ghost" href="/buscar">Explorar catálogo</Link>
              </div>
            </div>
          </section>
        ) : (
          <section className="home-empty" aria-labelledby="home-title">
            <div className="home-empty-copy">
              <span className="eyebrow"><IconFilm size={15} /> Tu espacio familiar</span>
              <h1 id="home-title">{canVod ? "Una biblioteca compartida, lista para explorar." : "Tu acceso familiar en vivo."}</h1>
              <p>{canVod ? "No hay títulos con una fuente de reproducción verificada ahora. Cuando se configure una fuente compatible, acá aparecerán películas y series disponibles." : "Este link tiene acceso a los canales y la agenda. La disponibilidad depende de las fuentes configuradas."}</p>
              <div className="home-feature-actions">
                {session.role === "admin" ? <Link className="btn btn-primary" href="/admin"><IconSettings size={16} /> Revisar configuración</Link> : null}
                {canVod ? <><Link className="btn btn-ghost" href="/buscar">Buscar títulos</Link><Link className="text-link" href="/aprender">Aprender inglés <IconArrowRight size={15} /></Link></> : <Link className="btn btn-primary" href="/live">Ver canales</Link>}
              </div>
            </div>
            <div className="home-empty-mark" aria-hidden="true"><IconFilm size={42} /></div>
          </section>
        )}

        <Suspense fallback={<div className="rows-skeleton" aria-hidden="true" />}>
          <VodSections rows={rows} />
        </Suspense>

        {canLive && <section className="section agenda-section" aria-labelledby="agenda-title">
          <div className="section-head">
            <div><span className="eyebrow">Agenda · no es una señal</span><h2 id="agenda-title">Fútbol próximo</h2><p>Partidos programados. Si el calendario no informa el canal, se sugiere una señal argentina y se marca como probable.</p></div>
            <Link href="/live" className="section-link">Ver agenda <IconArrowRight size={15} /></Link>
          </div>
          {today.length ? <div className="fixture-grid">{today.map((fixture) => {
            const match = matchFixtureChannels(fixture, channels);
            return <FixtureCard key={fixture.id} match={match} />;
          })}</div> : <p className="agenda-empty">No hay partidos próximos en la agenda.</p>}
        </section>}

      </main>
    </>
  );
}

function VodSections({ rows }: { rows: Awaited<ReturnType<typeof getHomeRows>> }) {
  const movies = rows.filter((row) => row.catalog.type === "movie");
  const series = rows.filter((row) => row.catalog.type === "series");
  return <>
    {movies.map((row) => <PosterRow key={row.catalog.id} title={row.catalog.name || "Películas"} metas={row.metas} href="/peliculas" />)}
    {series.map((row) => <PosterRow key={row.catalog.id} title={row.catalog.name || "Series"} metas={row.metas} href="/series" />)}
  </>;
}
