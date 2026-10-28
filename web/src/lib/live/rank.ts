import type { ProbeResult } from "./types";

export interface HealthEntry {
  fails: number;
  lastFailAt: number;
}

const health = new Map<string, HealthEntry>();

export function noteFailure(url: string): void {
  const entry = health.get(url) ?? { fails: 0, lastFailAt: 0 };
  entry.fails += 1;
  entry.lastFailAt = Date.now();
  health.set(url, entry);
  if (health.size > 500) health.clear();
}

export function noteSuccess(url: string): void {
  const entry = health.get(url);
  if (entry) {
    entry.fails = Math.max(0, entry.fails - 1);
    if (entry.fails === 0) health.delete(url);
  }
}

export function failureCount(url: string): number {
  const entry = health.get(url);
  if (!entry) return 0;
  // Decay over 10 minutes so a bad night does not punish a source forever.
  const age = Date.now() - entry.lastFailAt;
  if (age > 10 * 60_000) {
    health.delete(url);
    return 0;
  }
  return entry.fails;
}

export interface ScorableProbe {
  ok: boolean;
  ttfbMs: number;
  edgeAgeS: number | null;
  height: number | null;
  live: boolean;
  kind: ProbeResult["kind"];
}

/**
 * Higher is better. Latency (TTFB) and edge age dominate, then quality.
 * A dead source never wins; a verified 1080p source with a good edge beats a
 * 4K source that is 40 seconds behind.
 */
export function scoreProbe(probe: ScorableProbe, failures = 0): number {
  if (!probe.ok) return 0;
  let score = 55;
  score -= Math.min(18, probe.ttfbMs / 60);
  if (probe.edgeAgeS !== null) score -= Math.min(25, probe.edgeAgeS / 4);
  else if (probe.live) score -= 6;
  if (probe.height) {
    if (probe.height >= 1080) score += 18;
    else if (probe.height >= 720) score += 12;
    else if (probe.height >= 480) score += 6;
  }
  if (probe.live) score += 7;
  score -= Math.min(25, failures * 8);
  return Math.max(1, Math.min(100, Math.round(score)));
}

export function rankProbes<T extends { probe: { score: number } }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.probe.score - a.probe.score);
}

/** Edge age minus a target of two segments; used to explain the score. */
export function latencyLabel(edgeAgeS: number | null): string {
  if (edgeAgeS === null) return "latencia desconocida";
  if (edgeAgeS < 6) return `~${Math.round(edgeAgeS)} s de delay`;
  return `~${Math.round(edgeAgeS)} s detrás del vivo`;
}
