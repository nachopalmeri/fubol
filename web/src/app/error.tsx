"use client";

import { useEffect } from "react";
import { IconAlert, IconRefresh } from "@/components/icons";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("fubol:client-error", error);
  }, [error]);

  return (
    <main className="shell">
      <div className="empty-state" style={{ marginTop: 60 }}>
        <IconAlert size={32} />
        <h2>Algo salió mal</h2>
        <p>
          La pantalla no terminó de cargar. Puede ser una fuente lenta o un error temporal del
          servidor. Probá de nuevo; si sigue, volvé al inicio.
        </p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={reset}>
            <IconRefresh size={16} /> Reintentar
          </button>
          <a className="btn btn-ghost" href="/">
            Ir al inicio
          </a>
        </div>
      </div>
    </main>
  );
}
