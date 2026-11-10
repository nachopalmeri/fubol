import { Suspense } from "react";
import Link from "next/link";
import FixtureCard from "@/components/FixtureCard";
import KickoffCountdown from "@/components/KickoffCountdown";
import PosterRow from "@/components/PosterRow";
import SearchShortcut from "@/components/SearchShortcut";
import { requirePageSession } from "@/lib/auth";
import {
  formatKickoffTime,
  getFixtures,
  liveFixtures,
  matchFixtureChannels,
  mergeChannelFixtures,
  todaysFixtures,
  type Fixture,
} from "@/lib/live/fixtures";
import { getAllChannels } from "@/lib/live/sources";
import { getHomeRows } from "@/lib/vod/service";
import { withTimeout } from "@/lib/http";
import { IconArrowRight, IconFilm, IconPlay, IconSettings } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requirePageSession();
  const canVod = session.role === "admin" || session.permissions.includes("vod");
  const canLive = session.role === "admin" || session.permissions.includes("live");
  const [rowsResult, fixturesResult, channelsResult] = await Promise.allSettled([
    canVod ? withTimeout(getHomeRows(12), 20000, "catalog") : Promise.resolve([]),
    canLive ? withTimeout(getFixtures({ daysBack: 0, daysForward: 1 }), 12000, "fixtures") : Promise.resolve([] as Fixture[]),
    canLive ? withTimeout(getAllChannels(), 8000, "channels") : Promise.resolve([]),
  ]);
  const rows = rowsResult.status === "fulfilled" ? rowsResult.value : [];
  const channels = channelsResult.status === "fulfilled" ? channelsResult.value : [];
  // A timeout is not an empty schedule. Keeping the two apart is the only way
  // the screen can say "se cayó el proveedor" instead of "no hay fútbol".
  const agendaFailed = fixturesResult.status === "rejected";
  const fixtures = mergeChannelFixtures(
    fixturesResult.status === "fulfilled" ? fixturesResult.value : [],
    channels,
  );
  const metas = rows.flatMap((row) => row.metas);
  // The hero should open something that plays; a torrent-only title is the
  // fallback, and it says so instead of promising a stream.
  const featured = metas.find((meta) => meta.playableId) ?? metas[0];
  const today = [...liveFixtures(fixtures), ...todaysFixtures(fixtures)]
    .filter((fixture, index, list) => list.findIndex((item) => item.id === fixture.id) === index)
    .slice(0, 5);
  // The next match with a configured channel is what a family link is opened
  // for, so it gets the hero instead of an empty welcome panel.
  const nextMatch = today
    .map((fixture) => matchFixtureChannels(fixture, channels))
    .find((match) => match.channels.length > 0);

  return (
    <>
      <SearchShortcut />
      <main className="shell home-shell">
        {nextMatch ? (
          <section className="home-match" aria-labelledby="match-title">
            <div className="home-match-copy">
              <span className="eyebrow">
                {nextMatch.fixture.status === "live" ? (
                  <>
                    <i className="live-dot" /> Se está jugando
                  </>
                ) : (
                  <>Próximo partido con señal</>
                )}
              </span>
              <h1 id="match-title">
                {nextMatch.fixture.home} <span className="home-match-vs">vs</span> {nextMatch.fixture.away}
              </h1>
              <p>
                {nextMatch.fixture.league} · {formatKickoffTime(nextMatch.fixture.kickoff)} h
                {" · "}
                <KickoffCountdown kickoff={nextMatch.fixture.kickoff} />
                {nextMatch.inferred ? " · señal probable" : ""}
              </p>
              <div className="home-feature-actions">
                {nextMatch.channels.slice(0, 2).map((channel) => (
                  <Link key={channel.id} className="btn btn-primary" href={`/watch/live/${channel.id}`}>
                    <IconPlay size={16} /> {channel.name.length > 24 ? `${channel.name.slice(0, 23)}…` : channel.name}
                  </Link>
                ))}
                <Link className="btn btn-ghost" href="/live">
                  Ver toda la agenda <IconArrowRight size={15} />
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        {featured ? (
          <section className="home-feature" aria-labelledby="feature-title">
            {featured.background || featured.poster ? (
              <img className="home-feature-art" src={featured.background || featured.poster} alt="" fetchPriority="high" />
            ) : null}
            <div className="home-feature-copy">
              <span className="eyebrow">
                {featured.playableId
                  ? "Disponible para reproducir"
                  : featured.p2p
                    ? "Fuentes P2P · necesita un resolver"
                    : "En tu biblioteca"}
              </span>
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
          })}</div> : agendaFailed ? <p className="agenda-empty agenda-error">No pudimos cargar la agenda: el proveedor de calendario no respondió. Los canales siguen disponibles en <Link className="text-link" href="/live">En vivo</Link>.</p> : <p className="agenda-empty">No hay partidos próximos en la agenda.</p>}
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
