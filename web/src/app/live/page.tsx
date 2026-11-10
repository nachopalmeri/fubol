import type { Metadata } from "next";
import Link from "next/link";
import ChannelBrowser from "@/components/ChannelBrowser";
import FixtureCard from "@/components/FixtureCard";
import {
  dateKeyInTz,
  formatKickoff,
  getFixtures,
  liveFixtures,
  matchFixtureChannels,
  mergeChannelFixtures,
  todaysFixtures,
  type Fixture,
} from "@/lib/live/fixtures";
import { getAllChannels } from "@/lib/live/sources";
import { env } from "@/lib/env";
import { requirePageSession } from "@/lib/auth";
import { withTimeout } from "@/lib/http";
import { IconArrowRight, IconBall, IconSettings, IconSpark, IconTv } from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "En vivo",
  description: "Agenda de fútbol y canales disponibles, con failover automático.",
};

function dayLabel(key: string, sampleKickoff: number): string {
  const timeZone = env.timezone;
  const today = dateKeyInTz(new Date(), timeZone);
  const tomorrow = dateKeyInTz(new Date(Date.now() + 86_400_000), timeZone);
  if (key === today) return "Hoy";
  if (key === tomorrow) return "Mañana";
  const formatted = new Intl.DateTimeFormat("es-AR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(sampleKickoff));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export default async function LivePage() {
  const session = await requirePageSession("live");
  const [fixturesResult, channelsResult] = await Promise.allSettled([
    withTimeout(getFixtures({ daysBack: 1, daysForward: 2 }), 15000, "fixtures"),
    withTimeout(getAllChannels(), 9000, "channels"),
  ]);
  // Distinguishing a failure from an empty result is the difference between
  // "no hay fútbol hoy" and "el proveedor no respondió". They used to render
  // the same empty state.
  const agendaFailed = fixturesResult.status === "rejected";
  const channelsFailed = channelsResult.status === "rejected";
  const channels = channelsResult.status === "fulfilled" ? channelsResult.value : [];
  const fixtures = mergeChannelFixtures(
    fixturesResult.status === "fulfilled" ? fixturesResult.value : [],
    channels,
  );

  const now = Date.now();
  const live = liveFixtures(fixtures, now);
  const today = todaysFixtures(fixtures, now);
  const matches = fixtures.map((fixture) => matchFixtureChannels(fixture, channels));
  const byId = new Map(matches.map((match) => [match.fixture.id, match]));
  const isAdmin = session.role === "admin";

  const groups = new Map<string, Fixture[]>();
  for (const fixture of fixtures) {
    const key = dateKeyInTz(new Date(fixture.kickoff), env.timezone);
    const list = groups.get(key) ?? [];
    list.push(fixture);
    groups.set(key, list);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <main className="shell">
      <header className="page-head">
        <div>
          <span className="eyebrow">
            <IconTv size={14} /> Señales y agenda
          </span>
          <h1>En vivo</h1>
          <p>
            {live.length > 0
              ? `${live.length} partido${live.length === 1 ? "" : "s"} en curso según el horario. `
              : "No hay partidos en curso ahora mismo. "}
            Elegí un canal o un partido con señal asociada. Hora argentina.
          </p>
        </div>
        <div className="page-actions">
          {isAdmin && (
            <Link href="/admin" className="btn btn-ghost btn-sm">
              <IconSettings size={15} /> Configurar fuentes
            </Link>
          )}
          <Link href="/buscar" className="btn btn-primary btn-sm">
            Buscar película o serie <IconArrowRight size={15} />
          </Link>
        </div>
      </header>

      {channels.length === 0 && (
        <div className="empty-inline" style={{ marginBottom: 26 }}>
          <span className="empty-icon">
            <IconSpark size={20} />
          </span>
          <div>
            <h3>{channelsFailed ? "No pudimos cargar los canales" : "No hay canales cargados"}</h3>
            <p>
              {channelsFailed
                ? "Las fuentes configuradas no respondieron a tiempo. No es que no haya canales: volvé a cargar la página en unos segundos."
                : isAdmin
                  ? "Agregá una lista M3U, una cuenta Xtream, un HLS directo o un addon desde el panel para empezar."
                  : "Pedile a quien administra que agregue una fuente de vivo. Mientras tanto podés ver el catálogo VOD."}
            </p>
            {isAdmin && !channelsFailed && (
              <Link href="/admin" className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>
                <IconSettings size={15} /> Abrir panel
              </Link>
            )}
          </div>
        </div>
      )}

      {live.length > 0 && (
        <section className="section" style={{ marginTop: 0 }}>
          <div className="section-head">
            <div>
              <h2>Ahora en cancha</h2>
              <p>El estado se deriva del horario; no se inventan goles ni resultados.</p>
            </div>
          </div>
          <div className="fixture-grid">
            {live.map((fixture) => {
              const match = byId.get(fixture.id);
              return match ? <FixtureCard key={fixture.id} match={match} /> : null;
            })}
          </div>
        </section>
      )}

      <div className="live-split" style={{ marginTop: live.length > 0 ? 40 : 0 }}>
        <section>
          <div className="section-head">
            <div>
              <h2>Agenda</h2>
              <p>Ayer, hoy y los próximos dos días.</p>
            </div>
            <span className="chip">{today.length} hoy</span>
          </div>

          {ordered.length === 0 ? (
            <div className="empty-state">
              <IconBall size={28} />
              <h2>{agendaFailed ? "No pudimos cargar la agenda" : "Sin partidos en la agenda"}</h2>
              <p>
                {agendaFailed
                  ? "El proveedor de calendario no respondió a tiempo. Los canales de la derecha funcionan igual: si hay un partido en curso, aparece ahí."
                  : "El calendario no devolvió eventos para estas fechas. Su plan gratuito cubre muy pocas ligas, así que los partidos que el catálogo sí puede abrir aparecen en Canales."}
              </p>
              <Link href="/buscar" className="btn btn-ghost btn-sm">
                Ir al catálogo
              </Link>
            </div>
          ) : (
            ordered.map(([key, dayFixtures]) => {
              const sorted = [...dayFixtures].sort((a, b) => {
                const rank = (fixture: Fixture) =>
                  fixture.status === "live" ? 0 : fixture.status === "scheduled" ? 1 : 2;
                return rank(a) - rank(b) || a.kickoff - b.kickoff;
              });
              const sample = sorted[0];
              if (!sample) return null;
              return (
                <div className="agenda-day" key={key}>
                  <h2>
                    {dayLabel(key, sample.kickoff)} ·{" "}
                    <span style={{ color: "var(--muted-2)", fontWeight: 500, textTransform: "none" }}>
                      {formatKickoff(sample.kickoff)}
                    </span>
                  </h2>
                  <div className="fixture-grid">
                    {sorted.map((fixture) => {
                      const match = byId.get(fixture.id);
                      return match ? <FixtureCard key={fixture.id} match={match} /> : null;
                    })}
                  </div>
                </div>
              );
            })
          )}
        </section>

        <aside>
          <div className="section-head">
            <div>
              <h2>Canales</h2>
              <p>Buscá por nombre o grupo. Se abre el reproductor y elige la mejor señal.</p>
            </div>
          </div>
          <ChannelBrowser />
        </aside>
      </div>
    </main>
  );
}
