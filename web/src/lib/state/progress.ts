import { mutateState, readState } from "./index";
import type { ProgressRecord } from "./types";

/**
 * Where each viewer left off.
 *
 * The player remembers the position inside the browser, but the family watches
 * on different devices: the phone in the kitchen and the tablet in the living
 * room are two browsers. Storing the progress in the shared state is what
 * makes "seguir viendo" work on the other one.
 */

const MAX_PER_SCOPE = 40;
/** A title watched to the end is not "in progress" any more. */
const FINISHED_RATIO = 0.96;

export async function listProgress(scope: string): Promise<ProgressRecord[]> {
  const doc = await readState();
  return doc.progress
    .filter((item) => item.scope === scope)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveProgress(
  scope: string,
  entry: Omit<ProgressRecord, "scope" | "updatedAt">,
): Promise<void> {
  if (!Number.isFinite(entry.position) || entry.position < 0) return;
  const duration = Number.isFinite(entry.duration) ? entry.duration : 0;
  // Almost finished counts as finished: the title leaves the rail instead of
  // offering to resume three seconds before the credits.
  if (duration > 0 && entry.position >= duration * FINISHED_RATIO) {
    await clearProgress(scope, entry.type, entry.id, entry.episode);
    return;
  }
  await mutateState((doc) => {
    doc.progress = doc.progress.filter(
      (item) =>
        !(
          item.scope === scope &&
          item.type === entry.type &&
          item.id === entry.id &&
          (item.episode ?? "") === (entry.episode ?? "")
        ),
    );
    doc.progress.push({ ...entry, scope, updatedAt: Date.now() });
    const mine = doc.progress.filter((item) => item.scope === scope);
    if (mine.length > MAX_PER_SCOPE) {
      const oldest = mine.sort((a, b) => a.updatedAt - b.updatedAt).slice(0, mine.length - MAX_PER_SCOPE);
      const drop = new Set(oldest.map((item) => `${item.type}:${item.id}:${item.episode ?? ""}`));
      doc.progress = doc.progress.filter((item) => !drop.has(`${item.type}:${item.id}:${item.episode ?? ""}`));
    }
  });
}

export async function clearProgress(
  scope: string,
  type: string,
  id: string,
  episode?: string,
): Promise<void> {
  await mutateState((doc) => {
    doc.progress = doc.progress.filter(
      (item) =>
        !(
          item.scope === scope &&
          item.type === type &&
          item.id === id &&
          (item.episode ?? "") === (episode ?? "")
        ),
    );
  });
}
