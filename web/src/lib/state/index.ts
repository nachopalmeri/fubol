import { readSqliteState, writeSqliteState } from "../db";
import { blobStorageEnabled, isPreconditionFailure, readBlobState, writeBlobState } from "./blob";
import { DEFAULT_ADDONS, DEFAULT_SOURCES } from "./defaults";
import { emptyState, type StateDoc } from "./types";

/**
 * Single entry point for the app's mutable state.
 *
 * Reads are memoized for a couple of seconds per instance, which is the whole
 * cost of the Blob backend in the request path. Writes are small, rare (an
 * admin action) and go through `mutateState`, which re-applies the change on a
 * fresh copy if another instance won the race.
 */
const MEMO_MS = Number(
  process.env.FUBOL_STATE_TTL_MS ?? (blobStorageEnabled() ? 4_000 : 1_000),
) || 1_000;

let memo: { doc: StateDoc; version: string | null; at: number } | null = null;
let seeding: Promise<StateDoc> | null = null;

export type StorageMode = "blob" | "sqlite";

export function storageMode(): StorageMode {
  return blobStorageEnabled() ? "blob" : "sqlite";
}

export function storageInfo(): { mode: StorageMode; persistent: boolean; memoMs: number } {
  return { mode: storageMode(), persistent: true, memoMs: MEMO_MS };
}

/** Forget the local copy: the next read goes to the backend. */
export function invalidateState(): void {
  memo = null;
}

export function initialState(now = Date.now()): StateDoc {
  const doc = emptyState();
  if (process.env.FUBOL_NO_DEFAULT_ADDONS !== "1") {
    doc.addons = DEFAULT_ADDONS.map((addon) => ({ ...addon, enabled: true, createdAt: now }));
  }
  if (process.env.FUBOL_NO_DEFAULT_SOURCES !== "1") {
    doc.sources = DEFAULT_SOURCES.map((source) => ({
      ...source,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    }));
  }
  return doc;
}

async function readBackend(): Promise<{ doc: StateDoc | null; version: string | null }> {
  return blobStorageEnabled() ? readBlobState() : readSqliteState();
}

async function writeBackend(doc: StateDoc, version: string | null): Promise<string> {
  if (blobStorageEnabled()) return writeBlobState(doc, version);
  return writeSqliteState(doc);
}

async function seed(version: string | null): Promise<StateDoc> {
  if (seeding) return seeding;
  seeding = (async () => {
    const doc = initialState();
    try {
      const written = await writeBackend(doc, version);
      memo = { doc, version: written, at: Date.now() };
      return doc;
    } catch {
      // Another instance seeded first: take its document.
      const fresh = await readBackend();
      if (fresh.doc) {
        memo = { doc: fresh.doc, version: fresh.version, at: Date.now() };
        return fresh.doc;
      }
      // Read-only backend (no credentials): serve the defaults for this
      // request instead of failing every page.
      memo = { doc, version: null, at: Date.now() };
      return doc;
    } finally {
      seeding = null;
    }
  })();
  return seeding;
}

export async function readState(force = false): Promise<StateDoc> {
  if (!force && memo && Date.now() - memo.at < MEMO_MS) return structuredClone(memo.doc);
  const { doc, version } = await readBackend();
  if (!doc) return structuredClone(await seed(version));
  memo = { doc, version, at: Date.now() };
  return structuredClone(doc);
}

/**
 * Apply `fn` to the state and persist it. The callback may be async (it can
 * inspect the channel cache, for example) and its return value is passed back.
 */
export async function mutateState<T>(fn: (doc: StateDoc) => T | Promise<T>): Promise<T> {
  const attempts = blobStorageEnabled() ? 5 : 2;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const current = await readState(attempt > 0);
    const next = structuredClone(current);
    const result = await fn(next);
    next.version = 1;
    try {
      const version = await writeBackend(next, memo?.version ?? null);
      memo = { doc: next, version, at: Date.now() };
      return result;
    } catch (error) {
      lastError = error;
      if (!isPreconditionFailure(error)) throw error;
      memo = null;
      // Small stagger so two racing instances stop colliding.
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No se pudo guardar el estado");
}
