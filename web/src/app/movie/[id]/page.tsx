import type { Metadata } from "next";
import Link from "next/link";
import TitleHero from "@/components/TitleHero";
import VodWatch from "@/components/VodWatch";
import { IconAlert } from "@/components/icons";
import { requirePageSession } from "@/lib/auth";
import { withTimeout } from "@/lib/http";
import { getVodMeta } from "@/lib/vod/service";

export const dynamic = "force-dynamic";

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
      />
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

      <div className="title-body">
        <div className="section-head">
          <div>
            <h2>Ver ahora</h2>
            <p>Fuentes compatibles y subtítulos seleccionables. Se prioriza una pista de la misma copia cuando existe.</p>
          </div>
        </div>
        <VodWatch
          type="movie"
          id={id}
          title={name}
          poster={meta?.poster}
          subtitle={[meta?.year ?? meta?.releaseInfo, meta?.runtime].filter(Boolean).join(" · ") || undefined}
          storageKey={`movie:${id}`}
          isAdmin={session.role === "admin"}
        />
      </div>
    </main>
  );
}
