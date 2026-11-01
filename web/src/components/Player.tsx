"use client";

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type HlsType from "hls.js";
import LearningPanel from "./LearningPanel";
import { cuesToVtt, parseCues } from "@/lib/subs/format";
import {
  IconAlert,
  IconChevronDown,
  IconExitFullscreen,
  IconFullscreen,
  IconMute,
  IconPause,
  IconPip,
  IconPlay,
  IconRefresh,
  IconSettings,
  IconSpark,
  IconSubs,
  IconVolume,
} from "./icons";

export interface PlayerSource {
  id: string;
  label: string;
  url: string;
  kind: "hls" | "mp4";
  note?: string;
  score?: number;
  edgeAgeS?: number | null;
  height?: number | null;
  /** Same-upload caption assets, not a claim of perfect human-verified alignment. */
  matchedSubtitleIds?: string[];
}

export interface PlayerSubtitle {
  id: string;
  label: string;
  lang: string;
  url: string;
}

interface Props {
  sources: PlayerSource[];
  mode: "live" | "vod";
  title?: string;
  subtitle?: string;
  poster?: string;
  subtitles?: PlayerSubtitle[];
  storageKey?: string;
  autoPlay?: boolean;
  onEnded?: () => void;
  onSourceChange?: (source: PlayerSource) => void;
}

type Status = "loading" | "playing" | "paused" | "error" | "switching";
type Panel = "settings" | "subs" | "quality" | null;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function readStored(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export default function Player({
  sources,
  mode,
  title,
  subtitle,
  poster,
  subtitles = [],
  storageKey = "default",
  autoPlay = false,
  onEnded,
  onSourceChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const indexRef = useRef(0);
  const retriesRef = useRef(0);
  const lastProgressRef = useRef(Date.now());
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ at: number; x: number }>({ at: 0, x: 0 });
  const subTouchedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onSourceChangeRef = useRef(onSourceChange);
  onSourceChangeRef.current = onSourceChange;

  const [sourceIndex, setSourceIndex] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<{ index: number; height: number | null; bitrate: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [latency, setLatency] = useState<number | null>(null);
  const [controls, setControls] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [pip, setPip] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [seekHint, setSeekHint] = useState<string | null>(null);
  const [learningOpen, setLearningOpen] = useState(false);

  indexRef.current = sourceIndex;
  const source = sources[sourceIndex];
  const edgeLabel = source?.edgeAgeS != null ? `~${Math.round(source.edgeAgeS)} s` : null;

  const activeSubtitle = useMemo(
    () => subtitles.find((track) => track.id === activeSub) ?? null,
    [subtitles, activeSub],
  );

  const clearHideTimer = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  };

  const revealControls = useCallback(() => {
    setControls(true);
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControls(false);
    }, 3200);
  }, []);

  const failover = useRef<(reason: string) => void>(() => undefined);
  failover.current = (reason: string) => {
    setPanel(null);
    const next = indexRef.current + 1;
    if (next < sourcesRef.current.length) {
      setStatus("switching");
      setError(reason);
      setSourceIndex(next);
    } else {
      setStatus("error");
      setError(reason);
    }
  };

  /* ------------------------- playback bootstrap ------------------------- */
  const sourceUrl = source?.url;
  const sourceKind = source?.kind;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !sourceUrl || !sourceKind) {
      setStatus("error");
      setError("No hay fuentes disponibles");
      return;
    }

    let cancelled = false;
    let hls: HlsType | null = null;
    retriesRef.current = 0;
    lastProgressRef.current = Date.now();
    setStatus("loading");
    setError(null);
    setLevels([]);
    setCurrentLevel(-1);
    setLatency(null);
    setPanel(null);

    const resumeAt = mode === "vod" ? readStored(`fubol:resume:${storageKey}`) : 0;

    const play = () => {
      if (!autoPlay) {
        setStatus("paused");
        return;
      }
      video.play().catch(() => {
        if (!cancelled) setStatus("paused");
      });
    };

    const start = async () => {
      if (sourceKind === "mp4") {
        video.src = sourceUrl;
        if (resumeAt > 5) video.currentTime = resumeAt;
        video.load();
        play();
        return;
      }

      const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";
      if (nativeHls) {
        video.src = sourceUrl;
        try {
          if (mode === "live") {
            // Safari starts at the live edge by default.
          } else if (resumeAt > 5) {
            video.currentTime = resumeAt;
          }
        } catch {
          // ignore metadata timing
        }
        video.load();
        play();
        return;
      }

      const mod = await import("hls.js");
      if (cancelled) return;
      const Hls = mod.default;
      if (!Hls.isSupported()) {
        setStatus("error");
        setError("Este navegador no soporta HLS. Probá con Chrome, Edge o Safari.");
        return;
      }

      hls = new Hls({
        lowLatencyMode: mode === "live",
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 4,
        maxLiveSyncPlaybackRate: 1.5,
        backBufferLength: mode === "live" ? 0 : 90,
        maxBufferLength: mode === "live" ? 6 : 30,
        maxMaxBufferLength: mode === "live" ? 10 : 60,
        startFragPrefetch: true,
        testBandwidth: false,
        enableWorker: true,
        abrEwmaDefaultEstimate: 3_000_000,
        fragLoadingMaxRetry: 4,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 4,
        startPosition: mode === "vod" && resumeAt > 5 ? resumeAt : -1,
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        setLevels(
          hls?.levels.map((level, index) => ({
            index,
            height: level.height || null,
            bitrate: level.bitrate || 0,
          })) ?? [],
        );
        if (mode === "vod" && resumeAt > 5) {
          try {
            video.currentTime = resumeAt;
          } catch {
            // ignore
          }
        }
        play();
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        if (cancelled) return;
        setCurrentLevel(data.level ?? -1);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (cancelled || !data.fatal) return;
        retriesRef.current += 1;
        if (data.type === "mediaError" && retriesRef.current <= 2) {
          hls?.recoverMediaError();
          return;
        }
        if (
          data.type === "networkError" &&
          retriesRef.current <= 2 &&
          data.details !== "manifestLoadError" &&
          data.details !== "manifestLoadTimeOut"
        ) {
          hls?.startLoad();
          return;
        }
        failover.current(
          data.details === "manifestLoadError"
            ? "La fuente no responde"
            : "La señal se cortó",
        );
      });

      hls.loadSource(sourceUrl);
      hls.attachMedia(video);
    };

    void start();

    return () => {
      cancelled = true;
      hls?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [sourceUrl, sourceKind, sourceIndex, retryNonce, mode, storageKey]);

  /* --------------------------- latency governor -------------------------- */
  useEffect(() => {
    if (mode !== "live") return;
    const timer = setInterval(() => {
      const video = videoRef.current;
      const hls = hlsRef.current;
      if (!video) return;
      let value: number | null = null;
      if (hls) {
        const reported = (hls as unknown as { latency?: number }).latency;
        if (typeof reported === "number" && Number.isFinite(reported) && reported >= 0) value = reported;
        else if (typeof hls.liveSyncPosition === "number") value = hls.liveSyncPosition - video.currentTime;
      } else if (video.seekable.length > 0) {
        const edge = video.seekable.end(video.seekable.length - 1);
        value = edge - video.currentTime;
      }
      if (value !== null) setLatency(Math.max(0, Math.round(value * 10) / 10));

      if (!video.paused && value !== null) {
        if (value > 8 && value < 45) video.playbackRate = 1.07;
        else if (value < 1.2 && video.playbackRate > 1) video.playbackRate = 0.98;
        else if (value >= 2 && value <= 8 && video.playbackRate !== 1) video.playbackRate = 1;
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [mode]);

  /* ----------------------------- stall guard ----------------------------- */
  useEffect(() => {
    if (mode !== "live") return;
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || status === "switching" || status === "error") return;
      if (Date.now() - lastProgressRef.current > 10_000) {
        lastProgressRef.current = Date.now();
        failover.current("La señal se congeló");
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [mode, status]);

  /* ------------------------------ subtitles ----------------------------- */
  useEffect(() => {
    if (subTouchedRef.current) return;
    const matched = subtitles.find((track) => source?.matchedSubtitleIds?.includes(track.id));
    const spanish = subtitles.find((track) => track.lang === "es" && !/forced|forzado/i.test(track.label));
    const preferred = matched ?? spanish ?? subtitles[0];
    if (preferred && preferred.id !== activeSub) setActiveSub(preferred.id);
  }, [subtitles, activeSub, source?.id, source?.matchedSubtitleIds]);

  useEffect(() => {
    if (activeSub) {
      try {
        const stored = Number(localStorage.getItem(`fubol:offset:${storageKey}:${activeSub}`));
        setOffsetMs(Number.isFinite(stored) ? stored : 0);
      } catch {
        setOffsetMs(0);
      }
    }
  }, [activeSub, storageKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    for (const element of Array.from(video.querySelectorAll("track[data-fubol]"))) {
      element.remove();
    }
    if (!activeSubtitle) return;

    let url: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(activeSubtitle.url);
        if (!response.ok) throw new Error("subtitle fetch");
        let vtt = await response.text();
        if (offsetMs !== 0) {
          vtt = cuesToVtt(
            parseCues(vtt).map((cue) => ({
              start: Math.max(0, cue.start + offsetMs),
              end: Math.max(0, cue.end + offsetMs),
              text: cue.text,
            })),
          );
        }
        const blob = new Blob([vtt], { type: "text/vtt;charset=utf-8" });
        url = URL.createObjectURL(blob);
        if (cancelled) return;
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = activeSubtitle.label;
        track.srclang = activeSubtitle.lang;
        track.default = true;
        track.dataset.fubol = "1";
        track.src = url;
        track.addEventListener("load", () => {
          track.track.mode = "showing";
        });
        video.appendChild(track);
        track.track.mode = "showing";
      } catch {
        if (!cancelled) setSyncMsg("No se pudo cargar el subtítulo");
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [activeSubtitle, offsetMs]);

  useEffect(() => {
    if (!activeSub) return;
    try {
      localStorage.setItem(`fubol:offset:${storageKey}:${activeSub}`, String(offsetMs));
    } catch {
      // storage may be disabled
    }
  }, [offsetMs, activeSub, storageKey]);

  /* ------------------------------- video UI ------------------------------ */
  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    if (mode === "vod") {
      const resume = readStored(`fubol:resume:${storageKey}`);
      if (resume > 5 && Math.abs(video.currentTime - resume) > 3 && resume < video.duration - 10) {
        video.currentTime = resume;
      }
    }
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    lastProgressRef.current = Date.now();
    setCurrent(video.currentTime);
    if (mode === "vod") {
      try {
        if (Math.floor(video.currentTime) % 5 === 0) {
          localStorage.setItem(`fubol:resume:${storageKey}`, String(video.currentTime));
        }
      } catch {
        // ignore
      }
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
    revealControls();
  };

  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video || mode === "live") return;
    video.currentTime = Math.max(0, Math.min(video.duration || Number.MAX_SAFE_INTEGER, video.currentTime + seconds));
    setSeekHint(seconds > 0 ? `+${seconds} s` : `${seconds} s`);
    setTimeout(() => setSeekHint(null), 700);
  };

  const goLive = () => {
    const video = videoRef.current;
    const hls = hlsRef.current;
    if (!video) return;
    if (hls && typeof hls.liveSyncPosition === "number") {
      video.currentTime = hls.liveSyncPosition;
    } else if (video.seekable.length > 0) {
      video.currentTime = video.seekable.end(video.seekable.length - 1) - 1;
    } else if (latency) {
      video.currentTime += latency;
    }
    video.playbackRate = 1;
    void video.play().catch(() => undefined);
    setLatency(0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const changeVolume = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    video.muted = value === 0;
    setVolume(value);
    setMuted(value === 0);
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFullscreen(false);
      } else if (container?.requestFullscreen) {
        await container.requestFullscreen();
        setFullscreen(true);
      } else if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    } catch {
      // iOS may reject; ignore
    }
  };

  const togglePip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPip(false);
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
        setPip(true);
      }
    } catch {
      // not supported
    }
  };

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const changeSource = (index: number) => {
    if (index === sourceIndex) return;
    setSourceIndex(index);
    const next = sources[index];
    if (next) onSourceChangeRef.current?.(next);
  };

  const setLevel = (index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = index;
    setCurrentLevel(index);
  };

  const runAutoSync = async () => {
    if (!activeSubtitle || subtitles.length < 2) {
      setSyncMsg("Se necesitan dos pistas para comparar");
      return;
    }
    const reference =
      subtitles.find((track) => track.lang !== activeSubtitle.lang) ??
      subtitles.find((track) => track.id !== activeSubtitle.id);
    if (!reference) {
      setSyncMsg("No hay otra pista de referencia");
      return;
    }
    const tokenOf = (url: string) => {
      try {
        return new URL(url, window.location.origin).searchParams.get("t");
      } catch {
        return null;
      }
    };
    const referenceToken = tokenOf(reference.url);
    const targetToken = tokenOf(activeSubtitle.url);
    if (!referenceToken || !targetToken) {
      setSyncMsg("No se pudo preparar el sync");
      return;
    }
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const response = await fetch("/api/subtitles/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "reference", reference: referenceToken, target: targetToken }),
      });
      const data = (await response.json()) as {
        offsetMs?: number;
        confidence?: number;
        error?: string;
      };
      if (response.ok && typeof data.offsetMs === "number") {
        setOffsetMs(data.offsetMs);
        setSyncMsg(
          `Offset ${(data.offsetMs / 1000).toFixed(1)} s · confianza ${Math.round((data.confidence ?? 0) * 100)}%`,
        );
      } else {
        setSyncMsg(data.error ?? "No se pudo sincronizar");
      }
    } catch {
      setSyncMsg("Error de red al sincronizar");
    } finally {
      setSyncBusy(false);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    switch (event.key) {
      case " ":
      case "k":
        event.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        if (mode === "vod") {
          event.preventDefault();
          seekBy(-10);
        }
        break;
      case "ArrowRight":
        if (mode === "vod") {
          event.preventDefault();
          seekBy(10);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        changeVolume(Math.min(1, volume + 0.1));
        break;
      case "ArrowDown":
        event.preventDefault();
        changeVolume(Math.max(0, volume - 0.1));
        break;
      case "m":
        toggleMute();
        break;
      case "f":
        void toggleFullscreen();
        break;
      case "p":
        void togglePip();
        break;
      case "c":
        subTouchedRef.current = true;
        setPanel(panel === "subs" ? null : "subs");
        break;
      case "[":
        if (activeSub) setOffsetMs((value) => Math.round((value - 100) * 10) / 10);
        break;
      case "]":
        if (activeSub) setOffsetMs((value) => Math.round((value + 100) * 10) / 10);
        break;
      default:
        break;
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== "vod") return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, .player-panel")) return;
    const now = Date.now();
    const previous = lastTapRef.current;
    if (now - previous.at < 320) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      if (x < rect.width * 0.35) seekBy(-10);
      else if (x > rect.width * 0.65) seekBy(10);
      previous.at = 0;
    } else {
      lastTapRef.current = { at: now, x: event.clientX };
    }
  };

  const progressPct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const live = mode === "live";
  const settingsOpen = panel === "settings";
  const subsOpen = panel === "subs";
  const qualityOpen = panel === "quality";

  return (
    <>
    <div
      className="player"
      ref={containerRef}
      data-controls={controls ? "true" : "false"}
      data-status={status}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseMove={revealControls}
      onMouseLeave={() => {
        if (videoRef.current && !videoRef.current.paused) setControls(false);
      }}
      onPointerUp={onPointerUp}
    >
      <video
        ref={videoRef}
        className="player-video"
        poster={poster}
        playsInline
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => {
          setStatus("playing");
          revealControls();
        }}
        onPause={() => {
          setStatus("paused");
          setControls(true);
        }}
        onWaiting={() => {
          if (status !== "error" && status !== "switching") setStatus("loading");
        }}
        onPlaying={() => setStatus("playing")}
        onVolumeChange={() => {
          const video = videoRef.current;
          if (!video) return;
          setMuted(video.muted);
          setVolume(video.volume);
        }}
        onEnded={() => {
          setStatus("paused");
          onEndedRef.current?.();
        }}
        onError={() => {
          if (!hlsRef.current) failover.current("El video no se pudo reproducir");
        }}
        onClick={() => {
          if (panel) setPanel(null);
          else togglePlay();
        }}
        onDoubleClick={() => void toggleFullscreen()}
      />

      <div className="player-shade" aria-hidden />

      {status === "loading" && (
        <div className="player-center">
          <div className="spinner" />
          <p className="player-hint">{edgeLabel ? `Conectando · ${edgeLabel} de delay` : "Conectando con la señal…"}</p>
        </div>
      )}

      {status === "switching" && (
        <div className="player-center">
          <div className="spinner" />
          <p className="player-hint">Cambiando de fuente…</p>
        </div>
      )}

      {status === "paused" && (
        <button className="player-bigplay" onClick={togglePlay} aria-label="Reproducir">
          <IconPlay size={30} />
        </button>
      )}

      {status === "error" && (
        <div className="player-overlay">
          <div className="player-error">
            <IconAlert size={26} />
            <h3>Se cortó la señal</h3>
            <p>{error ?? "No se pudo reproducir esta fuente."}</p>
            <div className="player-error-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setRetryNonce((value) => value + 1);
                  void videoRef.current?.play().catch(() => undefined);
                }}
              >
                <IconRefresh size={16} /> Reintentar
              </button>
              {sources.length > 1 && (
                <button className="btn btn-ghost btn-sm" onClick={() => changeSource((sourceIndex + 1) % sources.length)}>
                  Otra fuente
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {seekHint && <div className="seek-hint">{seekHint}</div>}

      <div className="player-top">
        <div className="player-meta">
          {title && <strong>{title}</strong>}
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div className="player-badges">
          {live ? (
            <span className="live-chip">
              <i className="live-dot" /> EN VIVO
            </span>
          ) : null}
          {live && latency !== null ? <span className="latency-chip">{Math.round(latency)} s</span> : null}
          {source ? <span className="source-chip">{source.label}</span> : null}
        </div>
      </div>

      <div className="player-bottom">
        {live ? (
          <div className="live-track">
            <span className="live-track-fill" />
          </div>
        ) : (
          <input
            className="seek"
            type="range"
            min={0}
            max={Number.isFinite(duration) && duration > 0 ? duration : 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            style={{ "--progress": `${progressPct}%` } as CSSProperties}
            onChange={(event) => {
              const video = videoRef.current;
              if (!video) return;
              video.currentTime = Number(event.target.value);
            }}
            aria-label="Posición"
          />
        )}

        <div className="player-controls">
          <button className="icon-btn" onClick={togglePlay} aria-label={status === "playing" ? "Pausa" : "Reproducir"}>
            {status === "playing" ? <IconPause size={20} /> : <IconPlay size={20} />}
          </button>

          <button className="icon-btn" onClick={toggleMute} aria-label={muted ? "Activar sonido" : "Silenciar"}>
            {muted || volume === 0 ? <IconMute size={20} /> : <IconVolume size={20} />}
          </button>
          <input
            className="volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => changeVolume(Number(event.target.value))}
            aria-label="Volumen"
          />

          <span className="time-chip">
            {formatTime(current)}
            {!live && duration > 0 ? ` / ${formatTime(duration)}` : ""}
          </span>

          {live && latency !== null && latency > 10 ? (
            <button className="btn btn-live btn-sm" onClick={goLive}>
              <IconSpark size={14} /> Ir al vivo
            </button>
          ) : null}

          <div className="player-spacer" />

          {live && edgeLabel ? <span className="edge-chip">delay {edgeLabel}</span> : null}

          <button
            className={`icon-btn ${activeSub ? "is-on" : ""}`}
            onClick={() => {
              subTouchedRef.current = true;
              setPanel(subsOpen ? null : "subs");
            }}
            aria-label="Subtítulos"
          >
            <IconSubs size={21} />
          </button>

          <button
            className={`icon-btn ${qualityOpen ? "is-on" : ""}`}
            onClick={() => setPanel(qualityOpen ? null : "quality")}
            aria-label="Calidad"
          >
            <span className="quality-label">
              {currentLevel >= 0 ? `${levels.find((level) => level.index === currentLevel)?.height ?? "A"}p` : "AUTO"}
            </span>
            <IconChevronDown size={13} />
          </button>

          <button
            className={`icon-btn ${settingsOpen ? "is-on" : ""}`}
            onClick={() => setPanel(settingsOpen ? null : "settings")}
            aria-label="Ajustes"
          >
            <IconSettings size={20} />
          </button>

          <button
            className={`icon-btn hide-mobile${pip ? " is-on" : ""}`}
            onClick={() => void togglePip()}
            aria-label="Picture in picture"
            aria-pressed={pip}
          >
            <IconPip size={20} />
          </button>

          <button className="icon-btn" onClick={() => void toggleFullscreen()} aria-label="Pantalla completa">
            {fullscreen ? <IconExitFullscreen size={20} /> : <IconFullscreen size={20} />}
          </button>
        </div>

        {settingsOpen && (
          <div className="player-panel">
            <h4>Fuentes</h4>
            <div className="panel-list">
              {sources.map((item, index) => (
                <button
                  key={item.id}
                  className={`panel-item ${index === sourceIndex ? "is-active" : ""}`}
                  onClick={() => changeSource(index)}
                >
                  <span>
                    {index + 1}. {item.label}
                  </span>
                  <small>
                    {item.height ? `${item.height}p · ` : ""}
                    {item.edgeAgeS != null ? `${Math.round(item.edgeAgeS)} s` : "sin medir"}
                    {item.score != null ? ` · score ${item.score}` : ""}
                  </small>
                </button>
              ))}
            </div>
            <p className="panel-note">
              Fubol prueba las fuentes en paralelo y cambia sola si la actual se cae.
            </p>
          </div>
        )}

        {subsOpen && (
          <div className="player-panel">
            <h4>Subtítulos</h4>
            <div className="panel-list">
              <button
                className={`panel-item ${!activeSub ? "is-active" : ""}`}
                onClick={() => {
                  subTouchedRef.current = true;
                  setActiveSub(null);
                }}
              >
                Desactivados
              </button>
              {subtitles.length === 0 && <p className="panel-note">No hay subtítulos para este título.</p>}
              {subtitles.map((track) => (
                <button
                  key={track.id}
                  className={`panel-item ${activeSub === track.id ? "is-active" : ""}`}
                  onClick={() => {
                    subTouchedRef.current = true;
                    setActiveSub(track.id);
                  }}
                >
                  <span>
                    {track.lang.toUpperCase()} · {track.label}
                  </span>
                  <small>{track.id.includes("forced") ? "forzados" : track.id.slice(0, 28)}</small>
                </button>
              ))}
            </div>

            {activeSub && (
              <>
                <div className="offset-row">
                  <button className="btn btn-ghost btn-xs" onClick={() => setOffsetMs((value) => value - 1000)}>
                    -1 s
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => setOffsetMs((value) => Math.round((value - 100) * 10) / 10)}>
                    -0.1 s
                  </button>
                  <span className="offset-value">{(offsetMs / 1000).toFixed(1)} s</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => setOffsetMs((value) => Math.round((value + 100) * 10) / 10)}>
                    +0.1 s
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => setOffsetMs((value) => value + 1000)}>
                    +1 s
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => setOffsetMs(0)}>
                    reset
                  </button>
                </div>
                <button className="btn btn-primary btn-sm" disabled={syncBusy} onClick={() => void runAutoSync()}>
                  <IconSpark size={15} /> {syncBusy ? "Sincronizando…" : "Sincronizar automático"}
                </button>
                {syncMsg && <p className="panel-note">{syncMsg}</p>}
              </>
            )}
          </div>
        )}

        {qualityOpen && (
          <div className="player-panel player-panel-right">
            <h4>Calidad</h4>
            <div className="panel-list">
              <button className={`panel-item ${currentLevel === -1 ? "is-active" : ""}`} onClick={() => setLevel(-1)}>
                Automática
              </button>
              {levels.map((level) => (
                <button
                  key={level.index}
                  className={`panel-item ${currentLevel === level.index ? "is-active" : ""}`}
                  onClick={() => setLevel(level.index)}
                >
                  {level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps`}
                  <small>{Math.round(level.bitrate / 1000)} kbps</small>
                </button>
              ))}
              {levels.length === 0 && <p className="panel-note">El origen no expone variantes.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
    {mode === "vod" && <div className="learning-wrapper">
      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={learningOpen} onClick={() => setLearningOpen((open) => !open)}>
        {learningOpen ? "Close English practice" : "Learn English"}
      </button>
      {learningOpen && <LearningPanel title={title ?? "Untitled"} storageKey={storageKey} subtitles={subtitles} current={current} activeSubtitleId={activeSub} activeSubtitleOffsetMs={offsetMs} video={videoRef.current} />}
    </div>}
    </>
  );
}
