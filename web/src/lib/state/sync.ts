import { mutateState, readState } from "./index";
import type { SyncRecord } from "./types";

/**
 * Subtitle alignment, shared by the whole house.
 *
 * The offset belongs to one subtitle track played over one copy of the film:
 * the same pair on the phone and on the TV needs the same shift, and a
 * different track (Spanish instead of English) or a different copy needs its
 * own. It used to be kept per copy only, so the shift measured for one track
 * was applied to every other track of that film.
 *
 * Measuring against the audio costs minutes, so it is done once and kept
 * here, and every device that opens the title gets it without waiting.
 */

/**
 * The record that holds a copy's own shift against the audio, shared by all
 * of its tracks (see the subtitle sync route).
 */
export const COPY_TRACK = "*";

/** An alignment older than this is recomputed: the copy may have changed. */
const MAX_AGE_MS = 14 * 24 * 3600_000;

export function syncKey(titleId: string, sourceId: string, trackId?: string): string {
  return trackId ? `${titleId}:${sourceId}:${trackId}` : `${titleId}:${sourceId}`;
}

/** Manual adjustments outrank measurements; audio outranks track comparison. */
const RANK: Record<SyncRecord["source"], number> = { manual: 3, audio: 2, reference: 1 };

export async function getSync(titleId: string, sourceId: string, trackId?: string): Promise<SyncRecord | null> {
  const doc = await readState();
  const record = doc.sync[syncKey(titleId, sourceId, trackId)];
  if (!record) return null;
  // A manual adjustment is a person's decision: it does not expire.
  if (record.source !== "manual" && Date.now() - record.at > MAX_AGE_MS) return null;
  return record;
}

export async function setSync(
  titleId: string,
  sourceId: string,
  record: Omit<SyncRecord, "at">,
  trackId?: string,
): Promise<SyncRecord> {
  let kept: SyncRecord = { ...record, at: Date.now() };
  await mutateState((doc) => {
    const key = syncKey(titleId, sourceId, trackId);
    const existing = doc.sync[key];
    // A measurement never overwrites what a person set by hand, and a
    // track comparison never overwrites an audio measurement.
    if (existing && RANK[existing.source] > RANK[record.source] && Date.now() - existing.at < MAX_AGE_MS) {
      kept = existing;
      return;
    }
    kept = { ...record, at: Date.now(), ...(trackId ? { title: titleId, copy: sourceId, track: trackId } : {}) };
    doc.sync[key] = kept;
  });
  return kept;
}

/** Forgets a manual adjustment, so the measured alignment applies again. */
export async function clearManualSync(titleId: string, sourceId: string, trackId: string): Promise<void> {
  await mutateState((doc) => {
    const key = syncKey(titleId, sourceId, trackId);
    if (doc.sync[key]?.source === "manual") delete doc.sync[key];
  });
}

export interface TitleAlignment {
  copy: string;
  track: string;
  offsetMs: number;
  confidence: number;
  method: SyncRecord["source"];
}

/** Every alignment known for a title, for the page to apply without asking. */
export async function alignmentsFor(titleId: string): Promise<TitleAlignment[]> {
  const doc = await readState();
  const out: TitleAlignment[] = [];
  for (const record of Object.values(doc.sync)) {
    if (record.title !== titleId || !record.copy || !record.track || record.track === COPY_TRACK) continue;
    if (record.source !== "manual" && Date.now() - record.at > MAX_AGE_MS) continue;
    out.push({
      copy: record.copy,
      track: record.track,
      offsetMs: record.offsetMs,
      confidence: record.confidence,
      method: record.source,
    });
  }
  return out;
}
