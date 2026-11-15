"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Player, { type PlayerAlignment, type PlayerSource, type PlayerState, type PlayerSubtitle } from "./Player";
import { IconAlert, IconArrowRight, IconChevronDown, IconPlay, IconRefresh, IconSettings, IconSubs } from "./icons";
import { describeSync } from "@/lib/subs/describe";

interface VodSourceRow {
  id: string;
  copyId: string;
  url: string;
  kind: "hls" | "mp4";
  addonName: string;
  title: string;
  releaseName: string;
  releaseTags: string[];
  languages: string[];
  seeders: number | null;
  quality: string;
  height: number | null;
  sizeLabel?: string | null;
  cached?: boolean;
  viaTorrent?: boolean;
  transcoded?: boolean;
  score?: number;
  matchedSubtitleIds?: string[];
}

interface VodResponse {
  sources: VodSourceRow[];
  subtitles: { id: string; label: string; provider: string; lang: string; forced?: boolean; url: string }[];
  alignments?: PlayerAlignment[];
  /** Providers answered with BitTorrent hashes a browser cannot open. */
  p2pOnly?: number;
  unconfigured?: { name: string; configureUrl: string | null }[];
  /** Whether the resolver that opens torrent sources is answering. */
  resolver?: { configured: boolean; reachable: boolean; url: string | null };
  reason?: string | null;
  error?: string;
}

/** The sources request can hang on a slow provider; the page must not. */
const LIST_TIMEOUT_MS = 45_000;
/** Rows shown before "show all": enough to choose, not a wall of torrents. */
const FIRST_ROWS = 6;

function sizeText(label: string | null | undefined): string {
  return label ? label.replace(".", ",") : "";
}

/**
 * What sets a copy apart: "REMASTERED 1080p BluRay H264 AAC-LAMA" instead of
 * "The.Shawshank.Redemption.1994.REMASTERED…", whose first half is the same
 * on every row and is all a phone has room for.
 */
export function distinctReleaseName(releaseName: string, title: string): string {
  const spaced = releaseName.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  const words = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return spaced;
  const pattern = new RegExp(`^\\W*${words.map((word) => word.replace(/[^a-z0-9]/g, "")).join("[^a-z0-9]+")}[^a-z0-9]*((19|20)\\d{2}[^a-z0-9]*)?`, "i");
  const plain = spaced.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const match = pattern.exec(plain);
  const rest = match ? spaced.slice(match[0].length).trim() : spaced;
  return rest.length >= 3 ? rest : spaced;
}

function seedersText(row: VodSourceRow): string | null {
  if (!row.viaTorrent || row.seeders === null) return null;
  if (row.seeders === 0) return "Nadie compartiendo";
  return row.seeders === 1 ? "1 compartiendo" : `${row.seeders} compartiendo`;
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
  const [pick, setPick] = useState<{ index: number; nonce: number } | undefined>(undefined);
  const [state, setState] = useState<PlayerState | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), LIST_TIMEOUT_MS);
    setLoading(true);
    setError(null);
    setState(null);
    setPick(undefined);
    fetch(`/api/vod/streams?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as VodResponse;
        if (!response.ok) throw new Error(body.error ?? "No se pudieron buscar las fuentes");
        setData(body);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted && controller.signal.reason !== "timeout") return;
        setError(
          controller.signal.reason === "timeout"
            ? "Los proveedores tardaron más de 45 s en contestar. Suele ser momentáneo."
            : reason instanceof Error
              ? reason.message
              : "No se pudieron buscar las fuentes",
        );
      })
      .finally(() => {
        clearTimeout(timer);
        if (controller.signal.reason !== "unmount") setLoading(false);
      });
    return () => {
      clearTimeout(timer);
      controller.abort("unmount");
    };
  }, [type, id, nonce]);

  // The shared history is what lets the family resume on another device.
  // Hooks have to be declared before any early return.
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

  const sources: PlayerSource[] = useMemo(
    () =>
      (data?.sources ?? []).map((source) => ({
        id: source.id,
        copyId: source.copyId,
        label: [source.quality !== "auto" ? source.quality : null, source.releaseTags[0], source.addonName]
          .filter(Boolean)
          .join(" "),
        url: source.url,
        kind: source.kind,
        score: source.score,
        height: source.height,
        p2p: source.viaTorrent === true,
        matchedSubtitleIds: source.matchedSubtitleIds,
      })),
    [data],
  );

  const subtitles: PlayerSubtitle[] = useMemo(
    () =>
      (data?.subtitles ?? []).map((track) => ({
        id: track.id,
        label: `${track.label} · ${track.provider}${track.forced ? " (forzados)" : ""}`,
        lang: track.lang,
        url: track.url,
        forced: track.forced,
      })),
    [data],
  );

  if (loading) {
    return (
      <div className="watch-loading" role="status">
        <div className="spinner" />
        <p>Buscando dónde ver {title}…</p>
        <small>Se consulta a todos los proveedores a la vez; tarda unos segundos.</small>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <IconAlert size={30} />
        <h2>No pudimos buscar las fuentes</h2>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => setNonce((value) => value + 1)}>
          <IconRefresh size={16} /> Buscar de nuevo
        </button>
      </div>
    );
  }

  if (!data || data.sources.length === 0) {
    // "Sin fuentes" was misleading: the providers usually answer with hundreds
    // of BitTorrent hashes, which is a different problem with a different fix.
    const p2p = data?.p2pOnly ?? 0;
    const resolverDown = data?.resolver?.configured === true && data?.resolver?.reachable === false;
    return (
      <div className="empty-state">
        <IconAlert size={30} />
        <h2>
          {resolverDown
            ? "La computadora que abre los torrents está apagada"
            : p2p > 0
              ? "Las fuentes son torrents, no archivos"
              : "No encontramos dónde ver este título"}
        </h2>
        {resolverDown ? (
          <p>
            Hay {p2p} copias disponibles, pero el servicio que las abre no contesta. Cuando esa
            computadora vuelva a estar prendida, el título se puede ver sin hacer nada más.
          </p>
        ) : (
          <p>{data?.reason ?? "Ningún proveedor tiene una copia que el navegador pueda reproducir."}</p>
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
          {isAdmin && (
            <Link href="/admin?tab=addons" className="btn btn-ghost">
              <IconSettings size={16} /> Revisar addons <IconArrowRight size={15} />
            </Link>
          )}
          <button className="btn btn-primary" onClick={() => setNonce((value) => value + 1)}>
            <IconRefresh size={16} /> Buscar de nuevo
          </button>
        </div>
      </div>
    );
  }

  const rows = data.sources;
  const current = state?.index ?? 0;
  const currentRow = rows[current];
  const failed = state?.failed ?? [];
  const status = state?.status ?? "loading";
  const starting = status === "loading" || status === "switching";
  const activeTrack = data.subtitles.find((track) => track.id === state?.subtitle.trackId) ?? null;
  // The source on screen stays visible even when it is past the first rows.
  const visible = showAll ? rows : rows.filter((_, index) => index < FIRST_ROWS || index === current);

  const nowPlaying = (
    <div className="now-playing">
      <div className="now-playing-source">
        <span className={`now-dot now-dot-${starting ? "starting" : status === "error" ? "error" : "on"}`} aria-hidden />
        <div>
          <strong>
            {status === "error"
              ? "No arrancó ninguna fuente"
              : starting
                ? `Abriendo fuente ${current + 1} de ${rows.length}…`
                : status === "paused"
                  ? "En pausa"
                  : "Reproduciendo"}
          </strong>
          {currentRow && status !== "error" && (
            <span>
              {[currentRow.quality !== "auto" ? currentRow.quality : null, ...currentRow.releaseTags.slice(0, 2), sizeText(currentRow.sizeLabel), currentRow.addonName]
                .filter(Boolean)
                .join("  ")}
            </span>
          )}
        </div>
      </div>
      <div className="now-playing-subs">
        <IconSubs size={18} />
        <div>
          <strong>{activeTrack ? `${activeTrack.label} · ${activeTrack.provider}` : data.subtitles.length > 0 ? "Sin subtítulos" : "No hay subtítulos para este título"}</strong>
          {activeTrack && state && (
            <span>{describeSync(state.subtitle.method, state.subtitle.measuring, state.subtitle.offsetMs)}</span>
          )}
        </div>
      </div>
    </div>
  );

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
        alignments={data.alignments ?? []}
        onProgress={reportProgress}
        resumeFrom={resumeFrom}
        pick={pick}
        onStateChange={setState}
        belowPlayer={nowPlaying}
        autoPlay
      />

      <section className="source-list" aria-labelledby="source-list-title">
        <header className="source-list-head">
          <div>
            <h3 id="source-list-title">Fuentes</h3>
            <p>
              {rows.length === 1 ? "Una copia encontrada." : `${rows.length} copias encontradas.`} Si la que está
              en pantalla no arranca, se prueba sola la siguiente.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setNonce((value) => value + 1)}>
            <IconRefresh size={15} /> Buscar de nuevo
          </button>
        </header>

        <ul className="source-rows">
          {visible.map((row) => {
            const index = rows.indexOf(row);
            const isCurrent = index === current;
            const didFail = failed.includes(index);
            const seeders = seedersText(row);
            const rowState = isCurrent
              ? status === "error"
                ? "No arrancó"
                : starting
                  ? `Abriendo… ${state?.elapsedS ?? 0} s`
                  : "En pantalla"
              : didFail
                ? "No arrancó"
                : "Ver esta";
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className="source-row"
                  data-current={isCurrent ? "true" : undefined}
                  data-failed={didFail && !isCurrent ? "true" : undefined}
                  aria-current={isCurrent ? "true" : undefined}
                  onClick={() => {
                    setPick((previous) => ({ index, nonce: (previous?.nonce ?? 0) + 1 }));
                    document.querySelector(".player")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  <span className="source-row-quality">{row.quality === "auto" ? "—" : row.quality}</span>
                  <span className="source-row-main">
                    <span className="source-row-name" title={row.releaseName}>
                      {distinctReleaseName(row.releaseName, title)}
                    </span>
                    <span className="source-row-facts">
                      {row.releaseTags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                      {row.languages.map((language) => (
                        <span key={language} className="source-row-lang">
                          {language}
                        </span>
                      ))}
                      <span className="source-row-addon">{row.addonName}</span>
                    </span>
                  </span>
                  <span className="source-row-size">{sizeText(row.sizeLabel)}</span>
                  <span className={`source-row-seeds${row.seeders === 0 ? " is-dead" : ""}`}>{seeders ?? ""}</span>
                  <span className="source-row-state">
                    {isCurrent && !starting && status !== "error" ? null : !didFail && !isCurrent ? <IconPlay size={13} /> : null}
                    {rowState}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {rows.length > FIRST_ROWS && (
          <button
            type="button"
            className="btn btn-ghost btn-sm source-list-more"
            aria-expanded={showAll}
            onClick={() => setShowAll((value) => !value)}
          >
            <IconChevronDown size={14} className={showAll ? "is-flipped" : undefined} />
            {showAll ? "Mostrar menos" : `Mostrar las ${rows.length}`}
          </button>
        )}
      </section>
    </div>
  );
}
