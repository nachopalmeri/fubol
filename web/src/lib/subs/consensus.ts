import type { OffsetEstimate } from "./sync";

/**
 * One offset out of several track comparisons.
 *
 * Comparing a track with a single other track only says the two agree; if
 * that other track was cut for another release, the "fix" moves the right
 * track out of place. Several references from different providers mostly
 * share the timing of the common release, so the shift most of them agree on
 * is the one to trust, and how many agree is the confidence.
 */
export interface ConsensusResult {
  offsetMs: number;
  confidence: number;
  /** References that agreed with the chosen shift. */
  agreeing: number;
  /** References that could be compared at all. */
  compared: number;
}

const AGREE_MS = 700;

/**
 * Whether an audio measurement carries enough evidence to use.
 *
 * The sidecar's confidence grows with the seconds of audio it analysed, not
 * with how sure the match is; below this it saw too little to say anything.
 * The noise seen earlier (-13.5 s and +12.8 s for the same copy) came from
 * letting ffsubsync also rescale the timing; with a constant shift only,
 * five tracks measured within 0.1 s of each other.
 */
export function audioIsUsable(audio: { offsetMs: number; confidence: number }): boolean {
  return Number.isFinite(audio.offsetMs) && audio.confidence >= 0.2 && Math.abs(audio.offsetMs) <= 120_000;
}

export function consensusOffset(estimates: OffsetEstimate[]): ConsensusResult {
  const usable = estimates.filter((estimate) => estimate.confidence >= 0.15);
  if (usable.length === 0) {
    return { offsetMs: 0, confidence: 0, agreeing: 0, compared: estimates.length };
  }

  // The largest group of estimates within AGREE_MS of each other, weighted by
  // how sure each comparison was.
  let best: OffsetEstimate[] = [];
  let bestWeight = -1;
  for (const pivot of usable) {
    const group = usable.filter((estimate) => Math.abs(estimate.offsetMs - pivot.offsetMs) <= AGREE_MS);
    const weight = group.reduce((total, estimate) => total + estimate.confidence, 0);
    if (weight > bestWeight) {
      bestWeight = weight;
      best = group;
    }
  }

  const sorted = best.map((estimate) => estimate.offsetMs).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const meanConfidence = bestWeight / best.length;
  // One reference alone is a guess; agreement among several is evidence.
  const agreement = best.length / Math.max(usable.length, 1);
  const support = Math.min(1, best.length / 3);
  const confidence = meanConfidence * (0.5 + 0.5 * agreement) * (0.6 + 0.4 * support);

  return {
    offsetMs: Math.round(median / 100) * 100,
    confidence: Number(Math.max(0, Math.min(1, confidence)).toFixed(3)),
    agreeing: best.length,
    compared: estimates.length,
  };
}
