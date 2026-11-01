import type { Metadata } from "next";
import Link from "next/link";
import { PosterCard } from "@/components/PosterRow";
import { requirePageSession } from "@/lib/auth";
import { withTimeout } from "@/lib/http";
import { getHomeRows } from "@/lib/vod/service";
import type { AddonMetaPreview } from "@/lib/addons";
import { IconArrowRight, IconFilm, IconSettings } from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Películas",
  description: "Catálogo de películas con fuentes y subtítulos VOSE.",
};

export default async function MoviesPage() {
  const session = await requirePageSession("vod");
  const rows = await withTimeout(getHomeRows(30), 28000, "catálogos").catch(() => []);
  const movieRows = rows.filter((row) => row.catalog.type === "movie");
  const seen = new Set<string>();
  const metas: AddonMetaPreview[] = [];
  for (const row of movieRows) {
    for (const meta of row.metas) {
      if (seen.has(meta.id)) continue;
      seen.add(meta.id);
      metas.push(meta);
    }
  }
  const isAdmin = session.role === "admin";

  return (
    <main className="shell">
      <header className="page-head">
        <div>
          <span className="eyebrow">
            <IconFilm size={14} /> Catálogo
          </span>
          <h1>Películas</h1>
          <p>
            {metas.length > 0
              ? `${metas.length} títulos de ${new Set(movieRows.map((row) => row.addon.name)).size} addon(s). Abrí uno para ver fuentes y subtítulos.`
              : "Solo mostramos películas con una fuente web comprobada. Los títulos sin video disponible quedan ocultos."}
          </p>
        </div>
        <div className="page-actions">
          <Link href="/buscar" className="btn btn-primary btn-sm">
            Buscar <IconArrowRight size={15} />
          </Link>
        </div>
      </header>

      {metas.length === 0 ? (
        <div className="empty-state">
          <IconFilm size={30} />
          <h2>No hay películas disponibles ahora</h2>
          <p>
            {isAdmin
              ? "Los catálogos pueden tener carátulas sin video. Configurá un proveedor con enlaces MP4, WebM o HLS reproducibles; los hashes P2P y MKV no se ofrecen al navegador."
              : "No encontramos fuentes de video compatibles. Volvé más tarde o avisale a quien administra este espacio."}
          </p>
          <div className="page-actions">
            {isAdmin ? (
              <Link href="/admin" className="btn btn-primary btn-sm">
                <IconSettings size={15} /> Abrir panel
              </Link>
            ) : (
              <Link href="/live" className="btn btn-primary btn-sm">
                Ir a vivo
              </Link>
            )}
            <Link href="/series" className="btn btn-ghost btn-sm">
              Ver series
            </Link>
          </div>
        </div>
      ) : (
        <div className="catalog-grid">
          {metas.slice(0, 180).map((meta) => (
            <PosterCard key={meta.id} meta={meta} />
          ))}
        </div>
      )}

      {movieRows.length > 1 && (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>De dónde sale esto</h2>
              <p>Un renglón por catálogo conectado.</p>
            </div>
          </div>
          <div className="fixture-grid">
            {movieRows.slice(0, 6).map((row) => (
              <article className="fixture-card" key={`${row.addon.id}:${row.catalog.id}`}>
                <header className="fixture-head">
                  <span className="fixture-league">{row.catalog.name}</span>
                  <span className="tag">{row.addon.kind}</span>
                </header>
                <p className="muted" style={{ fontSize: 12.5 }}>
                  {row.metas.length} títulos · {row.addon.name}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
