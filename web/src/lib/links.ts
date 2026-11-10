import { hashPin, normalizeCode, randomCode, shortHash } from "./crypto";
import { mutateState, readState } from "./state";
import type { LinkRecord } from "./state/types";

export type Permission = "live" | "vod";

export interface ShareLink {
  id: number;
  code: string;
  label: string;
  permissions: Permission[];
  pinHash: string | null;
  expiresAt: number | null;
  revokedAt: number | null;
  createdAt: number;
  lastSeenAt: number | null;
}

function parsePermissions(value: string): Permission[] {
  return value
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is Permission => p === "live" || p === "vod");
}

function toLink(row: LinkRecord): ShareLink {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    permissions: parsePermissions(row.permissions),
    pinHash: row.pinHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
  };
}

export async function createShareLink(input: {
  label: string;
  permissions: Permission[];
  expiresInDays?: number | null;
  pin?: string | null;
}): Promise<ShareLink> {
  const permissions: Permission[] =
    input.permissions.length > 0 ? input.permissions : ["live", "vod"];
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? Date.now() + input.expiresInDays * 86_400_000
      : null;
  const pinHash = input.pin ? hashPin(input.pin) : null;
  return mutateState((doc) => {
    let code = randomCode(8);
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!doc.links.some((link) => link.code === code)) break;
      code = randomCode(8);
    }
    const now = Date.now();
    const id = Math.max(doc.nextLinkId || 1, ...doc.links.map((link) => link.id + 1));
    doc.nextLinkId = id + 1;
    const record: LinkRecord = {
      id,
      code,
      label: input.label.trim() || "Familia",
      permissions: permissions.join(","),
      pinHash,
      expiresAt,
      revokedAt: null,
      createdAt: now,
      lastSeenAt: null,
    };
    doc.links.push(record);
    return {
      id,
      code,
      label: record.label,
      permissions,
      pinHash: pinHash ? "set" : null,
      expiresAt,
      revokedAt: null,
      createdAt: now,
      lastSeenAt: null,
    } satisfies ShareLink;
  });
}

export async function listShareLinks(): Promise<ShareLink[]> {
  const doc = await readState();
  return [...doc.links].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id).map(toLink);
}

export async function getShareLink(code: string): Promise<ShareLink | undefined> {
  const normalized = normalizeCode(code);
  if (!normalized) return undefined;
  const doc = await readState();
  const row = doc.links.find((link) => link.code === normalized);
  return row ? toLink(row) : undefined;
}

export async function revokeShareLink(id: number): Promise<boolean> {
  return mutateState((doc) => {
    const link = doc.links.find((item) => item.id === id && !item.revokedAt);
    if (!link) return false;
    link.revokedAt = Date.now();
    return true;
  });
}

/**
 * `last_seen_at` is cosmetic (the admin panel shows it), so a visit every few
 * seconds must not become a write. On the Blob backend each write is a real
 * round trip, and updating it on every request also fought the state memo.
 */
const TOUCH_INTERVAL_MS = 6 * 3600_000;

export async function touchShareLink(code: string): Promise<void> {
  const normalized = normalizeCode(code);
  if (!normalized) return;
  const current = await readState();
  const existing = current.links.find((link) => link.code === normalized);
  if (!existing) return;
  if (existing.lastSeenAt && Date.now() - existing.lastSeenAt < TOUCH_INTERVAL_MS) return;
  await mutateState((doc) => {
    const link = doc.links.find((item) => item.code === normalized);
    if (link) link.lastSeenAt = Date.now();
  });
}

export function linkIsActive(link: ShareLink): boolean {
  if (link.revokedAt) return false;
  if (link.expiresAt && link.expiresAt < Date.now()) return false;
  return true;
}

/** Non-secret deterministic id used in logs. */
export function linkTag(code: string): string {
  return shortHash(`link:${normalizeCode(code)}`, 10);
}
