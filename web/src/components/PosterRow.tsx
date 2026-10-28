import Link from "next/link";
import type { AddonMetaPreview } from "@/lib/addons";
import { IconArrowRight } from "./icons";

function hue(name: string): number {
  let value = 0;
  for (const char of name) value = (value * 31 + char.charCodeAt(0)) % 360;
  return value;
}

export function PosterCard({ meta }: { meta: AddonMetaPreview }) {
  const href = meta.type === "series" ? `/series/${encodeURIComponent(meta.id)}` : `/movie/${encodeURIComponent(meta.id)}`;
  return (
    <Link href={href} className="poster-card">
      <div className="poster-art" style={{ "--hue": hue(meta.name) } as React.CSSProperties}>
        {meta.poster ? (
          <img src={meta.poster} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="poster-fallback">{meta.name.slice(0, 2).toUpperCase()}</span>
        )}
        {meta.imdbRating ? <span className="poster-rating">{meta.imdbRating}</span> : null}
      </div>
      <div className="poster-copy">
        <strong>{meta.name}</strong>
        <span>
          {meta.releaseInfo || ""}
          {meta.type === "series" ? " · Serie" : " · Película"}
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
    <section className="row-section">
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
      <div className="poster-row">
        {metas.map((meta) => (
          <PosterCard key={`${meta.type}:${meta.id}`} meta={meta} />
        ))}
      </div>
    </section>
  );
}
