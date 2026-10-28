import { all, get, run } from "./db";
import { hashPin, normalizeCode, randomCode, shortHash } from "./crypto";

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

interface LinkRow {
  id: number;
  code: string;
  label: string;
  permissions: string;
  pin_hash: string | null;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
  last_seen_at: number | null;
}

function parsePermissions(value: string): Permission[] {
  return value
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is Permission => p === "live" || p === "vod");
}

function toLink(row: LinkRow): ShareLink {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    permissions: parsePermissions(row.permissions),
    pinHash: row.pin_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function createShareLink(input: {
  label: string;
  permissions: Permission[];
  expiresInDays?: number | null;
  pin?: string | null;
}): ShareLink {
  const permissions: Permission[] =
    input.permissions.length > 0 ? input.permissions : ["live", "vod"];
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? Date.now() + input.expiresInDays * 86_400_000
      : null;
  let code = randomCode(8);
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = get<{ id: number }>("SELECT id FROM share_links WHERE code = ?", code);
    if (!existing) break;
    code = randomCode(8);
  }
  const now = Date.now();
  const result = run(
    "INSERT INTO share_links(code, label, permissions, pin_hash, expires_at, created_at) VALUES(?, ?, ?, ?, ?, ?)",
    code,
    input.label.trim() || "Familia",
    permissions.join(","),
    input.pin ? hashPin(input.pin) : null,
    expiresAt,
    now,
  );
  return {
    id: result.lastInsertRowid,
    code,
    label: input.label,
    permissions,
    pinHash: input.pin ? "set" : null,
    expiresAt,
    revokedAt: null,
    createdAt: now,
    lastSeenAt: null,
  };
}

export function listShareLinks(): ShareLink[] {
  return all<LinkRow>("SELECT * FROM share_links ORDER BY created_at DESC, id DESC").map(toLink);
}

export function getShareLink(code: string): ShareLink | undefined {
  const normalized = normalizeCode(code);
  if (!normalized) return undefined;
  const row = get<LinkRow>("SELECT * FROM share_links WHERE code = ?", normalized);
  return row ? toLink(row) : undefined;
}

export function revokeShareLink(id: number): boolean {
  return run("UPDATE share_links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", Date.now(), id)
    .changes > 0;
}

export function touchShareLink(code: string): void {
  run("UPDATE share_links SET last_seen_at = ? WHERE code = ?", Date.now(), normalizeCode(code));
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
