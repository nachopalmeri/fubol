interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Fixed-window limiter. Good enough for a family deployment. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (buckets.size > 5000) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
  failures.clear();
}

interface FailureEntry {
  count: number;
  lockedUntil: number;
}

const failures = new Map<string, FailureEntry>();

/**
 * Progressive lockout for credential checks. A flat 10-per-minute limit still
 * allowed roughly fourteen thousand password guesses a day, which is fine on a
 * LAN and not fine the moment the app is reachable from outside. Each failure
 * past the third doubles the wait, up to fifteen minutes.
 */
export function lockoutRemainingMs(key: string, now = Date.now()): number {
  const entry = failures.get(key);
  if (!entry) return 0;
  if (entry.lockedUntil <= now) return 0;
  return entry.lockedUntil - now;
}

export function noteAuthFailure(key: string, now = Date.now()): number {
  if (failures.size > 2000) failures.clear();
  const entry = failures.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  const over = entry.count - 3;
  entry.lockedUntil = over > 0 ? now + Math.min(15 * 60_000, 2_000 * 2 ** (over - 1)) : 0;
  failures.set(key, entry);
  return Math.max(0, entry.lockedUntil - now);
}

export function noteAuthSuccess(key: string): void {
  failures.delete(key);
}
