import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { shortHash } from "../crypto";
import { dataDir } from "../env";
import { logger } from "../logger";

export const RELAY_IDLE_MS = 90_000;

/**
 * Concurrent ffmpeg jobs. Four was too few for a household: a fifth device got
 * a flat 503 and a viewer who paused for twenty seconds had their job evicted.
 */
export const RELAY_MAX_JOBS = Math.max(1, Number(process.env.FUBOL_RELAY_MAX_JOBS) || 6);

/** Segment length in seconds. Short segments keep the client close to the edge. */
export const RELAY_SEGMENT_S = 1;

/**
 * Segments kept in the playlist. The old value of five gave the browser a
 * five-second window: any rebuffer longer than that asked for a segment that
 * had already been deleted, which hls.js reports as a fatal fragment error.
 * Twenty seconds matches what real origins publish.
 */
export const RELAY_LIST_SIZE = 20;

/** Extra segments kept on disk for clients that fell behind the playlist. */
const RELAY_DELETE_THRESHOLD = 24;

/** Restart budget for an ffmpeg that keeps dying on a broken origin. */
const RELAY_MAX_RESTARTS = 8;
const RELAY_RESTART_BASE_MS = 750;

const RELAY_FILE = /^(index\.m3u8|init\.mp4|seg\d{5,7}\.m4s)$/;
const ALLOWED_HEIGHTS = [480, 720, 1080];

export function relayFileName(file: string | undefined): string | null {
  const name = file ?? "index.m3u8";
  return RELAY_FILE.test(name) ? name : null;
}

export function relayContentType(name: string): string {
  if (name.endsWith(".m3u8")) return "application/vnd.apple.mpegurl; charset=utf-8";
  return "video/mp4";
}

export function relayHeight(value: string | number | undefined): number {
  const parsed = Number(value);
  return ALLOWED_HEIGHTS.includes(parsed) ? parsed : 720;
}

/**
 * Relay segments are written once per second and read immediately. On Windows
 * the default data directory is a Docker bind mount through WSL2, the slowest
 * filesystem available, right in the latency-critical path. Point
 * FUBOL_RELAY_DIR at a tmpfs or a native volume to take it off that mount.
 */
export function relayRoot(): string {
  return process.env.FUBOL_RELAY_DIR?.trim() || path.join(dataDir, "relay");
}

export function relayOutputDir(key: string): string {
  return path.join(relayRoot(), key);
}

/**
 * Next segment number for a restarting job. ffmpeg restarts its counter at
 * zero by default, so a client holding a playlist at sequence 63 would see the
 * timeline jump backwards and stall. Continuing the numbering keeps the
 * playlist monotonic across an ffmpeg crash.
 */
export function nextStartNumber(dir: string): number {
  let highest = -1;
  try {
    for (const name of fs.readdirSync(dir)) {
      const match = /^seg(\d{5,7})\.m4s$/.exec(name);
      if (!match?.[1]) continue;
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > highest) highest = value;
    }
  } catch {
    // Fresh directory.
  }
  return highest + 1;
}

export function buildRelayArgs(input: {
  url: string;
  dir: string;
  height: number;
  headers?: Record<string, string>;
  /** First segment number, so a restart continues the existing timeline. */
  startNumber?: number;
}): string[] {
  const height = relayHeight(input.height);
  const bitrate = height >= 1080 ? 4500 : height >= 720 ? 2200 : 1200;
  const maxrate = Math.round(bitrate * 1.15);
  // One second of headroom instead of two: the old bufsize let x264 burst to
  // more than four megabits on a 2.2 Mbit target, which produced segments
  // between 43 KB and 532 KB and confused the browser's bitrate estimate.
  const bufsize = Math.round(bitrate * 1.25);
  const gop = RELAY_SEGMENT_S * 50;
  const headerLines = Object.entries(input.headers ?? {})
    .filter(([name, value]) => name && value && /^[\w-]+$/.test(name) && !/[\r\n]/.test(value))
    .map(([name, value]) => `${name}: ${value}`)
    .join("\r\n");
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-fflags",
    "+genpts",
    ...(headerLines ? ["-headers", `${headerLines}\r\n`] : []),
    "-i",
    input.url,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
    "-vf",
    `scale=-2:${height}`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    // `-tune zerolatency` disabled lookahead and B-frames, which costs real
    // picture quality on grass and crowd detail. Forced keyframes already give
    // segment-aligned cuts, and the client buffer absorbs the small extra delay.
    "-profile:v",
    "main",
    "-g",
    String(gop),
    "-keyint_min",
    String(gop),
    "-sc_threshold",
    "0",
    "-force_key_frames",
    `expr:gte(t,n_forced*${RELAY_SEGMENT_S})`,
    "-b:v",
    `${bitrate}k`,
    "-maxrate",
    `${maxrate}k`,
    "-bufsize",
    `${bufsize}k`,
    "-threads",
    "2",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-f",
    "hls",
    "-hls_time",
    String(RELAY_SEGMENT_S),
    "-hls_list_size",
    String(RELAY_LIST_SIZE),
    "-hls_delete_threshold",
    String(RELAY_DELETE_THRESHOLD),
    "-hls_segment_type",
    "fmp4",
    "-hls_fmp4_init_filename",
    "init.mp4",
    ...(input.startNumber && input.startNumber > 0
      ? ["-start_number", String(input.startNumber)]
      : []),
    "-hls_segment_filename",
    path.join(input.dir, "seg%05d.m4s"),
    // `program_date_time` adds PDT tags the output previously lacked entirely.
    // Measured against a real origin they come out 0.4-3.2 s AHEAD of the wall
    // clock: ffmpeg derives them from the input timeline, and this origin
    // delivers its window in bursts (segment numbers advance ~1.2x real time),
    // so they are not a wall-clock reading of when the relay produced a frame.
    // They are kept for diagnostics only. `parseHlsPlaylist` classifies them as
    // `implausible` and the player refuses to show them as a delay, which is
    // why the relay path still reports "el origen no informa su delay".
    // Making them truthful would need `-use_wallclock_as_timestamps 1` on the
    // input, which on a bursty HLS source compresses a burst into real time and
    // breaks A/V pacing — a worse trade than an unmeasurable number.
    "-hls_flags",
    "delete_segments+append_list+independent_segments+omit_endlist+temp_file+program_date_time",
    path.join(input.dir, "index.m3u8"),
  ];
}

interface RelayJob {
  key: string;
  dir: string;
  child: ChildProcess;
  lastAccess: number;
  startedAt: number;
  /** Upstream identity, kept so the supervisor can respawn without the route. */
  url: string;
  height: number;
  headers?: Record<string, string>;
  /** Consecutive ffmpeg exits since the last segment was served. */
  restarts: number;
  /** Set once the job is being torn down on purpose. */
  stopping: boolean;
  restartTimer?: ReturnType<typeof setTimeout>;
}

interface RelayStore {
  jobs: Map<string, RelayJob>;
  sweep?: ReturnType<typeof setInterval>;
}

const store = (() => {
  const scope = globalThis as unknown as { __fubolRelay?: RelayStore };
  scope.__fubolRelay ??= { jobs: new Map() };
  return scope.__fubolRelay;
})();

function stop(job: RelayJob, removeDir: boolean): void {
  job.stopping = true;
  if (job.restartTimer) clearTimeout(job.restartTimer);
  store.jobs.delete(job.key);
  if (!job.child.killed) {
    try {
      job.child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
  if (removeDir) {
    setTimeout(() => {
      try {
        fs.rmSync(job.dir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    }, 1500).unref?.();
  }
}

/**
 * Removes segments the playlist can no longer reference. ffmpeg handles this
 * while it runs, but a crashed job leaves its tail behind, and restarts now
 * continue the numbering instead of wiping the directory.
 */
function pruneOrphans(dir: string, keepAfterMs: number): void {
  const cutoff = Date.now() - keepAfterMs;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!/^seg\d{5,7}\.m4s(\.tmp)?$/.test(name)) continue;
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true });
      } catch {
        // raced with ffmpeg
      }
    }
  } catch {
    // directory gone
  }
}

function sweep(): void {
  const now = Date.now();
  for (const job of store.jobs.values()) {
    if (now - job.lastAccess > RELAY_IDLE_MS) stop(job, true);
    else pruneOrphans(job.dir, (RELAY_LIST_SIZE + RELAY_DELETE_THRESHOLD) * RELAY_SEGMENT_S * 1000 * 3);
  }
}

function spawnFfmpeg(job: RelayJob): ChildProcess {
  const startNumber = nextStartNumber(job.dir);
  const child = spawn(
    // The binary name is resolved at runtime from the environment, which
    // Turbopack would otherwise treat as dynamic filesystem access and trace
    // the whole project for — the same escape env.ts already uses for dataDir.
    /*turbopackIgnore: true*/
    process.env.FFMPEG_PATH?.trim() || "ffmpeg",
    buildRelayArgs({
      url: job.url,
      dir: job.dir,
      height: job.height,
      headers: job.headers,
      startNumber,
    }),
    { stdio: ["ignore", "ignore", "ignore"], windowsHide: true },
  );
  child.on("error", () => {
    logger.warn("relay_spawn_error", { key: job.key });
    if (store.jobs.get(job.key) === job) scheduleRestart(job, "spawn_error");
  });
  child.on("exit", (code) => {
    logger.info("relay_exit", {
      key: job.key,
      code,
      uptimeMs: Date.now() - job.startedAt,
      restarts: job.restarts,
    });
    if (store.jobs.get(job.key) !== job || job.stopping) return;
    scheduleRestart(job, `exit_${code ?? "null"}`);
  });
  return child;
}

/**
 * ffmpeg exits whenever the upstream re-stream drops its connection, which the
 * logs showed happening after as little as eleven seconds. Previously the job
 * was simply dropped and only respawned when the browser asked for the next
 * segment — by which point the directory had been wiped and the playlist
 * restarted at sequence zero. Restarting here, in place, keeps the timeline.
 */
function scheduleRestart(job: RelayJob, reason: string): void {
  if (job.stopping) return;
  if (Date.now() - job.lastAccess > RELAY_IDLE_MS) {
    stop(job, true);
    return;
  }
  if (job.restarts >= RELAY_MAX_RESTARTS) {
    logger.warn("relay_gave_up", { key: job.key, reason, restarts: job.restarts });
    stop(job, true);
    return;
  }
  job.restarts += 1;
  const delay = Math.min(8_000, RELAY_RESTART_BASE_MS * 2 ** (job.restarts - 1));
  logger.info("relay_restart", { key: job.key, reason, attempt: job.restarts, delayMs: delay });
  job.restartTimer = setTimeout(() => {
    if (job.stopping || store.jobs.get(job.key) !== job) return;
    job.startedAt = Date.now();
    job.child = spawnFfmpeg(job);
  }, delay);
  job.restartTimer.unref?.();
}

function startSweep(): void {
  if (store.sweep) return;
  const timer = setInterval(sweep, 15_000);
  timer.unref?.();
  store.sweep = timer;
}

export function relayKey(url: string, headers: Record<string, string> | undefined, height: number): string {
  return shortHash(`${url}|${JSON.stringify(headers ?? {})}|${relayHeight(height)}`, 24);
}

/**
 * The relay spawns a long-lived ffmpeg that writes segments to disk and serves
 * them to later requests. A serverless function has neither a shared disk nor a
 * process that outlives the response, so it is simply not available there;
 * callers fall back to proxying the origin directly.
 */
export function relayAvailable(): boolean {
  if (process.env.FUBOL_RELAY === "0") return false;
  if (process.env.FUBOL_RELAY === "1") return true;
  return !process.env.VERCEL;
}

export type RelayStart =
  | { ok: true; key: string; dir: string }
  | { ok: false; status: number; error: string };

export function ensureRelay(input: {
  key: string;
  url: string;
  height: number;
  headers?: Record<string, string>;
}): RelayStart {
  startSweep();
  const existing = store.jobs.get(input.key);
  if (existing) {
    existing.lastAccess = Date.now();
    return { ok: true, key: input.key, dir: existing.dir };
  }
  if (store.jobs.size >= RELAY_MAX_JOBS) {
    const idle = [...store.jobs.values()].sort((a, b) => a.lastAccess - b.lastAccess)[0];
    // A viewer who pauses is still a viewer: only evict a job nobody has
    // touched for most of the idle window, never one that paused for a moment.
    if (idle && Date.now() - idle.lastAccess > RELAY_IDLE_MS / 2) stop(idle, true);
    else {
      return {
        ok: false,
        status: 503,
        error: `Hay ${RELAY_MAX_JOBS} señales abiertas al mismo tiempo. Cerrá una pestaña e intentá de nuevo.`,
      };
    }
  }

  const dir = relayOutputDir(input.key);
  try {
    // The directory is deliberately not wiped: a client may still be reading
    // segments from the previous ffmpeg run, and `nextStartNumber` needs the
    // existing files to continue the sequence instead of restarting at zero.
    fs.mkdirSync(dir, { recursive: true });
    pruneOrphans(dir, RELAY_IDLE_MS);
  } catch {
    return { ok: false, status: 500, error: "No se pudo preparar el relay." };
  }

  const job: RelayJob = {
    key: input.key,
    dir,
    child: undefined as unknown as ChildProcess,
    lastAccess: Date.now(),
    startedAt: Date.now(),
    url: input.url,
    height: input.height,
    headers: input.headers,
    restarts: 0,
    stopping: false,
  };
  store.jobs.set(input.key, job);
  try {
    job.child = spawnFfmpeg(job);
  } catch {
    store.jobs.delete(input.key);
    return { ok: false, status: 503, error: "El servidor no tiene ffmpeg disponible." };
  }
  return { ok: true, key: input.key, dir };
}

export function touchRelay(key: string): void {
  const job = store.jobs.get(key);
  if (job) job.lastAccess = Date.now();
}

/** A served segment means the pipeline recovered: forgive the restart budget. */
export function noteRelayProgress(key: string): void {
  const job = store.jobs.get(key);
  if (job && job.restarts > 0 && Date.now() - job.startedAt > 10_000) job.restarts = 0;
}

export function relayRunning(key: string): boolean {
  return store.jobs.has(key);
}

export interface RelayStatus {
  key: string;
  uptimeMs: number;
  idleMs: number;
  restarts: number;
}

/** Live relay inventory for the admin health panel. */
export function relayStatus(): { jobs: RelayStatus[]; max: number; available: boolean } {
  const now = Date.now();
  return {
    max: RELAY_MAX_JOBS,
    available: relayAvailable(),
    jobs: [...store.jobs.values()].map((job) => ({
      key: job.key,
      uptimeMs: now - job.startedAt,
      idleMs: now - job.lastAccess,
      restarts: job.restarts,
    })),
  };
}

/**
 * Segments a fresh playlist must hold before the browser is allowed to see it.
 * ffmpeg publishes its first playlist with a single segment, so hls.js used to
 * start against a one-second window and starve immediately.
 */
export const RELAY_MIN_READY_SEGMENTS = 3;

function playlistSegmentCount(file: string): number {
  try {
    return (fs.readFileSync(file, "utf8").match(/\.m4s/g) ?? []).length;
  } catch {
    return 0;
  }
}

export async function waitForRelayFile(
  dir: string,
  name: string,
  timeoutMs: number,
  minSegments = 0,
): Promise<string | null> {
  const file = path.join(dir, name);
  const deadline = Date.now() + timeoutMs;
  // ffmpeg's temp_file flag makes segments atomic, but the playlist is still
  // rewritten in place. Only serve a file once its size has stopped changing.
  const isPlaylist = name.endsWith(".m3u8");
  const stableMs = isPlaylist ? 150 : 100;
  let lastSize = -1;
  let stableSince = 0;
  while (Date.now() < deadline) {
    try {
      const stat = fs.statSync(file);
      if (stat.isFile() && stat.size > 0) {
        if (stat.size === lastSize) {
          if (Date.now() - stableSince >= stableMs) {
            if (!isPlaylist || minSegments <= 0) return file;
            if (playlistSegmentCount(file) >= minSegments) return file;
            // Enough of a playlist to be valid, not enough to play smoothly.
            lastSize = -1;
          }
        } else {
          lastSize = stat.size;
          stableSince = Date.now();
        }
      }
    } catch {
      // not written yet
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  // Out of budget: a short playlist still beats a timeout error.
  try {
    if (fs.statSync(file).size > 0) return file;
  } catch {
    // nothing was ever written
  }
  return null;
}
