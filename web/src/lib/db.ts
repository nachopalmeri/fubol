import path from "node:path";
import { dataDir, ensureDataDir } from "./env";
import { normalizeState, type StateDoc } from "./state/types";

/**
 * SQLite persistence for a long-running host (the family server / Docker).
 *
 * The mutable state is one JSON document, so the schema is one row: that keeps
 * reads and writes trivial, makes the same code path work for the Blob backend
 * used on serverless, and removes the WAL churn the old per-query tables had.
 * The old tables are read once, on the first boot after upgrading, and their
 * contents become the document.
 */
type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...params: (string | number | null)[]): unknown;
    all(...params: (string | number | null)[]): unknown[];
    run(...params: (string | number | null)[]): { changes: number | bigint };
  };
  close(): void;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS state_doc (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS share_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT 'live,vod',
  pin_hash TEXT,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE TABLE IF NOT EXISTS live_sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS addons (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  name TEXT,
  kind TEXT NOT NULL DEFAULT 'vod',
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const globalForDb = globalThis as unknown as { __fubolDb?: Promise<SqliteDb> };

function open(): Promise<SqliteDb> {
  if (!globalForDb.__fubolDb) {
    globalForDb.__fubolDb = (async () => {
      ensureDataDir();
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(path.join(dataDir, "fubol.sqlite")) as unknown as SqliteDb;
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA synchronous = NORMAL;");
      db.exec("PRAGMA busy_timeout = 5000;");
      db.exec(SCHEMA);
      return db;
    })().catch((error) => {
      globalForDb.__fubolDb = undefined;
      throw error;
    });
  }
  return globalForDb.__fubolDb;
}

interface LegacyLink {
  id: number;
  code: string;
  label: string;
  permissions: string;
  pin_hash: string | null;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
  last_seen_at: number | null;
}

interface LegacySource {
  id: string;
  kind: string;
  name: string;
  url: string;
  config: string;
  enabled: number;
  priority: number;
  created_at: number;
  updated_at: number;
}

interface LegacyAddon {
  id: string;
  url: string;
  name: string | null;
  kind: string;
  enabled: number;
  config: string;
  created_at: number;
}

function parseConfig(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function migrateLegacy(db: SqliteDb): Promise<StateDoc | null> {
  try {
    const links = db.prepare("SELECT * FROM share_links ORDER BY id ASC").all() as LegacyLink[];
    const sources = db.prepare("SELECT * FROM live_sources ORDER BY created_at ASC").all() as LegacySource[];
    const addons = db.prepare("SELECT * FROM addons ORDER BY created_at ASC").all() as LegacyAddon[];
    const settings = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    if (links.length + sources.length + addons.length + settings.length === 0) return null;
    return normalizeState({
      version: 1,
      nextLinkId: links.reduce((max, link) => Math.max(max, Number(link.id) || 0), 0) + 1,
      links: links.map((link) => ({
        id: Number(link.id),
        code: link.code,
        label: link.label,
        permissions: link.permissions,
        pinHash: link.pin_hash,
        expiresAt: link.expires_at,
        revokedAt: link.revoked_at,
        createdAt: link.created_at,
        lastSeenAt: link.last_seen_at,
      })),
      sources: sources.map((source) => ({
        id: source.id,
        kind: source.kind,
        name: source.name,
        url: source.url,
        config: parseConfig(source.config),
        enabled: source.enabled === 1,
        priority: source.priority,
        createdAt: source.created_at,
        updatedAt: source.updated_at,
      })),
      addons: addons.map((addon) => ({
        id: addon.id,
        url: addon.url,
        name: addon.name ?? addon.url,
        kind: addon.kind,
        enabled: addon.enabled === 1,
        createdAt: addon.created_at,
      })),
      settings: Object.fromEntries(settings.map((row) => [row.key, row.value])),
    });
  } catch {
    return null;
  }
}

export async function readSqliteState(): Promise<{ doc: StateDoc | null; version: string | null }> {
  const db = await open();
  const row = db.prepare("SELECT value, updated_at FROM state_doc WHERE id = 1").get() as
    | { value: string; updated_at: number }
    | undefined;
  if (row) {
    try {
      return { doc: normalizeState(JSON.parse(row.value)), version: String(row.updated_at) };
    } catch {
      // A corrupt document must not brick the app: fall back to the legacy
      // tables (or an empty state) instead of throwing on every request.
      return { doc: await migrateLegacy(db), version: null };
    }
  }
  const migrated = await migrateLegacy(db);
  if (migrated) {
    await writeSqliteState(migrated);
    return { doc: migrated, version: String(Date.now()) };
  }
  return { doc: null, version: null };
}

export async function writeSqliteState(doc: StateDoc): Promise<string> {
  const db = await open();
  const now = Date.now();
  db.prepare(
    "INSERT INTO state_doc(id, value, updated_at) VALUES(1, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).run(JSON.stringify(doc), now);
  return String(now);
}
