import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { dataDir, ensureDataDir } from "./env";

export type SqlRow = Record<string, string | number | bigint | null | Uint8Array>;

const globalForDb = globalThis as unknown as { __fubolDb?: DatabaseSync };

const SCHEMA = `
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

CREATE TABLE IF NOT EXISTS source_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT,
  target TEXT,
  ok INTEGER NOT NULL,
  ttfb_ms INTEGER,
  edge_age_s REAL,
  status INTEGER,
  error TEXT,
  checked_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  input TEXT,
  output TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  source_id TEXT,
  link_id TEXT,
  ok INTEGER NOT NULL DEFAULT 1,
  ms INTEGER,
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checks_source ON source_checks(source_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_links_code ON share_links(code);
`;

export function getDb(): DatabaseSync {
  if (!globalForDb.__fubolDb) {
    ensureDataDir();
    const file = path.join(dataDir, "fubol.sqlite");
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(SCHEMA);
    globalForDb.__fubolDb = db;
  }
  return globalForDb.__fubolDb;
}

export function all<T = SqlRow>(sql: string, ...params: (string | number | null)[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function get<T = SqlRow>(sql: string, ...params: (string | number | null)[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(
  sql: string,
  ...params: (string | number | null)[]
): { changes: number; lastInsertRowid: number } {
  const result = getDb().prepare(sql).run(...params);
  return {
    changes: Number(result.changes),
    lastInsertRowid: Number(result.lastInsertRowid),
  };
}

export function cacheGet<T>(key: string): T | undefined {
  const row = get<{ value: string; expires_at: number }>(
    "SELECT value, expires_at FROM cache WHERE key = ?",
    key,
  );
  if (!row) return undefined;
  if (row.expires_at < Date.now()) {
    run("DELETE FROM cache WHERE key = ?", key);
    return undefined;
  }
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return undefined;
  }
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  run(
    "INSERT INTO cache(key, value, expires_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at",
    key,
    JSON.stringify(value),
    Date.now() + ttlMs,
  );
  if (Math.random() < 0.05) {
    run("DELETE FROM cache WHERE expires_at < ?", Date.now());
  }
}

export function getSetting(key: string): string | undefined {
  return get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)?.value;
}

export function setSetting(key: string, value: string): void {
  run(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}

export function recordEvent(entry: {
  kind: string;
  sourceId?: string | null;
  linkId?: string | null;
  ok?: boolean;
  ms?: number | null;
  detail?: string | null;
}): void {
  run(
    "INSERT INTO events(kind, source_id, link_id, ok, ms, detail, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)",
    entry.kind,
    entry.sourceId ?? null,
    entry.linkId ?? null,
    entry.ok === false ? 0 : 1,
    entry.ms ?? null,
    entry.detail ?? null,
    Date.now(),
  );
  if (Math.random() < 0.02) {
    run("DELETE FROM events WHERE created_at < ?", Date.now() - 30 * 24 * 3600_000);
  }
}
