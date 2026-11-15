"use client";

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type HlsType from "hls.js";
import LearningPanel from "./LearningPanel";
import { cuesToVtt, parseCues } from "@/lib/subs/format";
import { describeSync } from "@/lib/subs/describe";
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
  /** Seconds the origin's playlist edge sits behind the wall clock. */
  edgeAgeS?: number | null;
  /** Whether `edgeAgeS` can be shown as a delay. See lib/live/playlist.ts. */
  edgeTrust?: "measured" | "extrapolated" | "implausible" | "none";
  /** Origin segment length: every live buffer figure is derived from it. */
  targetDuration?: number | null;
  /** Playback goes through the local ffmpeg relay, which adds its own delay. */
  relayed?: boolean;
  height?: number | null;
  /** Same-upload caption assets, not a claim of perfect human-verified alignment. */
  matchedSubtitleIds?: string[];
  /** Served from a swarm: the first bytes can take up to a minute. */
  p2p?: boolean;
  /** The file itself, whichever addon listed it; alignment is kept per copy. */
  copyId?: string;
}

export interface PlayerSubtitle {
  id: string;
  label: string;
  lang: string;
  url: string;
  forced?: boolean;
}

/** A shift the house already measured or set for one copy and one track. */
export interface PlayerAlignment {
  copy: string;
  track: string;
  offsetMs: number;
  confidence: number;
  method: "audio" | "reference" | "manual";
}

export type SyncMethod = "none" | "reference" | "audio" | "manual";

export interface PlayerState {
  index: number;
  status: Status;
  /** Sources that did not start or stopped for good in this visit. */
  failed: number[];
  /** Seconds the current attempt has been loading. */
  elapsedS: number;
  subtitle: {
    trackId: string | null;
    offsetMs: number;
    method: SyncMethod;
    measuring: "reference" | "audio" | null;
  };
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
  /** Position report, so the app can remember where this viewer stopped. */
  onProgress?: (position: number, duration: number) => void;
  /** Where the family left off, when the page was opened from that list. */
  resumeFrom?: number;
  /** Alignments already known for this title (per copy and track). */
  alignments?: PlayerAlignment[];
  /** A source chosen outside the player; the nonce repeats a pick of the same one. */
  pick?: { index: number; nonce: number };
  onStateChange?: (state: PlayerState) => void;
  /** Rendered right under the video, before the English practice. */
  belowPlayer?: ReactNode;
}

export type Status = "loading" | "playing" | "paused" | "error" | "switching";

/**
 * How long a source gets to show its first frame before the next one is
 * tried. A cold swarm measured 63.7 s to first byte once, but most answer in
 * under twenty; waiting the full minute on a dead one is what left the screen
 * on "Conectando…" with nothing else to do.
 */
const START_BUDGET_MS = { direct: 20_000, p2p: 50_000 } as const;
/** A film that was playing and stays buffering this long moves on. */
const VOD_STALL_MS = 30_000;
/** After this, the loading screen offers to skip to another source. */
const OFFER_SKIP_MS = 6_000;
type Panel = "settings" | "subs" | "quality" | null;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** hls.js load policy for sources that are slow to answer but do answer. */
function slowPolicy(budgetMs: number) {
  return {
    maxTimeToFirstByteMs: budgetMs,
    maxLoadTimeMs: budgetMs + 30_000,
    timeoutRetry: { maxNumRetry: 1, retryDelayMs: 0, maxRetryDelayMs: 0 },
    errorRetry: { maxNumRetry: 2, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
  };
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
  onProgress,
  resumeFrom = 0,
  alignments = [],
  pick,
  onStateChange,
  belowPlayer,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const indexRef = useRef(0);
  const retriesRef = useRef(0);
  const soloRetryAtRef = useRef(0);
  const lastProgressRef = useRef(Date.now());
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ at: number; x: number }>({ at: 0, x: 0 });
  /** A touch that only revealed the controls must not also toggle playback. */
  const touchRevealedRef = useRef(false);
  const subTouchedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onSourceChangeRef = useRef(onSourceChange);
  onSourceChangeRef.current = onSourceChange;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const [sourceIndex, setSourceIndex] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<{ index: number; height: number | null; bitrate: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  /** Seconds the player sits behind the playlist edge (our own buffer). */
  const [latency, setLatency] = useState<number | null>(null);
  /** Seconds behind the wall clock for the frame on screen, when trustworthy. */
  const [wallDelay, setWallDelay] = useState<number | null>(null);
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
  const [syncMethod, setSyncMethod] = useState<SyncMethod>("none");
  const [measuring, setMeasuring] = useState<"reference" | "audio" | null>(null);
  const [resyncNonce, setResyncNonce] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [seekHint, setSeekHint] = useState<string | null>(null);
  const [learningOpen, setLearningOpen] = useState(false);
  /** Sources that did not start, or stopped for good, during this visit. */
  const [failed, setFailed] = useState<number[]>([]);
  const failedRef = useRef<number[]>([]);
  failedRef.current = failed;
  const [elapsedS, setElapsedS] = useState(0);
  /** When the current attempt started, and whether it ever showed a frame. */
  const attemptStartRef = useRef(Date.now());
  const playedRef = useRef(false);
  const statusRef = useRef<Status>("loading");
  statusRef.current = status;

  indexRef.current = sourceIndex;
  const source = sources[sourceIndex];
  const startBudgetMs = mode === "live" ? START_BUDGET_MS.direct : source?.p2p ? START_BUDGET_MS.p2p : START_BUDGET_MS.direct;

  /**
   * The delay the family cares about is "how far behind the stadium am I",
   * which is the origin's publish lag plus our own buffer. Neither number
   * alone is that answer, and the origin's half is only knowable when its
   * PROGRAM-DATE-TIME can be trusted — so this returns what can be proven and
   * says so when it cannot.
   */
  const delay = useMemo(() => {
    const trusted = source?.edgeTrust === "measured" || source?.edgeTrust === "extrapolated";
    const originS = trusted && source?.edgeAgeS != null ? source.edgeAgeS : null;
    const bufferS = latency;
    const totalS =
      wallDelay != null
        ? wallDelay
        : originS != null && bufferS != null
          ? originS + bufferS
          : null;
    return {
      originS,
      bufferS,
      totalS,
      /** True when totalS came from PDT on the playing frame, not a sum. */
      measuredEnd: wallDelay != null,
      approximate: source?.edgeTrust === "extrapolated",
      /** The origin reports nothing usable: only our own buffer is knowable. */
      originUnknown: !trusted,
      relayed: source?.relayed === true,
    };
  }, [source?.edgeTrust, source?.edgeAgeS, source?.relayed, latency, wallDelay]);

  const delayChip = delay.totalS != null
    ? `${Math.round(delay.totalS)} s de delay${delay.measuredEnd ? "" : " aprox."}`
    : delay.bufferS != null
      ? `${Math.round(delay.bufferS)} s de buffer`
      : null;

  const delayDetail = (() => {
    const parts: string[] = [];
    if (delay.originS != null) {
      parts.push(`origen ${Math.round(delay.originS)} s${delay.approximate ? " (estimado)" : ""}`);
    } else if (delay.originUnknown) {
      parts.push("el origen no informa su delay");
    }
    if (delay.bufferS != null) parts.push(`buffer del player ${Math.round(delay.bufferS)} s`);
    if (delay.relayed) parts.push("más el re-encode local");
    return parts.length ? parts.join(" · ") : null;
  })();

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
    const current = indexRef.current;
    const total = sourcesRef.current.length;
    // Where the film was, so the next copy picks up there instead of at zero.
    const video = videoRef.current;
    if (mode === "vod" && video && playedRef.current && video.currentTime > 5) {
      try {
        localStorage.setItem(`fubol:resume:${storageKey}`, String(video.currentTime));
      } catch {
        // storage may be disabled
      }
    }
    const nowFailed = failedRef.current.includes(current) ? failedRef.current : [...failedRef.current, current];
    failedRef.current = nowFailed;
    setFailed(nowFailed);
    // The next source nobody has given up on yet, after this one first.
    const order = [...Array.from({ length: total }, (_, offset) => (current + 1 + offset) % total)];
    const next = order.find((index) => index !== current && !nowFailed.includes(index));
    if (next !== undefined && total > 1) {
      setStatus("switching");
      setError(reason);
      setSourceIndex(next);
      onSourceChangeRef.current?.(sourcesRef.current[next]!);
      return;
    }
    if (total > 1) {
      // A match keeps going: live sources drop and come back, so once a
      // minute the whole list gets another round. A film's dead swarm does
      // not come back in a minute, so there it is the person's call.
      if (mode === "live" && Date.now() - soloRetryAtRef.current > 60_000) {
        soloRetryAtRef.current = Date.now();
        failedRef.current = [current];
        setFailed([current]);
        setStatus("switching");
        setError(reason);
        setSourceIndex((current + 1) % total);
        return;
      }
      setStatus("error");
      setError(reason);
      return;
    }
    // With a single source there is nothing to switch to, but restarting it
    // rebuilds the relay job; that alone recovers a dead ffmpeg. Allow one
    // attempt per minute so a genuinely broken source does not loop.
    if (Date.now() - soloRetryAtRef.current > 60_000) {
      soloRetryAtRef.current = Date.now();
      setStatus("switching");
      setError(reason);
      setRetryNonce((value) => value + 1);
      return;
    }
    setStatus("error");
    setError(reason);
  };

  /* ------------------------- playback bootstrap ------------------------- */
  const sourceUrl = source?.url;
  const sourceKind = source?.kind;
  const sourceTargetDuration = source?.targetDuration ?? null;
  const sourceP2p = source?.p2p === true;

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
    attemptStartRef.current = Date.now();
    playedRef.current = false;
    setElapsedS(0);
    setStatus("loading");
    setError(null);
    setLevels([]);
    setCurrentLevel(-1);
    setLatency(null);
    setPanel(null);

    // The browser remembers where this device stopped; the shared history
    // remembers where the family stopped. The newer of the two wins.
    const stored = mode === "vod" ? readStored(`fubol:resume:${storageKey}`) : 0;
    const resumeAt = Math.max(stored, mode === "vod" ? resumeFrom ?? 0 : 0);

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
      const mod = await import("hls.js");
      if (cancelled) return;
      const Hls = mod.default;
      // Prefer hls.js whenever Media Source Extensions exist: only there we can
      // show the latency readout, offer "Ir al vivo", switch levels and run the
      // retry/failover hooks. Native HLS remains the fallback for iOS Safari,
      // where MSE is unavailable.
      if (!Hls.isSupported() && nativeHls) {
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
      if (!Hls.isSupported()) {
        setStatus("error");
        setError("Este navegador no soporta HLS. Probá con Chrome, Edge o Safari.");
        return;
      }

      // Segment length decides every live buffer number. The previous config
      // hard-coded values tuned for the relay's 1 s segments and then applied
      // them to every origin: against a 6 s playlist it asked to sit 12 s
      // behind the edge while buffering only 8 s, so it ran permanently on the
      // edge of its own buffer. HLS also wants at least three target durations
      // of headroom, which 12 s against 6 s segments does not give.
      const segmentS = sourceTargetDuration && sourceTargetDuration > 0 ? sourceTargetDuration : 2;
      const liveSyncS = Math.min(15, Math.max(3, segmentS * 2.5));
      const liveBufferS = Math.max(liveSyncS + segmentS * 2, segmentS * 4);

      hls = new Hls({
        // Regular HLS, not LL-HLS: lowLatencyMode forces aggressive catch-up on
        // non-LL playlists and costs frames.
        lowLatencyMode: false,
        // Absolute seconds rather than a segment count, so the target does not
        // silently change meaning when the origin's segment length changes.
        liveSyncDuration: mode === "live" ? liveSyncS : undefined,
        liveMaxLatencyDuration: mode === "live" ? liveSyncS + segmentS * 4 : undefined,
        // hls.js is now the only component adjusting playback rate. A second
        // governor in this file used to fight it for the whole match.
        maxLiveSyncPlaybackRate: 1.05,
        backBufferLength: mode === "live" ? 30 : 90,
        maxBufferLength: mode === "live" ? liveBufferS : 30,
        maxMaxBufferLength: mode === "live" ? liveBufferS * 2 : 60,
        startFragPrefetch: true,
        testBandwidth: false,
        enableWorker: true,
        abrEwmaDefaultEstimate: 3_000_000,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 6,
        startPosition: mode === "vod" && resumeAt > 5 ? resumeAt : -1,
        // A swarm-backed source is remuxed on the fly: its playlist took 9 s
        // to appear when measured, and the first segment of a cold swarm
        // longer. hls.js gives up after 10 s to first byte by default, which
        // abandoned working sources; the watchdog above already bounds the
        // whole start, so the loaders only need not to quit early.
        ...(sourceP2p
          ? {
              manifestLoadPolicy: { default: slowPolicy(60_000) },
              playlistLoadPolicy: { default: slowPolicy(60_000) },
              fragLoadPolicy: { default: slowPolicy(90_000) },
            }
          : {}),
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
  }, [sourceUrl, sourceKind, sourceTargetDuration, sourceP2p, sourceIndex, retryNonce, mode, storageKey]);

  /* -------------------------- delay measurement -------------------------
   * Three different quantities used to be conflated into one "latency" chip:
   * how far the player sits behind the playlist edge, how far the origin's
   * edge sits behind the wall clock, and the sum the viewer actually
   * experiences. They are now measured and labelled separately, and the
   * player no longer adjusts playbackRate itself — hls.js already does that,
   * and the second governor fought it for ninety minutes straight.
   * ------------------------------------------------------------------- */
  useEffect(() => {
    if (mode !== "live") return;
    const timer = setInterval(() => {
      const video = videoRef.current;
      const hls = hlsRef.current;
      if (!video) return;

      let behindEdge: number | null = null;
      const reported = hls?.latency;
      if (typeof reported === "number" && Number.isFinite(reported) && reported >= 0) {
        behindEdge = reported;
      } else if (hls && typeof hls.liveSyncPosition === "number" && Number.isFinite(hls.liveSyncPosition)) {
        behindEdge = hls.liveSyncPosition - video.currentTime;
      } else if (video.seekable.length > 0) {
        // Native playback (iOS Safari) exposes no latency through hls.js; the
        // seekable edge is the live edge there.
        const edge = video.seekable.end(video.seekable.length - 1);
        if (Number.isFinite(edge)) behindEdge = edge - video.currentTime;
      } else if (video.buffered.length > 0) {
        const edge = video.buffered.end(video.buffered.length - 1);
        if (Number.isFinite(edge)) behindEdge = edge - video.currentTime;
      }
      if (behindEdge !== null) setLatency(Math.max(0, Math.round(behindEdge * 10) / 10));

      // hls.js resolves the wall-clock date of the frame on screen from
      // PROGRAM-DATE-TIME. When the origin stamps it honestly this is the only
      // true end-to-end number available in the browser; when it re-stamps at
      // republish time the server already told us not to trust it.
      const playingDate = hls?.playingDate ?? null;
      if (playingDate instanceof Date && Number.isFinite(playingDate.getTime())) {
        const wall = (Date.now() - playingDate.getTime()) / 1000;
        setWallDelay(wall > 0 && wall < 3600 ? Math.round(wall * 10) / 10 : null);
      } else {
        setWallDelay(null);
      }
    }, 2000);
    return () => {
      clearInterval(timer);
      if (stallTimerRef.current !== null) clearTimeout(stallTimerRef.current);
    };
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

  /* ------------------------------ watchdog ------------------------------
   * Nothing on this screen may wait forever. A source gets a fixed budget to
   * show its first frame (longer for a swarm, which has to find peers), and a
   * film that was playing gets one to recover from buffering; past either,
   * the next source is tried. The elapsed time is shown, with a way out.
   * ------------------------------------------------------------------- */
  useEffect(() => {
    const timer = setInterval(() => {
      const current = statusRef.current;
      if (current !== "loading" && current !== "switching") return;
      const now = Date.now();
      const sinceStart = now - attemptStartRef.current;
      setElapsedS(Math.floor(sinceStart / 1000));
      if (!playedRef.current) {
        if (sinceStart > startBudgetMs) {
          failover.current(`No arrancó en ${Math.round(startBudgetMs / 1000)} s`);
        }
        return;
      }
      if (mode === "vod" && now - lastProgressRef.current > VOD_STALL_MS) {
        lastProgressRef.current = now;
        failover.current("Se quedó cargando");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [mode, startBudgetMs]);

  /* ------------------------------ subtitles -----------------------------
   * Which shift applies to the track on screen, in order of trust: what a
   * person set by hand, then a measurement against this copy's audio, then
   * an estimate from comparing with other tracks. Each is kept per copy and
   * per track: the shift of the Spanish track says nothing about the English
   * one, nor about another release of the film.
   * ------------------------------------------------------------------- */
  const copyId = source?.copyId ?? source?.id ?? "";
  const syncKeyNow = activeSubtitle ? `${copyId}|${activeSubtitle.id}` : null;
  const syncKeyRef = useRef<string | null>(null);
  syncKeyRef.current = syncKeyNow;
  const manualKey = (copy: string, track: string) => `fubol:suboffset:${copy}:${track}`;
  const measuredRef = useRef(new Set<string>());

  useEffect(() => {
    if (subTouchedRef.current) return;
    const matched = subtitles.find((track) => source?.matchedSubtitleIds?.includes(track.id));
    const spanish = subtitles.find((track) => track.lang === "es" && !track.forced);
    const preferred = matched ?? spanish ?? subtitles.find((track) => !track.forced) ?? subtitles[0];
    if (preferred && preferred.id !== activeSub) setActiveSub(preferred.id);
  }, [subtitles, activeSub, source?.id, source?.matchedSubtitleIds]);

  const tokenOf = (url: string) => {
    try {
      return new URL(url, window.location.origin).searchParams.get("t");
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!activeSubtitle || !source || !syncKeyNow) {
      setOffsetMs(0);
      setSyncMethod("none");
      setMeasuring(null);
      return;
    }
    const key = syncKeyNow;
    const track = activeSubtitle;
    const stillCurrent = () => syncKeyRef.current === key;
    setSyncMsg(null);

    let manual: number | null = null;
    try {
      const stored = localStorage.getItem(manualKey(copyId, track.id));
      if (stored !== null && Number.isFinite(Number(stored))) manual = Number(stored);
    } catch {
      // storage may be disabled
    }
    const known = alignments.find((item) => item.copy === copyId && item.track === track.id);
    if (manual !== null) {
      setOffsetMs(manual);
      setSyncMethod("manual");
      setMeasuring(null);
      return;
    }
    if (known && (known.method === "manual" || known.method === "audio")) {
      setOffsetMs(known.offsetMs);
      setSyncMethod(known.method);
      setMeasuring(null);
      return;
    }
    setOffsetMs(known?.offsetMs ?? 0);
    setSyncMethod(known ? "reference" : "none");

    // Measure once per copy and track in this visit.
    if (measuredRef.current.has(key)) {
      setMeasuring(null);
      return;
    }
    measuredRef.current.add(key);
    const target = tokenOf(track.url);
    const stream = tokenOf(source.url);
    if (!target) return;

    const apply = (data: { offsetMs?: number; confidence?: number; method?: SyncMethod }, fallback: SyncMethod) => {
      if (!stillCurrent() || typeof data.offsetMs !== "number") return;
      setSyncMethod((method) => {
        // A person's adjustment made while this was running wins.
        if (method === "manual") return method;
        setOffsetMs(data.offsetMs!);
        return data.method ?? fallback;
      });
    };

    void (async () => {
      // 1. A second: compare with up to four other tracks, from different
      //    providers where possible, and keep the shift most agree on.
      if (!known) {
        const others = subtitles.filter((item) => item.id !== track.id && !item.forced);
        const byProvider = new Map<string, PlayerSubtitle>();
        for (const item of others) {
          const provider = item.id.split(":")[0] ?? item.id;
          if (!byProvider.has(provider)) byProvider.set(provider, item);
        }
        const picked = [...byProvider.values(), ...others].filter((item, index, list) => list.indexOf(item) === index).slice(0, 4);
        const references = picked.map((item) => tokenOf(item.url)).filter((value): value is string => Boolean(value));
        if (references.length > 0) {
          if (stillCurrent()) setMeasuring("reference");
          try {
            const response = await fetch("/api/subtitles/sync", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ mode: "reference", target, references, ...(stream ? { stream } : {}) }),
            });
            if (response.ok) apply(await response.json(), "reference");
          } catch {
            // the audio measurement below still runs
          }
        }
      }
      // 2. Minutes, in the background: measure against this copy's audio.
      if (!stream) {
        if (stillCurrent()) setMeasuring(null);
        return;
      }
      if (stillCurrent()) setMeasuring("audio");
      try {
        const response = await fetch("/api/subtitles/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "audio", target, stream }),
        });
        if (response.ok) apply(await response.json(), "audio");
      } catch {
        // the estimate from other tracks stays
      } finally {
        if (stillCurrent()) setMeasuring(null);
      }
    })();
    // `alignments` and `subtitles` come from the same response as the source;
    // re-running on their identity would re-measure on every render.
  }, [syncKeyNow, resyncNonce]);

  /** A person's adjustment: kept on this device and shared with the house. */
  const manualSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeOffset = (deltaMs: number) => {
    if (!activeSubtitle || !source) return;
    const track = activeSubtitle;
    const next = Math.round((offsetMs + deltaMs) / 100) * 100;
    setOffsetMs(next);
    setSyncMethod("manual");
    try {
      localStorage.setItem(manualKey(copyId, track.id), String(next));
    } catch {
      // storage may be disabled
    }
    if (manualSaveTimer.current) clearTimeout(manualSaveTimer.current);
    const target = tokenOf(track.url);
    const stream = tokenOf(source.url);
    if (!target || !stream) return;
    manualSaveTimer.current = setTimeout(() => {
      void fetch("/api/subtitles/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "manual", target, stream, offsetMs: next }),
      }).catch(() => undefined);
    }, 1200);
  };

  /** Drops the hand adjustment and measures again. */
  const backToAutomatic = () => {
    if (!activeSubtitle || !source || !syncKeyNow) return;
    if (manualSaveTimer.current) clearTimeout(manualSaveTimer.current);
    try {
      localStorage.removeItem(manualKey(copyId, activeSubtitle.id));
    } catch {
      // storage may be disabled
    }
    const target = tokenOf(activeSubtitle.url);
    const stream = tokenOf(source.url);
    const key = syncKeyNow;
    void (async () => {
      if (target && stream) {
        await fetch("/api/subtitles/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "clear", target, stream }),
        }).catch(() => undefined);
      }
      measuredRef.current.delete(key);
      setSyncMethod("none");
      setResyncNonce((value) => value + 1);
    })();
  };

  /** Fetched once per track; a new shift only rewrites the cue times. */
  const vttCacheRef = useRef(new Map<string, string>());
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
        let raw = vttCacheRef.current.get(activeSubtitle.id);
        if (raw === undefined) {
          const response = await fetch(activeSubtitle.url);
          if (!response.ok) throw new Error("subtitle fetch");
          raw = await response.text();
          vttCacheRef.current.set(activeSubtitle.id, raw);
        }
        if (cancelled) return;
        const vtt =
          offsetMs === 0
            ? raw
            : cuesToVtt(
                parseCues(raw).map((cue) => ({
                  start: Math.max(0, cue.start + offsetMs),
                  end: Math.max(0, cue.end + offsetMs),
                  text: cue.text,
                })),
              );
        const blob = new Blob([vtt], { type: "text/vtt;charset=utf-8" });
        url = URL.createObjectURL(blob);
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
        if (!cancelled) setSyncMsg("No se pudo cargar este subtítulo. Probá con otra pista.");
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [activeSubtitle, offsetMs]);

  /* ---------------------------- outside view ---------------------------- */
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  useEffect(() => {
    onStateChangeRef.current?.({
      index: sourceIndex,
      status,
      failed,
      elapsedS,
      subtitle: { trackId: activeSub, offsetMs, method: syncMethod, measuring },
    });
  }, [sourceIndex, status, failed, elapsedS, activeSub, offsetMs, syncMethod, measuring]);

  /** A source picked from the list under the player. */
  useEffect(() => {
    if (!pick) return;
    const index = pick.index;
    if (index < 0 || index >= sourcesRef.current.length) return;
    const nowFailed = failedRef.current.filter((item) => item !== index);
    failedRef.current = nowFailed;
    setFailed(nowFailed);
    setError(null);
    if (index === indexRef.current) setRetryNonce((value) => value + 1);
    else setSourceIndex(index);
    // Only a new pick acts; the index alone repeats on every render.
  }, [pick?.nonce]);

  /* ------------------------------- video UI ------------------------------ */
  const clearStallTimer = () => {
    if (stallTimerRef.current !== null) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  };

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
    // Time advancing means it is not buffering, whatever the last event said.
    clearStallTimer();
    if (!video.paused && video.readyState >= 3 && video.currentTime > 0) playedRef.current = true;
    if (status === "loading") setStatus("playing");
    setCurrent(video.currentTime);
    if (mode === "vod") {
      try {
        if (Math.floor(video.currentTime) % 5 === 0) {
          localStorage.setItem(`fubol:resume:${storageKey}`, String(video.currentTime));
        }
      } catch {
        // ignore
      }
      // The shared history is what makes "seguir viendo" work on another
      // device, so it is reported less often than the local resume key.
      if (onProgressRef.current && Math.floor(video.currentTime) % 15 === 0) {
        onProgressRef.current(video.currentTime, video.duration || 0);
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
    // The readout is not reset to zero here: it was a cosmetic lie for two
    // seconds until the next measurement, in a screen whose job is to report
    // the real delay.
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
        nudgeOffset(-100);
        break;
      case "]":
        nudgeOffset(100);
        break;
      default:
        break;
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, .player-panel")) return;

    // Touch devices never fire mousemove, so hidden controls could only be
    // brought back by tapping the video — which toggled play/pause instead.
    // On a phone, the family's main device, that paused the match.
    if (event.pointerType !== "mouse") {
      if (!controls) {
        revealControls();
        touchRevealedRef.current = true;
      } else {
        touchRevealedRef.current = false;
      }
    }

    if (mode !== "vod") return;
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
          clearStallTimer();
          setStatus("playing");
          revealControls();
        }}
        onPause={() => {
          setStatus("paused");
          setControls(true);
        }}
        onWaiting={() => {
          if (status === "error" || status === "switching") return;
          // Live HLS with 1 s segments hits `waiting` for a few hundred ms
          // routinely. Only cover the picture once the stall is real.
          const video = videoRef.current;
          const alreadyPlaying = Boolean(video && video.currentTime > 0.5);
          clearStallTimer();
          stallTimerRef.current = setTimeout(
            () => setStatus("loading"),
            alreadyPlaying ? 1200 : 250,
          );
        }}
        onPlaying={() => {
          clearStallTimer();
          setStatus("playing");
        }}
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
          if (panel) {
            setPanel(null);
            return;
          }
          // The tap that brought the controls back must not also pause.
          if (touchRevealedRef.current) {
            touchRevealedRef.current = false;
            return;
          }
          togglePlay();
        }}
        onDoubleClick={() => void toggleFullscreen()}
      />

      <div className="player-shade" aria-hidden />

      {(status === "loading" || status === "switching") && (
        <div className="player-center player-starting" role="status" aria-live="polite">
          <div className="spinner" />
          <p className="player-starting-title">
            {playedRef.current
              ? "Recuperando la reproducción…"
              : live
                ? delay.originS != null
                  ? `Conectando · el origen va ~${Math.round(delay.originS)} s detrás`
                  : "Conectando con la señal…"
                : `Abriendo ${source?.label ?? "la fuente"}`}
          </p>
          <p className="player-hint">
            {sources.length > 1 ? `Fuente ${sourceIndex + 1} de ${sources.length} · ` : ""}
            {elapsedS} s
            {!playedRef.current && sources.length - failed.length > 1 && elapsedS * 1000 < startBudgetMs
              ? ` · si no arranca, pasa a otra en ${Math.max(0, Math.ceil(startBudgetMs / 1000) - elapsedS)} s`
              : ""}
          </p>
          {status === "switching" && error && <p className="player-hint">{error}. Probando la siguiente.</p>}
          {source?.p2p && !playedRef.current && elapsedS >= 3 && (
            <p className="player-hint player-p2p-note">Las fuentes P2P tardan más la primera vez: buscan a quién descargarle.</p>
          )}
          {sources.length > 1 && elapsedS * 1000 >= OFFER_SKIP_MS && (
            <button
              type="button"
              className="btn btn-ghost btn-sm player-skip"
              onClick={() => failover.current("La salteaste")}
            >
              Probar otra fuente
            </button>
          )}
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
            <h3>{live ? "Se cortó la señal" : sources.length > 1 ? "Ninguna fuente arrancó" : "Esta fuente no arrancó"}</h3>
            <p>
              {live
                ? (error ?? "No se pudo reproducir esta fuente.")
                : sources.length > 1
                  ? `Se probaron las ${sources.length}. Suele pasar cuando nadie está compartiendo esas copias en este momento.`
                  : (error ?? "No se pudo reproducir esta fuente.")}
            </p>
            <div className="player-error-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  failedRef.current = [];
                  setFailed([]);
                  setError(null);
                  if (sourceIndex === 0) setRetryNonce((value) => value + 1);
                  else setSourceIndex(0);
                }}
              >
                <IconRefresh size={16} /> {sources.length > 1 ? "Probar todas de nuevo" : "Reintentar"}
              </button>
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
          {live && delayChip ? (
            <span className="latency-chip" title={delayDetail ?? undefined}>
              {delayChip}
            </span>
          ) : null}
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

          {live && delayDetail ? <span className="edge-chip">{delayDetail}</span> : null}

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
                  <span>{item.label}</span>
                  <small>
                    {failed.includes(index)
                      ? "No arrancó"
                      : index === sourceIndex
                        ? "En pantalla"
                        : live && item.edgeAgeS != null
                          ? `${Math.round(item.edgeAgeS)} s de delay`
                          : item.p2p
                            ? "P2P"
                            : ""}
                  </small>
                </button>
              ))}
            </div>
            <p className="panel-note">Si la fuente en pantalla no arranca o se corta, Fubol pasa sola a la siguiente.</p>
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
                  <span>{track.label}</span>
                  {track.forced && <small>Solo carteles y diálogos en otro idioma</small>}
                </button>
              ))}
            </div>

            {activeSub && (
              <>
                <p className="sync-status">{describeSync(syncMethod, measuring, offsetMs)}</p>
                <div className="offset-row" role="group" aria-label="Corregir el tiempo del subtítulo">
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => nudgeOffset(-1000)} aria-label="Subtítulos 1 segundo antes">
                    −1 s
                  </button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => nudgeOffset(-100)} aria-label="Subtítulos una décima antes">
                    −0,1
                  </button>
                  <span className="offset-value" aria-live="polite">
                    {offsetMs > 0 ? "+" : offsetMs < 0 ? "−" : ""}
                    {(Math.abs(offsetMs) / 1000).toFixed(1).replace(".", ",")} s
                  </span>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => nudgeOffset(100)} aria-label="Subtítulos una décima después">
                    +0,1
                  </button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => nudgeOffset(1000)} aria-label="Subtítulos 1 segundo después">
                    +1 s
                  </button>
                </div>
                <p className="panel-note">
                  Si el texto aparece antes de que hablen, tocá <strong>+</strong>; si aparece tarde, <strong>−</strong>.
                  El ajuste queda guardado para esta copia en todos los dispositivos.
                </p>
                {syncMethod === "manual" && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={backToAutomatic}>
                    <IconSpark size={15} /> Volver al ajuste automático
                  </button>
                )}
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
    {belowPlayer}
    {mode === "vod" && <div className="learning-wrapper">
      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={learningOpen} onClick={() => setLearningOpen((open) => !open)}>
        {learningOpen ? "Cerrar práctica de inglés" : "Practicar inglés con esta película"}
      </button>
      {learningOpen && <LearningPanel title={title ?? "Untitled"} storageKey={storageKey} subtitles={subtitles} current={current} activeSubtitleId={activeSub} activeSubtitleOffsetMs={offsetMs} video={videoRef.current} />}
    </div>}
    </>
  );
}
