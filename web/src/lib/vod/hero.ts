import type { AddonMetaPreview } from "@/lib/addons";
import type { HeroItem } from "@/components/HeroCarousel";

/**
 * Elige qué títulos merecen el hero.
 *
 * Reglas, en orden: que tengan imagen (una diapositiva de texto sobre negro no
 * se siente cine), que sean distintos, y que lo primero que se vea sea algo
 * que se pueda abrir. El resto del catálogo vive en los rieles de abajo.
 */
export function heroItemsFrom(metas: AddonMetaPreview[], limit = 5): HeroItem[] {
  const seen = new Set<string>();
  const chosen: HeroItem[] = [];
  for (const meta of metas) {
    if (chosen.length >= limit) break;
    if (!meta.background && !meta.poster) continue;
    if (seen.has(meta.id)) continue;
    seen.add(meta.id);
    const href =
      meta.type === "series"
        ? meta.playableId
          ? `/watch/series/${encodeURIComponent(meta.id)}?ep=${encodeURIComponent(meta.playableId)}`
          : `/series/${encodeURIComponent(meta.id)}`
        : `/movie/${encodeURIComponent(meta.id)}`;
    chosen.push({
      key: `${meta.type}:${meta.id}`,
      name: meta.name,
      backdrop: meta.background,
      poster: meta.poster,
      description: meta.description,
      eyebrow: meta.playableId
        ? meta.type === "series"
          ? "Serie · disponible"
          : "Película · disponible"
        : meta.type === "series"
          ? "Serie"
          : "Película",
      meta: [meta.releaseInfo, meta.imdbRating, meta.genres?.slice(0, 2).join(" · "), meta.runtime],
      href,
      playLabel: meta.playableId ? "Reproducir" : "Ver título",
      secondaryHref: meta.type === "series" ? "/series" : "/peliculas",
      secondaryLabel: "Explorar catálogo",
      p2p: !meta.playableId && Boolean(meta.p2p),
    });
  }
  return chosen;
}
