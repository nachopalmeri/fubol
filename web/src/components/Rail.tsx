"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconArrowRight } from "./icons";

/**
 * Un riel que se desliza, como el de cualquier servicio grande.
 *
 * El scroll horizontal nativo ya funciona con el dedo y con la rueda; esto le
 * agrega las flechas del escritorio, que son la diferencia entre "hay más" y
 * "no sé si hay más". Las flechas sólo aparecen si realmente queda contenido.
 */
export default function Rail({ children, label }: { children: ReactNode; label?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const node = track.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth;
    setEdges({
      start: node.scrollLeft > 8,
      end: max > 8 && node.scrollLeft < max - 8,
    });
  }, []);

  useEffect(() => {
    measure();
    const node = track.current;
    if (!node) return;
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  const slide = (direction: 1 | -1) => {
    const node = track.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.82, behavior: "smooth" });
  };

  return (
    <div className="rail">
      {edges.start && (
        <button
          type="button"
          className="rail-arrow"
          data-dir="prev"
          aria-label={label ? `Anterior en ${label}` : "Anterior"}
          onClick={() => slide(-1)}
        >
          <IconArrowRight size={18} />
        </button>
      )}
      <div className="rail-track" ref={track}>
        {children}
      </div>
      {edges.end && (
        <button
          type="button"
          className="rail-arrow"
          data-dir="next"
          aria-label={label ? `Siguiente en ${label}` : "Siguiente"}
          onClick={() => slide(1)}
        >
          <IconArrowRight size={18} />
        </button>
      )}
    </div>
  );
}
