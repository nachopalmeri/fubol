"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Player, { type PlayerSource, type PlayerSubtitle } from "./Player";
import { IconAlert, IconArrowRight, IconRefresh, IconSettings } from "./icons";

interface VodResponse {
  sources: (PlayerSource & {
    addonName: string;
    title: string;
    quality: string;
    sizeLabel?: string | null;
    cached?: boolean;
    viaTorrent?: boolean;
    spanish?: boolean;
    note?: string;
  })[];
  subtitles: (PlayerSubtitle & { forced?: boolean })[];
  /** Providers answered with BitTorrent hashes a browser cannot open. */
  p2pOnly?: number;
  unconfigured?: { name: string; configureUrl: string | null }[];
  reason?: string | null;
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
  resumeFrom = 0,
  seriesId,
}: {
  type: "movie" | "series";
  id: string;
  title: string;
  poster?: string;
  subtitle?: string;
  storageKey: string;
  isAdmin?: boolean;
  resumeFrom?: number;
  /** Series id, when `id` is the episode being watched. */
  seriesId?: string;
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

  // The shared history is what lets the family resume on another device.
  // It has to be declared before any early return: hooks cannot be
  // conditional, and React throws when the count changes between renders.
  const reportProgress = useCallback(
    (position: number, duration: number) => {
      // For a series the progress belongs to the episode inside the series, so
      // the rail can show "S02E03 · 40%".
      const payload =
        type === "series"
          ? { type, id: seriesId ?? id, episode: id, name: title, poster, position, duration }
          : { type, id, name: title, poster, position, duration };
      void fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => undefined);
    },
    [type, id, seriesId, title, poster],
  );

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
    // "Sin fuentes" was misleading: the providers usually answer with hundreds
    // of BitTorrent hashes, which is a different problem with a different fix.
    const p2p = data?.p2pOnly ?? 0;
    return (
      <div className="empty-state">
        <IconAlert size={30} />
        <h2>{p2p > 0 ? "Las fuentes son torrents, no archivos" : "Sin fuentes para este título"}</h2>
        <p>
          {data?.reason ??
            "Ningún addon de streams devolvió un archivo reproducible para este título."}
        </p>
        {p2p > 0 && (
          <p className="empty-hint">
            Un navegador solo reproduce HTTP. Para abrir estas fuentes hace falta un servicio
            debrid (TorBox, Real-Debrid, AllDebrid o Premiumize) configurado en el addon: el
            servicio descarga el torrent y devuelve un link directo.
          </p>
        )}
        {(data?.unconfigured?.length ?? 0) > 0 && (
          <p className="empty-hint">
            Proveedores sin configurar:{" "}
            {data?.unconfigured?.map((item, index) => (
              <span key={item.name}>
                {index > 0 ? ", " : ""}
                {item.configureUrl ? (
                  <a href={item.configureUrl} target="_blank" rel="noopener noreferrer">
                    {item.name}
                  </a>
                ) : (
                  item.name
                )}
              </span>
            ))}
          </p>
        )}
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
      source.viaTorrent ? " · P2P" : ""
    }${source.sizeLabel ? ` · ${source.sizeLabel}` : ""}`,
    url: source.url,
    kind: source.kind,
    // A swarm source has to find peers before the first byte arrives: measured
    // at up to a minute cold. Saying so beats looking frozen.
    note: source.viaTorrent
      ? [source.note, "Fuente P2P: el primer arranque puede tardar hasta un minuto"]
          .filter(Boolean)
          .join(" · ")
      : source.note,
    score: source.score,
    height: source.height,
    matchedSubtitleIds: source.matchedSubtitleIds,
    syncOffsetMs: source.syncOffsetMs ?? null,
    syncConfidence: source.syncConfidence ?? null,
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
        onProgress={reportProgress}
        resumeFrom={resumeFrom}
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
        Si existe una pista de esta misma copia, se prioriza sobre pistas externas; de lo contrario
        se prefiere español. Podés cambiarla y ajustar el tiempo desde CC. Las pistas automáticas
        ASR pueden contener errores y las de otra edición pueden necesitar otro ajuste.
      </p>
    </div>
  );
}
