import type { EdgeTrust } from "./playlist";
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
  edgeTrust?: EdgeTrust;
  height: number | null;
  live: boolean;
  kind: ProbeResult["kind"];
}

/**
 * Neutral prior for a live source whose delay cannot be read. Most IPTV
 * re-streams ship no PROGRAM-DATE-TIME, so "unknown" has to be scored as a
 * typical source rather than as either a free pass or a death sentence:
 * otherwise the ranking systematically prefers whichever origin tells us the
 * least. Measured in seconds behind the wall clock.
 */
export const ASSUMED_EDGE_AGE_S = 20;

/** An untrusted reading is worth slightly less than a real one at a tie. */
const UNKNOWN_EDGE_PENALTY = 3;

export function usableEdgeAge(probe: Pick<ScorableProbe, "edgeAgeS" | "edgeTrust">): number | null {
  if (probe.edgeAgeS === null) return null;
  const trust = probe.edgeTrust ?? "measured";
  return trust === "measured" || trust === "extrapolated" ? probe.edgeAgeS : null;
}

/**
 * Higher is better. Delay behind the live edge dominates, then connect time,
 * then resolution. A dead source never wins. Resolution can no longer buy its
 * way past a slow edge: the project's goal is the lowest delay that still
 * plays, so 1080p is worth less than ten seconds of catch-up.
 */
export function scoreProbe(probe: ScorableProbe, failures = 0): number {
  if (!probe.ok) return 0;
  let score = 60;
  score -= Math.min(12, probe.ttfbMs / 80);

  const edge = usableEdgeAge(probe);
  score -= Math.min(45, (edge ?? ASSUMED_EDGE_AGE_S) * 1.2);
  if (edge === null && probe.live) score -= UNKNOWN_EDGE_PENALTY;

  if (probe.height) {
    if (probe.height >= 1080) score += 12;
    else if (probe.height >= 720) score += 8;
    else if (probe.height >= 480) score += 4;
  }
  if (probe.live) score += 6;
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

/**
 * What the UI is allowed to claim about a source's delay. The wording changes
 * with the trust level so the family never reads a number the data cannot
 * support — the previous version printed "0 s" for a clock-skewed origin.
 */
export function edgeTrustLabel(edgeAgeS: number | null, trust: EdgeTrust | undefined): string {
  switch (trust) {
    case "measured":
      return edgeAgeS === null ? "sin medir" : `${Math.round(edgeAgeS)} s del borde`;
    case "extrapolated":
      return edgeAgeS === null ? "sin medir" : `~${Math.round(edgeAgeS)} s del borde (estimado)`;
    case "implausible":
      return "el origen informa un reloj imposible";
    default:
      return "el origen no informa delay";
  }
}

/** True when the number may be shown to a non-technical viewer as a delay. */
export function edgeIsShowable(trust: EdgeTrust | undefined): boolean {
  return trust === "measured" || trust === "extrapolated";
}
