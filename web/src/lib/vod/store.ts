import { getManifest, type AddonRef } from "../addons";
import { shortHash } from "../crypto";
import { mutateState, readState } from "../state";
import { initialState } from "../state/index";
import type { AddonKind, AddonRecord } from "../state/types";

export type { AddonKind };

export interface AddonRow extends AddonRef {
  enabled: boolean;
  createdAt: number;
}

function toAddon(record: AddonRecord): AddonRow {
  return {
    id: record.id,
    url: record.url,
    name: record.name ?? record.url,
    kind: record.kind,
    enabled: record.enabled,
    createdAt: record.createdAt,
  };
}

let seeded = false;

/**
 * A brand-new install must be usable without the admin adding anything, so the
 * first list seeds the verified defaults once. `FUBOL_NO_DEFAULT_ADDONS=1`
 * keeps an empty catalog for a deliberate clean start.
 */
async function seedDefaults(): Promise<void> {
  if (seeded) return;
  seeded = true;
  if (process.env.FUBOL_NO_DEFAULT_ADDONS === "1") return;
  const doc = await readState();
  if (doc.addons.some((addon) => addon.kind === "meta")) return;
  const defaults = initialState().addons.filter((addon) => addon.url.includes("cinemeta"));
  if (defaults.length === 0) return;
  await mutateState((state) => {
    for (const addon of defaults) {
      if (!state.addons.some((item) => item.url === addon.url)) state.addons.push(addon);
    }
  });
}

export async function listAddonRows(kind?: AddonKind, includeDisabled = false): Promise<AddonRow[]> {
  await seedDefaults();
  const doc = await readState();
  return doc.addons
    .filter((addon) => (kind ? addon.kind === kind : true))
    .filter((addon) => (includeDisabled ? true : addon.enabled))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(toAddon);
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
  const existing = (await readState()).addons.find((addon) => addon.url === normalized);
  if (existing) return toAddon(existing);
  const id = shortHash(`addon:${normalized}`, 12);
  const kind: AddonKind = input.kind ?? "vod";
  return mutateState((state) => {
    const duplicate = state.addons.find((addon) => addon.url === normalized);
    if (duplicate) return toAddon(duplicate);
    const record: AddonRecord = {
      id,
      url: normalized,
      name: input.name?.trim() || manifest.name,
      kind,
      enabled: true,
      createdAt: Date.now(),
    };
    state.addons.push(record);
    return toAddon(record);
  });
}

/**
 * Replaces an addon's manifest with a personal one.
 *
 * The public manifest of most providers answers "configuration required" until
 * the owner logs in and gets a URL with their credentials inside it. Editing
 * the URL in place is what turns those addons on; deleting and re-adding lost
 * the row the admin had just configured.
 */
export async function updateAddon(
  id: string,
  input: { url?: string; name?: string; kind?: AddonKind; enabled?: boolean },
): Promise<AddonRow> {
  let normalizedUrl: string | undefined;
  let manifestName: string | undefined;
  if (input.url?.trim()) {
    // Validated before saving: a broken URL would leave the addon listed as
    // active while every request it makes fails.
    const manifest = await getManifest(input.url.trim());
    manifestName = manifest.name;
    const url = new URL(input.url.trim());
    if (!/manifest\.json$/i.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/+$/, "")}/manifest.json`;
    }
    normalizedUrl = url.toString();
  }
  return mutateState((state) => {
    const addon = state.addons.find((item) => item.id === id);
    if (!addon) throw new Error("Addon no encontrado");
    if (normalizedUrl) addon.url = normalizedUrl;
    if (input.name?.trim()) addon.name = input.name.trim();
    if (input.kind) addon.kind = input.kind;
    if (typeof input.enabled === "boolean") addon.enabled = input.enabled;
    if (!addon.name && manifestName) addon.name = manifestName;
    return toAddon(addon);
  });
}

export async function toggleAddon(id: string, enabled: boolean): Promise<void> {
  await mutateState((state) => {
    const addon = state.addons.find((item) => item.id === id);
    if (addon) addon.enabled = enabled;
  });
}

export async function deleteAddon(id: string): Promise<void> {
  await mutateState((state) => {
    state.addons = state.addons.filter((addon) => addon.id !== id);
  });
}
