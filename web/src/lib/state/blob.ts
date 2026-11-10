import { normalizeState, type StateDoc } from "./types";

/**
 * Blob persistence for Vercel, where the filesystem is read-only and every
 * invocation may run in a different instance.
 *
 * One JSON object holds the whole state. Correctness comes from the ETag: a
 * write only lands if nobody else wrote in between (`ifMatch`), and a losing
 * write is retried against the fresh copy instead of clobbering it. Reads
 * bypass the CDN (`useCache: false`) so a link that was just revoked cannot be
 * accepted by an instance holding a cached copy.
 */
export const STATE_PATH = "fubol/state.json";

export function blobStorageEnabled(): boolean {
  if (process.env.FUBOL_STORAGE === "sqlite") return false;
  if (process.env.FUBOL_STORAGE === "blob") return true;
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * `get` reports a weak validator (`W/"…"`) while `put`'s `ifMatch` only accepts
 * the strong form. Passing it through unchanged made every write after the
 * initial seed fail the precondition, so adding a family link returned 500.
 */
function strongEtag(etag: string | undefined): string | null {
  if (!etag) return null;
  const value = etag.replace(/^W\//, "").trim();
  return value ? value : null;
}

export function isPreconditionFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; message?: string; status?: number; statusCode?: number };
  if (candidate.name === "BlobPreconditionFailedError") return true;
  if (candidate.status === 412 || candidate.statusCode === 412) return true;
  return /precondition|etag|412/i.test(candidate.message ?? "");
}

export async function readBlobState(): Promise<{ doc: StateDoc | null; version: string | null }> {
  const { get } = await import("@vercel/blob");
  const result = await get(STATE_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return { doc: null, version: null };
  const version = strongEtag(result.blob.etag);
  const text = await new Response(result.stream).text();
  if (!text.trim()) return { doc: null, version };
  try {
    return { doc: normalizeState(JSON.parse(text)), version };
  } catch {
    // A truncated document is treated as "no document": seeding rewrites it
    // instead of every page failing until somebody notices.
    return { doc: null, version };
  }
}

export async function writeBlobState(doc: StateDoc, version: string | null): Promise<string> {
  const { put } = await import("@vercel/blob");
  const result = await put(STATE_PATH, JSON.stringify(doc), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    // The document changes rarely; one minute keeps a stale copy from being
    // served to a second instance while still absorbing bursts.
    cacheControlMaxAge: 60,
    ...(version ? { ifMatch: strongEtag(version) ?? undefined } : {}),
  });
  return strongEtag(result.etag) ?? result.etag;
}
