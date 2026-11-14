"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconArrowRight, IconPlay } from "./icons";

/**
 * El hero de la portada: una carátula grande a sangre que cambia sola.
 *
 * Es la pieza que hace que la casa se sienta un servicio y no un tablero: una
 * sola cosa importante a la vez, con el resto esperando abajo. Se detiene
 * cuando el mouse o el foco entran, para que nadie pierda el botón mientras lo
 * va a apretar, y respeta `prefers-reduced-motion`.
 */
export interface HeroItem {
  key: string;
  name: string;
  backdrop?: string;
  poster?: string;
  description?: string;
  /** Línea chica arriba del título: "Película", "Serie", "En vivo". */
  eyebrow: string;
  meta: (string | number | null | undefined)[];
  href: string;
  playLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  live?: boolean;
  p2p?: boolean;
}

const ROTATE_MS = 9000;

export default function HeroCarousel({ items }: { items: HeroItem[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback(
    (next: number) => {
      if (items.length === 0) return;
      setIndex(((next % items.length) + items.length) % items.length);
    },
    [items.length],
  );

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    timer.current = setInterval(() => setIndex((value) => (value + 1) % items.length), ROTATE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [items.length, paused, index]);

  const current = items[index] ?? items[0];
  if (!current) return null;

  // La puntuación va aparte del resto de la línea: así el "★ 9.3" conserva el
  // color de oro y el resto se envuelve como una sola frase, sin dejar un
  // punto huérfano al principio de la segunda línea en el celular.
  const metaParts = current.meta
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
    .map((part) => String(part));
  const rating = metaParts.find((part) => /^\d{1,2}(\.\d)?$/.test(part));
  const metaRest = metaParts.filter((part) => part !== rating);

  return (
    <section
      className="home-hero"
      aria-label="Destacados"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {items.map((item, position) => (
        <div
          key={item.key}
          className="hero-slide"
          data-active={position === index}
          aria-hidden={position !== index}
        >
          {(item.backdrop || item.poster) && (
            <img
              src={item.backdrop || item.poster}
              alt=""
              referrerPolicy="no-referrer"
              fetchPriority={position === 0 ? "high" : "auto"}
              loading={position === 0 ? "eager" : "lazy"}
            />
          )}
          <div className="hero-wash" />
        </div>
      ))}

      <div className="hero-copy">
        <span className="hero-eyebrow">
          {current.live ? <i className="live-dot" /> : null}
          {current.eyebrow}
        </span>
        <h1 className="hero-title">{current.name}</h1>
        <div className="hero-meta">
          {rating ? <span className="gold">★ {rating}</span> : null}
          {rating && metaRest.length > 0 ? <i className="dot" aria-hidden="true" /> : null}
          {metaRest.length > 0 ? <span>{metaRest.join(" · ")}</span> : null}
        </div>
        {current.description ? <p className="hero-desc">{current.description}</p> : null}
        <div className="hero-actions">
          <Link className="btn btn-primary" href={current.href}>
            <IconPlay size={17} /> {current.playLabel ?? "Ver ahora"}
          </Link>
          {current.secondaryHref ? (
            <Link className="btn btn-ghost" href={current.secondaryHref}>
              {current.secondaryLabel ?? "Más información"} <IconArrowRight size={15} />
            </Link>
          ) : null}
        </div>
      </div>

      {items.length > 1 && (
        <>
          <button
            className="hero-nav"
            data-dir="prev"
            aria-label="Destacado anterior"
            onClick={() => go(index - 1)}
          >
            <IconArrowRight size={18} />
          </button>
          <button
            className="hero-nav"
            data-dir="next"
            aria-label="Siguiente destacado"
            onClick={() => go(index + 1)}
          >
            <IconArrowRight size={18} />
          </button>
          <div className="hero-dots" role="tablist" aria-label="Elegir destacado">
            {items.map((item, position) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={position === index}
                aria-label={item.name}
                data-active={position === index}
                onClick={() => go(position)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
