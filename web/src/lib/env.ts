import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** True on Vercel, where only `/tmp` is writable and it is per-instance. */
export const serverless = Boolean(process.env.VERCEL);

/** Everything mutable lives outside the build tree. */
export const dataDir = path.resolve(
  /*turbopackIgnore: true*/
  process.env.FUBOL_DATA_DIR ??
    (serverless ? path.join(os.tmpdir(), "fubol") : path.join(process.cwd(), "data")),
);

export function subdir(name: string): string {
  const dir = path.join(dataDir, name);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Read-only filesystem (serverless without /tmp access): callers that need
    // durable data use the state backend, not this directory.
  }
  return dir;
}

export function ensureDataDir(): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {
    // See subdir(): a filesystem error here must not take the app down.
  }
}

/**
 * Vercel (and some shells) export `TZ` in POSIX form (`:UTC`). Node's own
 * clock accepts that, but `Intl.DateTimeFormat` throws `RangeError: Invalid
 * time zone specified` — which crashed the first render of any fixture card in
 * production. Normalize once, and fall back rather than take a page down.
 */
export function safeTimeZone(raw: string | undefined, fallback = "America/Argentina/Buenos_Aires"): string {
  const value = (raw ?? "").trim().replace(/^:/, "");
  if (!value) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return fallback;
  }
}

export const env = {
  get baseUrl(): string | undefined {
    const value = process.env.FUBOL_BASE_URL?.trim();
    return value ? value.replace(/\/+$/, "") : undefined;
  },
  get adminPassword(): string | undefined {
    return process.env.FUBOL_ADMIN_PASSWORD?.trim() || undefined;
  },
  get allowPrivateSources(): boolean {
    return process.env.FUBOL_ALLOW_PRIVATE_SOURCES === "1";
  },
  get insecureCookies(): boolean {
    return process.env.FUBOL_INSECURE_COOKIES === "1";
  },
  /**
   * Whether `x-forwarded-*` may be believed. The container publishes port 3001
   * directly, so anyone on the LAN can reach the app without passing through
   * Caddy and set these headers themselves: trusting them unconditionally let
   * a client forge its own IP and walk around the login rate limit, and let a
   * poisoned Host redirect a family link somewhere else. Enable it only when
   * a reverse proxy you control is the single way in.
   */
  get trustProxyHeaders(): boolean {
    return process.env.FUBOL_TRUST_PROXY === "1";
  },
  get ffmpegPath(): string {
    return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
  },
  get ffprobePath(): string {
    return process.env.FFPROBE_PATH?.trim() || "ffprobe";
  },
  get subsyncUrl(): string | undefined {
    const value = process.env.SUBSYNC_URL?.trim();
    return value ? value.replace(/\/+$/, "") : undefined;
  },
  get openSubtitlesKey(): string | undefined {
    return process.env.OPENSUBTITLES_API_KEY?.trim() || undefined;
  },
  get defaultLocale(): string {
    return process.env.FUBOL_LOCALE?.trim() || "es-AR";
  },
  get timezone(): string {
    return safeTimeZone(process.env.TZ);
  },
};

/** HMAC secret: env wins, otherwise a generated file that survives restarts. */
export function getSecret(): string {
  const fromEnv = process.env.FUBOL_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  ensureDataDir();
  const file = path.join(dataDir, "secret.key");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    // create below
  }
  const generated = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString("hex");
  try {
    fs.writeFileSync(file, generated, { mode: 0o600 });
  } catch {
    // Ephemeral filesystem: the generated secret lives for this instance only.
    // Deployments that need stable sessions set FUBOL_SECRET instead.
  }
  return generated;
}

/** Admin password: env wins, otherwise generated once and written to disk. */
export function getAdminPassword(): string {
  const fromEnv = env.adminPassword;
  if (fromEnv) return fromEnv;

  ensureDataDir();
  const file = path.join(dataDir, "admin-password.txt");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch {
    // create below
  }
  const generated = Buffer.from(crypto.getRandomValues(new Uint8Array(12)))
    .toString("base64url")
    .replace(/[-_]/g, "")
    .slice(0, 16);
  try {
    fs.writeFileSync(file, generated + "\n", { mode: 0o600 });
  } catch {
    // Ephemeral filesystem: set FUBOL_ADMIN_PASSWORD in a real deployment.
  }
  return generated;
}
