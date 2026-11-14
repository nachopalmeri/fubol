import type { ReactNode } from "react";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export default function TitleHero({
  name,
  poster,
  eyebrow,
  meta,
  description,
  tags,
  credits,
  children,
}: {
  name: string;
  poster?: string;
  eyebrow: string;
  meta: (string | number | null | undefined)[];
  description?: string;
  tags?: string[];
  credits?: string[];
  children?: ReactNode;
}) {
  const metaLine = meta
    .filter((item) => item !== null && item !== undefined && String(item).trim() !== "")
    .map((item) => String(item));

  return (
    <section className="title-hero">
      <div className="title-poster">
        {poster ? (
          <img src={poster} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="title-poster-fallback" aria-hidden="true">{initials(name)}</span>
        )}
      </div>
      <div className="title-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{name}</h1>
        {metaLine.length > 0 && (
          <div className="title-meta">
            {metaLine.map((item, index) => (
              <span key={`${item}-${index}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {index > 0 && <span className="dot" />}
                {/^\d{1,2}(\.\d)?$/.test(item) ? <span className="title-rating">★ {item}</span> : item}
              </span>
            ))}
          </div>
        )}
        {tags && tags.length > 0 && (
          <div className="title-tags">
            {tags.slice(0, 8).map((tag) => (
              <span className="title-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        )}
        {description && <p className="title-desc">{description}</p>}
        {credits && credits.length > 0 && <p className="title-credits">{credits.join(" · ")}</p>}
        {children}
      </div>
    </section>
  );
}
