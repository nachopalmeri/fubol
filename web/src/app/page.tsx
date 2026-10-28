import type { CSSProperties } from "react";
import { Suspense } from "react";
import Link from "next/link";
import FixtureCard, { TeamBadge } from "@/components/FixtureCard";
import PosterRow from "@/components/PosterRow";
import SearchShortcut from "@/components/SearchShortcut";
import { requirePageSession } from "@/lib/auth";
import { getFixtures, liveFixtures, matchFixtureChannels, todaysFixtures, formatKickoff, type Fixture } from "@/lib/live/fixtures";
import { getAllChannels } from "@/lib/live/sources";
import { getHomeRows } from "@/lib/vod/service";
import { withTimeout } from "@/lib/http";
import { IconArrowRight, IconBall, IconFilm, IconPlay, IconSettings, IconSpark, IconTv } from "@/components/icons";

export const dynamic = "force-dynamic";

function hue(name: string): number {
  let value = 0;
  for (const char of name) value = (value * 31 + char.charCodeAt(0)) % 360;
  return value;
}

function dateLabel(): string {
  const label = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function loadHomeData() {
  const [fixtures, channels] = await Promise.all([
    withTimeout(getFixtures({ daysBack: 0, daysForward: 1 }), 12000, "fixtures").catch(() => [] as Fixture[]),
    withTimeout(getAllChannels(), 8000, "channels").catch(() => []),
  ]);
  return { fixtures, channels };
}

export default async function HomePage() {
  const session = await requirePageSession();
  const { fixtures, channels } = await loadHomeData();
  const isAdmin = session.role === "admin";
  const live = liveFixtures(fixtures);
  const today = todaysFixtures(fixtures);
  const matches = new Map(fixtures.map((fixture) => [fixture.id, matchFixtureChannels(fixture, channels)]));
  const liveMatches = live.map((fixture) => matches.get(fixture.id)).filter((match) => match !== undefined);
  const hero =
    liveMatches.find((match) => match.channels.length > 0) ??
    liveMatches[0] ??
    today
      .filter((fixture) => fixture.kickoff > Date.now())
      .map((fixture) => matches.get(fixture.id))
      .find((match) => match !== undefined && match.channels.length > 0) ??
    today.map((fixture) => matches.get(fixture.id)).find((match) => match !== undefined);

  const restLive = liveMatches.filter((match) => match.fixture.id !== hero?.fixture.id);
  const todaySorted = [...today].sort((a, b) => {
    const rank = (fixture: Fixture) => (fixture.status === "live" ? 0 : fixture.status === "scheduled" ? 1 : 2);
    return rank(a) - rank(b) || a.kickoff - b.kickoff;
  });

  return (
    <>
      <SearchShortcut />
      <main className="shell">
        <div className="page-kicker">
          <span className="eyebrow">
            <IconBall size={14} /> Fubol
          </span>
          <span className="page-date">{dateLabel()}</span>
        </div>

        {hero ? (
          <section className="hero">
            <article className="hero-main" style={{ "--hue": hue(hero.fixture.home) } as CSSProperties}>
              <div className="hero-glow" aria-hidden />
              <header className="hero-head">
                <span className={`status-pill status-${hero.fixture.status === "live" ? "live" : "scheduled"}`}>
                  {hero.fixture.status === "live" && <i className="live-dot" />}
                  {hero.fixture.status === "live" ? "AHORA EN VIVO" : "PRÓXIMO PARTIDO"}
                </span>
                <span className="hero-league">{hero.fixture.league}</span>
              </header>

              <div className="hero-teams">
                <div className="hero-team">
                  <TeamBadge name={hero.fixture.home} size="lg" />
                  <h1>{hero.fixture.home}</h1>
                </div>
                <div className="hero-vs">
                  {hero.fixture.score ? <strong>{hero.fixture.score}</strong> : <span>VS</span>}
                  <small>{formatKickoff(hero.fixture.kickoff)}</small>
                </div>
                <div className="hero-team hero-team-away">
                  <TeamBadge name={hero.fixture.away} size="lg" />
                  <h1>{hero.fixture.away}</h1>
                </div>
              </div>

              <footer className="hero-foot">
                <div className="hero-channels">
                  {hero.channels.length > 0 ? (
                    hero.channels.slice(0, 3).map((channel, index) => (
                      <Link
                        key={channel.id}
                        href={`/watch/live/${channel.id}`}
                        className={index === 0 ? "btn btn-primary" : "btn btn-ghost"}
                      >
                        <IconPlay size={16} /> {channel.name}
                      </Link>
                    ))
                  ) : (
                    <Link href="/live" className="btn btn-primary">
                      <IconTv size={16} /> Ver canales disponibles
                    </Link>
                  )}
                </div>
                <p className="hero-note">
                  {hero.channels.length > 0
                    ? "Elegí un canal y dale play. Fubol elige la fuente más cercana al vivo y cambia sola si se cae."
                    : "Todavía no hay una señal asociada a este partido. Podés usar tu lista de canales."}
                </p>
              </footer>
            </article>

            <aside className="hero-side">
              <div className="side-head">
                <h2>Hoy</h2>
                <Link href="/live">
                  Agenda <IconArrowRight size={14} />
                </Link>
              </div>
              <div className="side-list">
                {todaySorted.slice(0, 5).map((fixture) => {
                  const match = matches.get(fixture.id);
                  if (!match) return null;
                  return <FixtureCard key={fixture.id} match={match} variant="row" />;
                })}
                {todaySorted.length === 0 && (
                  <p className="side-empty">
                    No hay partidos en la agenda de hoy. Podés mirar canales igual desde “En vivo”.
                  </p>
                )}
              </div>
              <div className="side-stats">
                <div>
                  <strong>{live.length}</strong>
                  <span>en vivo</span>
                </div>
                <div>
                  <strong>{today.length}</strong>
                  <span>hoy</span>
                </div>
                <div>
                  <strong>{channels.length}</strong>
                  <span>canales</span>
                </div>
              </div>
            </aside>
          </section>
        ) : (
          <section className="hero-empty">
            <span className="eyebrow">
              <IconSpark size={14} /> Sin agenda
            </span>
            <h1>Fubol está listo para tu primera señal.</h1>
            <p>
              La agenda de fútbol se carga desde TheSportsDB y tus calendarios ICS. Para ver un
              partido necesitás al menos una fuente: tu lista M3U, tu cuenta Xtream o un canal HLS.
            </p>
            {isAdmin ? (
              <Link href="/admin" className="btn btn-primary">
                <IconSettings size={16} /> Configurar fuentes
              </Link>
            ) : (
              <p className="muted">Pedile a quien administra el link que agregue una fuente.</p>
            )}
          </section>
        )}

        {restLive.length > 0 && (
          <section className="section">
            <div className="section-head">
              <div>
                <h2>En vivo ahora</h2>
                <p>Señales activas, ordenadas por cercanía al vivo.</p>
              </div>
              <Link href="/live" className="section-link">
                Ver agenda <IconArrowRight size={15} />
              </Link>
            </div>
            <div className="fixture-grid">
              {restLive.map((match) => (
                <FixtureCard key={match.fixture.id} match={match} />
              ))}
            </div>
          </section>
        )}

        {todaySorted.length > 0 && (
          <section className="section">
            <div className="section-head">
              <div>
                <h2>Hoy en el fútbol</h2>
                <p>Liga Profesional, copas y las ligas que sigas. Hora argentina.</p>
              </div>
            </div>
            <div className="fixture-grid">
              {todaySorted.slice(0, 9).map((fixture) => {
                const match = matches.get(fixture.id);
                return match ? <FixtureCard key={fixture.id} match={match} /> : null;
              })}
            </div>
          </section>
        )}

        <Suspense fallback={<div className="rows-skeleton" aria-hidden />}>
          <VodSections />
        </Suspense>

        <section className="cta-band">
          <div>
            <span className="eyebrow">Un link para todos</span>
            <h2>La familia entra desde el navegador.</h2>
            <p>
              Sin instalar, sin cuentas. Se abre en el celular, la tablet o la compu y se ve igual.
              El administrador puede revocar el acceso cuando quiera.
            </p>
          </div>
          <div className="cta-actions">
            <Link href="/buscar" className="btn btn-primary">
              Buscar película o serie
            </Link>
            <Link href="/live" className="btn btn-ghost">
              Ver canales
            </Link>
          </div>
        </section>

        <footer className="footer">
          <span className="brand-mark brand-mark-small">
            <IconBall size={14} />
          </span>
          <p>
            Fubol · uso privado. La latencia depende del origen; se elige la mejor señal y se
            cambia de fuente automáticamente. Sin anuncios.
          </p>
        </footer>
      </main>
    </>
  );
}

async function VodSections() {
  const rows = await withTimeout(getHomeRows(12), 20000, "catálogos").catch(() => []);
  const movies = rows.filter((row) => row.catalog.type === "movie");
  const series = rows.filter((row) => row.catalog.type === "series");
  const movieMetas = movies.flatMap((row) => row.metas).slice(0, 4).flatMap((meta) => [meta]);
  const seriesMetas = series.flatMap((row) => row.metas);

  return (
    <>
      {movieMetas.length > 0 && (
        <PosterRow
          title="Películas"
          subtitle={movies[0]?.catalog.name ?? "Catálogo de tus addons"}
          metas={movieMetas}
          href="/peliculas"
        />
      )}
      {seriesMetas.length > 0 && (
        <PosterRow
          title="Series"
          subtitle={series[0]?.catalog.name ?? "Catálogo de tus addons"}
          metas={seriesMetas.slice(0, 16)}
          href="/series"
        />
      )}
      {movieMetas.length === 0 && seriesMetas.length === 0 && (
        <section className="section">
          <div className="empty-inline">
            <span className="empty-icon">
              <IconFilm size={22} />
            </span>
            <div>
              <h3>Películas y series</h3>
              <p>
                Todavía no hay un catálogo conectado. Un administrador puede agregar su addon de
                metadata o de streams desde el panel.
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

