import Link from "next/link";
import type { AddonMetaPreview } from "@/lib/addons";
import { IconArrowRight, IconPlay } from "./icons";
import Rail from "./Rail";

export function PosterCard({ meta }: { meta: AddonMetaPreview }) {
  const href = meta.type === "series"
    ? meta.playableId
      ? `/watch/series/${encodeURIComponent(meta.id)}?ep=${encodeURIComponent(meta.playableId)}`
      : `/series/${encodeURIComponent(meta.id)}`
    : `/movie/${encodeURIComponent(meta.id)}`;
  return (
    <Link href={href} className="poster-card">
      <div className="poster-art">
        {meta.poster ? (
          <img src={meta.poster} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="poster-fallback" aria-hidden="true"><span>{meta.type === "series" ? "SERIE" : "PELÍCULA"}</span>{meta.name}</span>
        )}
        <span className="poster-play" aria-hidden="true"><IconPlay size={18} /></span>
        {meta.imdbRating ? <span className="poster-rating">{meta.imdbRating}</span> : null}
        {!meta.playableId && meta.p2p ? (
          <span className="poster-flag" title="Los proveedores ofrecen esta película como torrent. Para verla en el navegador hace falta un resolver (debrid) configurado en el panel.">
            P2P
          </span>
        ) : null}
      </div>
      <div className="poster-copy">
        <strong>{meta.name}</strong>
        <span>
          {[meta.releaseInfo, meta.type === "series" ? "Serie" : "Película"].filter(Boolean).join(" · ")}
        </span>
      </div>
    </Link>
  );
}

export default function PosterRow({
  title,
  subtitle,
  metas,
  href,
}: {
  title: string;
  subtitle?: string;
  metas: AddonMetaPreview[];
  href?: string;
}) {
  if (metas.length === 0) return null;
  return (
    <section className="row-section" aria-label={title}>
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="section-link">
            Ver todo <IconArrowRight size={15} />
          </Link>
        )}
      </div>
      <Rail label={title}>
        {metas.map((meta) => (
          <PosterCard key={`${meta.type}:${meta.id}`} meta={meta} />
        ))}
      </Rail>
    </section>
  );
}
