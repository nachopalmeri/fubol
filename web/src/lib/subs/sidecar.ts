/**
 * Where the audio-alignment sidecar (ffsubsync) lives.
 *
 * The sidecar runs on a machine at home and is published through a tunnel
 * whose address changes on every restart. An environment variable cannot
 * follow that: it kept pointing at the first tunnel long after it was gone,
 * and audio sync failed in silence. The address therefore lives in the shared
 * state, where the launcher writes it each time it publishes the tunnel; the
 * environment variable remains the fallback for a fixed deployment (Docker).
 */
import { getSetting } from "../state/settings";

export const SUBSYNC_URL_KEY = "subsyncUrl";
export const SUBSYNC_TOKEN_KEY = "subsyncToken";

export interface SubsyncTarget {
  base: string;
  /** Shared secret the sidecar asks for when it was started with one. */
  token: string | null;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed ? trimmed : undefined;
}

export async function subsyncTarget(): Promise<SubsyncTarget | null> {
  let stored: string | undefined;
  let token: string | undefined;
  try {
    stored = clean(await getSetting(SUBSYNC_URL_KEY));
    token = (await getSetting(SUBSYNC_TOKEN_KEY))?.trim() || undefined;
  } catch {
    // The state read can fail on a cold start: the environment still applies.
  }
  if (stored) return { base: stored, token: token ?? null };
  const fromEnv = clean(process.env.SUBSYNC_URL);
  if (fromEnv) return { base: fromEnv, token: process.env.SUBSYNC_TOKEN?.trim() || null };
  return null;
}

export interface SubsyncStatus {
  configured: boolean;
  reachable: boolean;
  url: string | null;
}

let probe: { at: number; url: string; status: SubsyncStatus } | null = null;

/** Whether the sidecar answers right now, measured rather than assumed. */
export async function subsyncStatus(timeoutMs = 4000): Promise<SubsyncStatus> {
  const target = await subsyncTarget();
  if (!target) return { configured: false, reachable: false, url: null };
  // Keyed by address: a republished tunnel is a different service to ask.
  if (probe && probe.url === target.base && Date.now() - probe.at < 20_000) return probe.status;
  let reachable = false;
  try {
    const res = await fetch(`${target.base}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    reachable = res.ok;
    await res.body?.cancel();
  } catch {
    reachable = false;
  }
  const status: SubsyncStatus = { configured: true, reachable, url: target.base };
  probe = { at: Date.now(), url: target.base, status };
  return status;
}
