import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { shortHash } from "../crypto";
import { dataDir } from "../env";
import { logger } from "../logger";

export const RELAY_IDLE_MS = 90_000;
export const RELAY_MAX_JOBS = 4;
const RELAY_FILE = /^(index\.m3u8|init\.mp4|seg\d{5}\.m4s)$/;
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

export function relayOutputDir(key: string): string {
  return path.join(dataDir, "relay", key);
}

export function buildRelayArgs(input: {
  url: string;
  dir: string;
  height: number;
  headers?: Record<string, string>;
}): string[] {
  const height = relayHeight(input.height);
  const bitrate = height >= 1080 ? 4500 : height >= 720 ? 2200 : 1200;
  const maxrate = Math.round(bitrate * 1.15);
  const bufsize = bitrate * 2;
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
    "-tune",
    "zerolatency",
    "-g",
    "30",
    "-keyint_min",
    "30",
    "-sc_threshold",
    "0",
    "-force_key_frames",
    "expr:gte(t,n_forced*1)",
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
    "1",
    "-hls_list_size",
    "5",
    "-hls_delete_threshold",
    "6",
    "-hls_segment_type",
    "fmp4",
    "-hls_fmp4_init_filename",
    "init.mp4",
    "-hls_segment_filename",
    path.join(input.dir, "seg%05d.m4s"),
    "-hls_flags",
    "delete_segments+append_list+independent_segments+omit_endlist+temp_file",
    path.join(input.dir, "index.m3u8"),
  ];
}

interface RelayJob {
  key: string;
  dir: string;
  child: ChildProcess;
  lastAccess: number;
  startedAt: number;
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

function sweep(): void {
  const now = Date.now();
  for (const job of store.jobs.values()) {
    if (now - job.lastAccess > RELAY_IDLE_MS) stop(job, true);
  }
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
    if (idle && Date.now() - idle.lastAccess > 15_000) stop(idle, true);
    else return { ok: false, status: 503, error: "El relay está ocupado. Cerrá otra señal e intentá de nuevo." };
  }

  const dir = relayOutputDir(input.key);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return { ok: false, status: 500, error: "No se pudo preparar el relay." };
  }

  let child: ChildProcess;
  try {
    child = spawn(process.env.FFMPEG_PATH?.trim() || "ffmpeg", buildRelayArgs({
      url: input.url,
      dir,
      height: input.height,
      headers: input.headers,
    }), { stdio: ["ignore", "ignore", "ignore"], windowsHide: true });
  } catch {
    return { ok: false, status: 503, error: "El servidor no tiene ffmpeg disponible." };
  }

  const job: RelayJob = { key: input.key, dir, child, lastAccess: Date.now(), startedAt: Date.now() };
  store.jobs.set(input.key, job);
  child.on("error", () => {
    store.jobs.delete(input.key);
    logger.warn("relay_spawn_error", { key: input.key });
  });
  child.on("exit", (code) => {
    if (store.jobs.get(input.key) === job) store.jobs.delete(input.key);
    logger.info("relay_exit", { key: input.key, code, uptimeMs: Date.now() - job.startedAt });
  });
  return { ok: true, key: input.key, dir };
}

export function touchRelay(key: string): void {
  const job = store.jobs.get(key);
  if (job) job.lastAccess = Date.now();
}

export function relayRunning(key: string): boolean {
  return store.jobs.has(key);
}

export async function waitForRelayFile(dir: string, name: string, timeoutMs: number): Promise<string | null> {
  const file = path.join(dir, name);
  const deadline = Date.now() + timeoutMs;
  // ffmpeg's temp_file flag makes segments atomic, but the playlist is still
  // rewritten in place. Only serve a file once its size has stopped changing.
  const stableMs = name.endsWith(".m3u8") ? 150 : 100;
  let lastSize = -1;
  let stableSince = 0;
  while (Date.now() < deadline) {
    try {
      const stat = fs.statSync(file);
      if (stat.isFile() && stat.size > 0) {
        if (stat.size === lastSize) {
          if (Date.now() - stableSince >= stableMs) return file;
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
  return null;
}
