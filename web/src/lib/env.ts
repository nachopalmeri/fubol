import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Everything mutable lives outside the build tree. */
export const dataDir = path.resolve(
  /*turbopackIgnore: true*/
  process.env.FUBOL_DATA_DIR ?? path.join(process.cwd(), "data"),
);

export function subdir(name: string): string {
  const dir = path.join(dataDir, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureDataDir(): void {
  fs.mkdirSync(dataDir, { recursive: true });
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
    return process.env.TZ?.trim() || "America/Argentina/Buenos_Aires";
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
  fs.writeFileSync(file, generated, { mode: 0o600 });
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
  fs.writeFileSync(file, generated + "\n", { mode: 0o600 });
  return generated;
}
