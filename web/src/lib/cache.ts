/**
 * In-process TTL cache.
 *
 * It used to live in SQLite so a container restart kept the warmed catalog. A
 * serverless function has no shared disk, and the database write was one of the
 * hottest paths in the app, so it is memory only now: a cold instance warms
 * itself from `instrumentation.ts`, and the stale windows already in the
 * callers absorb the rest. Values are JSON-cloned so a caller cannot mutate
 * another request's copy.
 */
interface Entry {
  value: unknown;
  expiresAt: number;
}

const MAX_ENTRIES = 400;
const store = new Map<string, Entry>();

function evict(): void {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
  // Map keeps insertion order: drop the oldest entries until under the cap.
  for (const key of store.keys()) {
    if (store.size <= MAX_ENTRIES) break;
    store.delete(key);
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return structuredClone(entry.value) as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { value: structuredClone(value), expiresAt: Date.now() + ttlMs });
  evict();
}

export function cacheDelete(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function cacheSize(): number {
  return store.size;
}
