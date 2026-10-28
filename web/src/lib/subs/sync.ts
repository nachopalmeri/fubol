import type { SubtitleCue } from "./format";

export interface Envelope {
  values: Uint8Array;
  stepMs: number;
  durationMs: number;
}

export interface OffsetEstimate {
  offsetMs: number;
  confidence: number;
  score: number;
  overlapSeconds: number;
}

const MAX_DURATION_MS = 4 * 3600_000;

/** Binary "dialogue present" signal used for timing cross-correlation. */
export function buildEnvelope(cues: SubtitleCue[], stepMs = 1000): Envelope {
  const end = Math.min(
    MAX_DURATION_MS,
    Math.max(0, ...cues.map((cue) => cue.end)),
  );
  const length = Math.max(1, Math.ceil(end / stepMs));
  const values = new Uint8Array(length);
  for (const cue of cues) {
    const startIndex = Math.max(0, Math.floor(cue.start / stepMs));
    const endIndex = Math.min(length - 1, Math.ceil(cue.end / stepMs) - 1);
    for (let i = startIndex; i <= endIndex; i++) values[i] = 1;
  }
  return { values, stepMs, durationMs: end };
}

function similarity(a: Uint8Array, b: Uint8Array, shiftSteps: number, countA: number, countB: number): number {
  if (countA === 0 || countB === 0) return 0;
  let overlap = 0;
  const start = Math.max(0, -shiftSteps);
  const end = Math.min(a.length, b.length - shiftSteps);
  for (let i = start; i < end; i++) {
    if (a[i] && b[i + shiftSteps]) overlap += 1;
  }
  return overlap / Math.sqrt(countA * countB);
}

function countOnes(values: Uint8Array): number {
  let count = 0;
  for (const value of values) if (value) count += 1;
  return count;
}

/**
 * Finds the constant offset that best aligns `target` with `reference`.
 * Positive returned values mean "add this to target cue times".
 *
 * Coarse pass at 1 s over ±120 s, then a 100 ms refinement around the best
 * coarse lag. O(n·lags) but n is capped at 4 h and lags at 240, so it is fast.
 */
export function estimateOffset(
  reference: SubtitleCue[],
  target: SubtitleCue[],
  options: { maxOffsetMs?: number; coarseStepMs?: number; fineStepMs?: number } = {},
): OffsetEstimate {
  const maxOffsetMs = options.maxOffsetMs ?? 120_000;
  const coarseStep = options.coarseStepMs ?? 1000;
  const fineStep = options.fineStepMs ?? 100;
  const ref = buildEnvelope(reference, coarseStep);
  const tgt = buildEnvelope(target, coarseStep);
  const countRef = countOnes(ref.values);
  const countTgt = countOnes(tgt.values);
  if (countRef === 0 || countTgt === 0) {
    return { offsetMs: 0, confidence: 0, score: 0, overlapSeconds: 0 };
  }

  const maxLag = Math.floor(maxOffsetMs / coarseStep);
  let bestLag = 0;
  let bestScore = -1;
  const scores: { lag: number; score: number }[] = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const score = similarity(ref.values, tgt.values, lag, countRef, countTgt);
    scores.push({ lag, score });
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  // Refine at 100 ms around the best coarse lag.
  const fineRef = buildEnvelope(reference, fineStep);
  const fineTgt = buildEnvelope(target, fineStep);
  const fineCountRef = countOnes(fineRef.values);
  const fineCountTgt = countOnes(fineTgt.values);
  const center = Math.round((bestLag * coarseStep) / fineStep);
  const radius = Math.round(coarseStep / fineStep) + 1;
  let fineBestLag = center;
  let fineBestScore = -1;
  for (let lag = center - radius; lag <= center + radius; lag++) {
    const score = similarity(fineRef.values, fineTgt.values, lag, fineCountRef, fineCountTgt);
    if (score > fineBestScore) {
      fineBestScore = score;
      fineBestLag = lag;
    }
  }

  // Margin against the best lag that is at least 3 s away.
  const second = scores
    .filter((entry) => Math.abs(entry.lag - bestLag) * coarseStep >= 3000)
    .reduce((max, entry) => Math.max(max, entry.score), 0);
  const margin = Math.max(0, fineBestScore - Math.max(0, second));
  const confidence = Math.max(0, Math.min(1, (fineBestScore - 0.25) / 0.5)) * (0.6 + Math.min(0.4, margin * 2));

  const shiftMs = fineBestLag * fineStep;
  const overlapSeconds = Math.min(ref.durationMs, tgt.durationMs) / 1000;
  return {
    offsetMs: -shiftMs,
    confidence: Number(confidence.toFixed(3)),
    score: Number(fineBestScore.toFixed(3)),
    overlapSeconds: Math.round(overlapSeconds),
  };
}
