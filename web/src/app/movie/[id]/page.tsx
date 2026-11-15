import type { Metadata } from "next";
import Link from "next/link";
import TitleHero from "@/components/TitleHero";
import VodWatch from "@/components/VodWatch";
import { IconAlert, IconPlay } from "@/components/icons";
import { requirePageSession } from "@/lib/auth";
import { withTimeout } from "@/lib/http";
import { getVodMeta } from "@/lib/vod/service";
import { listProgress } from "@/lib/state/progress";

export const dynamic = "force-dynamic";

function formatClock(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(total % 60)}` : `${m}:${pad(total % 60)}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = await withTimeout(getVodMeta("movie", id), 9000, "metadata").catch(() => null);
  return { title: meta?.name ?? "Película" };
}

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession("vod");
  const { id } = await params;
  const meta = await withTimeout(getVodMeta("movie", id), 15000, "metadata").catch(() => null);
  const name = meta?.name ?? "Película sin metadata";
  // Where the family stopped, wherever they stopped it.
  const scope = session.role === "admin" ? "admin" : session.code;
  const resumeFrom =
    (await listProgress(scope)).find((item) => item.type === "movie" && item.id === id)?.position ?? 0;
  const credits = [
    meta?.director?.length ? `Dirección: ${meta.director.join(", ")}` : null,
    meta?.cast?.length ? `Reparto: ${meta.cast.slice(0, 5).join(", ")}` : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <main className="shell title-page">
      <Link href="/peliculas" className="back-link">
        ← Volver a películas
      </Link>

      <TitleHero
        name={name}
        poster={meta?.poster}
        eyebrow="Película"
        meta={[meta?.imdbRating, meta?.year ?? meta?.releaseInfo, meta?.runtime]}
        description={meta?.description ?? undefined}
        tags={meta?.genres}
        credits={credits}
      >
        {/* The player sits below the fold on a laptop: one press takes you there. */}
        <div className="title-actions">
          <a href="#ver-ahora" className="btn btn-primary">
            <IconPlay size={16} />
            {resumeFrom > 60 ? `Seguir desde ${formatClock(resumeFrom)}` : "Ver ahora"}
          </a>
        </div>
      </TitleHero>
      {meta?.sourceNotice && <p className="watch-note">{meta.sourceNotice}{meta.sourcePage?.startsWith("https://archive.org/details/") && <> <a className="section-link" href={meta.sourcePage} target="_blank" rel="noopener noreferrer">Ver copia original ↗</a></>}</p>}

      {!meta && (
        <div className="empty-inline" style={{ marginTop: 18 }}>
          <span className="empty-icon">
            <IconAlert size={20} />
          </span>
          <div>
            <h3>No encontramos metadata para este título</h3>
            <p>
              El addon de metadata no respondió. Igual vamos a consultar los addons de streams con
              el id <code>{id}</code>; si alguno lo tiene, se puede reproducir.
            </p>
          </div>
        </div>
      )}

      <div className="title-body" id="ver-ahora">
        <div className="section-head">
          <h2>Ver ahora</h2>
        </div>
        <VodWatch
          type="movie"
          id={id}
          title={name}
          poster={meta?.background ?? meta?.poster}
          subtitle={[meta?.year ?? meta?.releaseInfo, meta?.runtime].filter(Boolean).join(" · ") || undefined}
          storageKey={`movie:${id}`}
          resumeFrom={resumeFrom}
          isAdmin={session.role === "admin"}
        />
      </div>
    </main>
  );
}
