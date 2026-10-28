import type { Metadata } from "next";
import Link from "next/link";
import { PosterCard } from "@/components/PosterRow";
import { requirePageSession } from "@/lib/auth";
import { withTimeout } from "@/lib/http";
import { getHomeRows } from "@/lib/vod/service";
import type { AddonMetaPreview } from "@/lib/addons";
import { IconArrowRight, IconFilm, IconSeries, IconSettings } from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Series",
  description: "Catálogo de series con episodios, fuentes y subtítulos VOSE.",
};

export default async function SeriesPage() {
  const session = await requirePageSession("vod");
  const rows = await withTimeout(getHomeRows(30), 28000, "catálogos").catch(() => []);
  const seriesRows = rows.filter((row) => row.catalog.type === "series");
  const seen = new Set<string>();
  const metas: AddonMetaPreview[] = [];
  for (const row of seriesRows) {
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
            <IconSeries size={14} /> Catálogo
          </span>
          <h1>Series</h1>
          <p>
            {metas.length > 0
              ? `${metas.length} series de ${new Set(seriesRows.map((row) => row.addon.name)).size} addon(s). Elegí temporada y episodio.`
              : "Acá van a aparecer las series de tus addons de metadata y streams."}
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
          <IconSeries size={30} />
          <h2>Sin catálogo de series</h2>
          <p>
            {isAdmin
              ? "Agregá un addon con catálogo de series desde el panel. Cinemeta aporta metadata; los streams vienen de un addon autorizado."
              : "Pedile a quien administra que conecte un addon con catálogo. Mientras tanto podés mirar los canales en vivo."}
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
            <Link href="/peliculas" className="btn btn-ghost btn-sm">
              <IconFilm size={15} /> Ver películas
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

      {seriesRows.length > 1 && (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>De dónde sale esto</h2>
              <p>Un renglón por catálogo conectado.</p>
            </div>
          </div>
          <div className="fixture-grid">
            {seriesRows.slice(0, 6).map((row) => (
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
