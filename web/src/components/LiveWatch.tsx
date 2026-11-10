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
  const [attempt, setAttempt] = useState(1);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSetupUrl(null);
    setAttempt(1);

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // One silent retry: a cold origin or a restarted container fails the first
    // resolve, and asking the family to press "Reintentar" at kickoff is worse
    // than waiting two extra seconds.
    const load = async () => {
      for (let round = 1; round <= 2; round += 1) {
        if (cancelled) return;
        if (round > 1) setAttempt(round);
        try {
          const response = await fetch(`/api/live/session?channel=${encodeURIComponent(channelId)}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          const body = (await response.json()) as SessionResponse & { error?: string; code?: string; configureUrl?: string };
          if (cancelled) return;
          if (body.code === "source_setup_required" && body.configureUrl) {
            try {
              const url = new URL(body.configureUrl);
              if (url.protocol === "https:") setSetupUrl(url.toString());
            } catch { /* Never render an invalid upstream action URL. */ }
          }
          if (!response.ok) throw new Error(body.error ?? "No se pudo abrir el canal");
          if (body.sources.length === 0 && round === 1) {
            await sleep(1400);
            continue;
          }
          setData(body);
          setLoading(false);
          return;
        } catch (reason) {
          if (cancelled || controller.signal.aborted) return;
          if (round === 1) {
            await sleep(1400);
            continue;
          }
          setError(reason instanceof Error ? reason.message : "No se pudo abrir el canal");
          setLoading(false);
          return;
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [channelId, nonce]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);

  if (loading) {
    return (
      <div className="watch-loading">
        <div className="spinner" />
        <p>{attempt > 1 ? "Reintentando la señal…" : "Buscando la mejor señal…"}</p>
        <small>Se prueban todas las fuentes en paralelo. Tarda unos segundos.</small>
      </div>
    );
  }

  if (error || !data || data.sources.length === 0) {
    const setupRequired = Boolean(setupUrl) || /configur|actualizar/i.test(error ?? "");
    return (
      <div className="empty-state">
        <IconAlert size={30} />
        <h2>{setupRequired ? "Esta señal pide una configuración única" : "No pudimos abrir la señal"}</h2>
        <p>
          {setupRequired
            ? "El proveedor de este canal pide completar una verificación en el navegador (una vez). Después se guarda el manifest nuevo en Administración → Fuentes y el canal abre como cualquier otro."
            : error ?? (data?.notes.join(" · ") || "El canal no está disponible ahora.")}
        </p>
        <div className="page-actions">
          {setupUrl && (
            <a className="btn btn-primary" href={setupUrl} target="_blank" rel="noopener noreferrer">
              Abrir configuración del proveedor ↗
            </a>
          )}
          {setupRequired && (
            <Link className="btn btn-ghost" href="/admin?tab=sources">
              Ir a Administración
            </Link>
          )}
          <button className="btn btn-ghost" onClick={retry}>
            <IconRefresh size={16} /> Reintentar
          </button>
        </div>
        <p className="channel-note" style={{ marginTop: 14 }}>
          Mientras tanto, en <Link href="/live">En vivo</Link> están las señales públicas que
          funcionan sin configuración.
        </p>
      </div>
    );
  }

  const sources = data.sources.map((source) =>
    source.score === 0
      ? { ...source, label: `${source.label} · sin verificar` }
      : source,
  );
  const subtitles: PlayerSubtitle[] = [];
  const best = data.sources[0];
  const originDelay =
    best && (best.edgeTrust === "measured" || best.edgeTrust === "extrapolated") ? best.edgeAgeS : null;

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
          {/* Names what the number actually is. It used to read "Delay
              estimado", which the origin's playlist cannot support: it only
              knows how far its own publishing point is behind its own clock. */}
          {originDelay != null ? (
            <span className="chip" title="Medido sobre el playlist del origen. El reproductor suma su propio buffer.">
              Origen ~{Math.round(originDelay)} s detrás
            </span>
          ) : (
            <span className="chip chip-muted" title="El origen no publica PROGRAM-DATE-TIME utilizable.">
              El origen no informa su delay
            </span>
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
          <h3>Cómo se mide el delay</h3>
          <p>
            El chip del reproductor suma dos cosas: cuánto atrás publica el origen y cuánto
            buffer necesita el reproductor. Cuando el origen no publica su reloj, o publica uno
            imposible, se muestra solo el buffer y se aclara. No se inventa un número.
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
