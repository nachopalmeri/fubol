"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Player, { type PlayerSource, type PlayerSubtitle } from "./Player";
import { IconAlert, IconRefresh, IconSpark } from "./icons";

interface SessionResponse {
  channel: {
    id: string;
    name: string;
    group: string;
    sourceName: string;
    logo?: string;
  };
  sources: (PlayerSource & { note?: string })[];
  failed: number;
  checkedAt: number;
  notes: string[];
}

export default function LiveWatch({ channelId }: { channelId: string }) {
  const [data, setData] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSetupUrl(null);
    fetch(`/api/live/session?channel=${encodeURIComponent(channelId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as SessionResponse & { error?: string; code?: string; configureUrl?: string };
        if (body.code === "source_setup_required" && body.configureUrl && !controller.signal.aborted) {
          try {
            const url = new URL(body.configureUrl);
            if (url.protocol === "https:") setSetupUrl(url.toString());
          } catch { /* Never render an invalid upstream action URL. */ }
        }
        if (!response.ok) throw new Error(body.error ?? "No se pudo abrir el canal");
        if (!controller.signal.aborted) setData(body);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "No se pudo abrir el canal");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [channelId, nonce]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);

  if (loading) {
    return (
      <div className="watch-loading">
        <div className="spinner" />
        <p>Buscando la mejor señal…</p>
        <small>Se prueban todas las fuentes en paralelo. Tarda unos segundos.</small>
      </div>
    );
  }

  if (error || !data || data.sources.length === 0) {
    return (
      <div className="empty-state">
        <IconAlert size={30} />
        <h2>{setupUrl ? "La fuente necesita actualizarse" : "No pudimos abrir la señal"}</h2>
        <p>{error ?? (data?.notes.join(" · ") || "El canal no está disponible ahora.")}</p>
        {setupUrl && <div className="page-actions"><a className="btn btn-primary" href={setupUrl} target="_blank" rel="noopener noreferrer">Configurar proveedor ↗</a><Link className="btn btn-ghost" href="/admin?tab=sources">Actualizar manifest</Link></div>}
        <button className="btn btn-ghost" onClick={retry}>
          <IconRefresh size={16} /> Reintentar
        </button>
      </div>
    );
  }

  const sources = data.sources.map((source) =>
    source.score === 0
      ? { ...source, label: `${source.label} · sin verificar` }
      : source,
  );
  const subtitles: PlayerSubtitle[] = [];

  return (
    <div className="watch">
      <Player
        sources={sources}
        mode="live"
        title={data.channel.name}
        subtitle={`${data.channel.group} · ${data.channel.sourceName}`}
        storageKey={`live:${channelId}`}
        subtitles={subtitles}
        autoPlay
      />

      <div className="watch-status">
        <div className="watch-status-left">
          <span className="status-pill status-live">
            <i className="live-dot" /> {sources.length} fuente{sources.length === 1 ? "" : "s"}
          </span>
          {data.sources[0]?.edgeAgeS != null && (
            <span className="chip">Delay estimado ~{Math.round(data.sources[0].edgeAgeS)} s</span>
          )}
          {data.failed > 0 && <span className="chip chip-warn">{data.failed} descartada(s)</span>}
          <span className="chip chip-muted">
            Verificado {new Date(data.checkedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={retry}>
          <IconSpark size={15} /> Reanalizar
        </button>
      </div>

      {data.notes.length > 0 && (
        <p className="watch-note">{data.notes.join(" · ")}</p>
      )}

      <div className="watch-tips">
        <div>
          <h3>Si se corta</h3>
          <p>
            Fubol cambia solo a otra fuente. Si no hay más, tocá “Reintentar”. El delay depende
            del origen: no se puede eliminar, solo elegir la señal más cercana al vivo.
          </p>
        </div>
        <div>
          <h3>Para la familia</h3>
          <p>
            Un solo link: <code>/f/CODIGO</code>. Se abre en el navegador del celular, tablet o PC,
            sin instalar nada.
          </p>
        </div>
      </div>
    </div>
  );
}
