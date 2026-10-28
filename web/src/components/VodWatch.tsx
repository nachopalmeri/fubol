"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Player, { type PlayerSource, type PlayerSubtitle } from "./Player";
import { IconAlert, IconArrowRight, IconRefresh, IconSettings } from "./icons";

interface VodResponse {
  sources: (PlayerSource & {
    addonName: string;
    title: string;
    quality: string;
    sizeLabel?: string | null;
    cached?: boolean;
    spanish?: boolean;
    note?: string;
  })[];
  subtitles: (PlayerSubtitle & { forced?: boolean })[];
  error?: string;
}

export default function VodWatch({
  type,
  id,
  title,
  poster,
  subtitle,
  storageKey,
  isAdmin = false,
}: {
  type: "movie" | "series";
  id: string;
  title: string;
  poster?: string;
  subtitle?: string;
  storageKey: string;
  isAdmin?: boolean;
}) {
  const [data, setData] = useState<VodResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/vod/streams?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as VodResponse;
        if (!response.ok) throw new Error(body.error ?? "No se pudieron buscar las fuentes");
        if (!controller.signal.aborted) setData(body);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "No se pudieron buscar las fuentes");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [type, id, nonce]);

  if (loading) {
    return (
      <div className="watch-loading">
        <div className="spinner" />
        <p>Buscando fuentes y subtítulos…</p>
        <small>Se consultan los addons configurados en paralelo.</small>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <IconAlert size={30} />
        <h2>No pudimos cargar el título</h2>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => setNonce((value) => value + 1)}>
          <IconRefresh size={16} /> Reintentar
        </button>
      </div>
    );
  }

  if (!data || data.sources.length === 0) {
    return (
      <div className="empty-state">
        <IconAlert size={30} />
        <h2>Sin fuentes para este título</h2>
        <p>
          El catálogo y los subtítulos funcionan, pero ningún addon de streams devolvió un archivo
          reproducible. Los addons se cargan una sola vez desde el panel y quedan disponibles para
          todos los links de la familia.
        </p>
        <div className="empty-actions">
          {isAdmin ? (
            <Link href="/admin?tab=addons" className="btn btn-primary">
              <IconSettings size={16} /> Configurar addons VOD <IconArrowRight size={15} />
            </Link>
          ) : (
            <p className="empty-hint">
              Pedile a quien administra que abra <code>/admin</code> → <strong>Addons VOD</strong> y
              agregue un addon de streams (por ejemplo un manifest de Stremio).
            </p>
          )}
          <button className="btn btn-ghost" onClick={() => setNonce((value) => value + 1)}>
            <IconRefresh size={16} /> Volver a buscar
          </button>
        </div>
      </div>
    );
  }

  const sources: PlayerSource[] = data.sources.map((source) => ({
    id: source.id,
    label: `${source.addonName} · ${source.quality}${source.cached ? " · cached" : ""}${
      source.sizeLabel ? ` · ${source.sizeLabel}` : ""
    }`,
    url: source.url,
    kind: source.kind,
    note: source.note,
    score: source.score,
    height: source.height,
  }));

  const subtitles: PlayerSubtitle[] = data.subtitles.map((track) => ({
    id: track.id,
    label: track.label,
    lang: track.lang,
    url: track.url,
  }));

  const best = data.sources[0];

  return (
    <div className="watch">
      <Player
        sources={sources}
        mode="vod"
        title={title}
        subtitle={subtitle}
        poster={poster}
        storageKey={storageKey}
        subtitles={subtitles}
        autoPlay
      />

      <div className="watch-status">
        <div className="watch-status-left">
          <span className="chip chip-lime">{data.sources.length} fuente(s)</span>
          {best?.cached ? <span className="chip">cacheada</span> : null}
          {best?.spanish ? <span className="chip">audio/sub ES</span> : null}
          {data.subtitles.length > 0 ? (
            <span className="chip">{data.subtitles.length} subtítulos</span>
          ) : (
            <span className="chip chip-muted">sin subtítulos</span>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setNonce((value) => value + 1)}>
          <IconRefresh size={15} /> Otras fuentes
        </button>
      </div>

      <div className="source-strip">
        {data.sources.slice(0, 6).map((source) => (
          <article key={source.id} className="source-card">
            <header>
              <strong>{source.quality}</strong>
              {source.cached && <span className="chip chip-lime">cached</span>}
            </header>
            <p>{source.title.length > 70 ? `${source.title.slice(0, 69)}…` : source.title}</p>
            <footer>
              <span>{source.addonName}</span>
              <span>{source.sizeLabel ?? ""}</span>
            </footer>
          </article>
        ))}
      </div>

      <p className="watch-note">
        Los subtítulos se activan solos en español (VOSE). Podés cambiarlos, ajustar el offset o
        sincronizarlos desde el botón CC del reproductor. Si el archivo es MKV, el navegador puede
        necesitar unos segundos extra.
      </p>
    </div>
  );
}
