/**
 * Runtime metrics for the admin health page.
 *
 * These are per-instance observation data, not configuration: the old SQLite
 * `source_checks` table made the admin read depend on a shared disk that a
 * serverless deployment does not have. A bounded ring is enough to answer "are
 * the sources working right now", and it cannot grow without limit.
 */
export interface CheckRecord {
  sourceId: string | null;
  target: string;
  ok: boolean;
  ttfbMs: number;
  edgeAgeS: number | null;
  edgeTrust: string;
  edgeRawS: number | null;
  status: number | null;
  error: string | null;
  checkedAt: number;
}

const MAX_CHECKS = 400;
const checks: CheckRecord[] = [];

export function recordCheck(check: CheckRecord): void {
  checks.push(check);
  if (checks.length > MAX_CHECKS) checks.splice(0, checks.length - MAX_CHECKS);
}

export function recentChecks(sinceMs: number): CheckRecord[] {
  const since = Date.now() - sinceMs;
  return checks.filter((check) => check.checkedAt > since);
}

export function clearChecks(): void {
  checks.length = 0;
}
