import { all, get, run } from "../db";
import { getManifest, type AddonRef } from "../addons";
import { shortHash } from "../crypto";

export type AddonKind = "vod" | "subs" | "live" | "meta";

export interface AddonRow extends AddonRef {
  enabled: boolean;
  createdAt: number;
}

interface Row {
  id: string;
  url: string;
  name: string | null;
  kind: AddonKind;
  enabled: number;
  config: string;
  created_at: number;
}

function toAddon(row: Row): AddonRow {
  return {
    id: row.id,
    url: row.url,
    name: row.name ?? row.url,
    kind: row.kind,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

let seeded = false;

function seedDefaults(): void {
  if (seeded) return;
  seeded = true;
  if (process.env.FUBOL_NO_DEFAULT_ADDONS === "1") return;
  try {
    const meta = get<{ id: string }>("SELECT id FROM addons WHERE kind = 'meta' LIMIT 1");
    if (!meta) {
      run(
        "INSERT OR IGNORE INTO addons(id, url, name, kind, enabled, config, created_at) VALUES(?, ?, ?, ?, 1, '{}', ?)",
        "cinemeta",
        "https://v3-cinemeta.strem.io/manifest.json",
        "Cinemeta",
        "meta",
        Date.now(),
      );
    }
  } catch {
    // first boot race: next call will retry
    seeded = false;
  }
}

export function listAddonRows(kind?: AddonKind, includeDisabled = false): AddonRow[] {
  seedDefaults();
  const conditions: string[] = [];
  const params: string[] = [];
  if (kind) {
    conditions.push("kind = ?");
    params.push(kind);
  }
  if (!includeDisabled) conditions.push("enabled = 1");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return all<Row>(`SELECT * FROM addons ${where} ORDER BY created_at ASC`, ...params).map(toAddon);
}

export async function addAddon(input: {
  url: string;
  kind?: AddonKind;
  name?: string;
}): Promise<AddonRow> {
  const manifest = await getManifest(input.url);
  const url = new URL(input.url);
  if (!/manifest\.json$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/manifest.json`;
  }
  const normalized = url.toString();
  const existing = get<Row>("SELECT * FROM addons WHERE url = ?", normalized);
  if (existing) return toAddon(existing);
  const id = shortHash(`addon:${normalized}`, 12);
  const kind: AddonKind = input.kind ?? "vod";
  run(
    "INSERT INTO addons(id, url, name, kind, enabled, config, created_at) VALUES(?, ?, ?, ?, 1, '{}', ?)",
    id,
    normalized,
    input.name?.trim() || manifest.name,
    kind,
    Date.now(),
  );
  return toAddon(get<Row>("SELECT * FROM addons WHERE id = ?", id) as Row);
}

export function toggleAddon(id: string, enabled: boolean): void {
  run("UPDATE addons SET enabled = ? WHERE id = ?", enabled ? 1 : 0, id);
}

export function deleteAddon(id: string): void {
  run("DELETE FROM addons WHERE id = ?", id);
}
