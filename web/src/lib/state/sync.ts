import { mutateState, readState } from "./index";
import type { SyncRecord } from "./types";

/**
 * Subtitle alignment, shared by the whole house.
 *
 * The offset between a subtitle track and a video is a property of that copy:
 * the same file on the phone and on the TV needs the same shift. Measuring it
 * costs minutes (the audio has to be pulled down), so it is done once and
 * kept in the state, and every device that opens the title gets it right
 * without waiting.
 */

/** An alignment older than this is recomputed: the copy may have changed. */
const MAX_AGE_MS = 14 * 24 * 3600_000;

export function syncKey(titleId: string, sourceId: string): string {
  return `${titleId}:${sourceId}`;
}

export async function getSync(titleId: string, sourceId: string): Promise<SyncRecord | null> {
  const doc = await readState();
  const record = doc.sync[syncKey(titleId, sourceId)];
  if (!record) return null;
  if (Date.now() - record.at > MAX_AGE_MS) return null;
  return record;
}

export async function setSync(
  titleId: string,
  sourceId: string,
  record: Omit<SyncRecord, "at">,
): Promise<void> {
  await mutateState((doc) => {
    doc.sync[syncKey(titleId, sourceId)] = { ...record, at: Date.now() };
  });
}
