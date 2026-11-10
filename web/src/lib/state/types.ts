/**
 * The whole mutable state of the app is one small document.
 *
 * Why a document and not tables: the app has to run in two very different
 * places. On the family server it is a container with a SQLite volume; on
 * Vercel there is no writable disk at all, so the same document is persisted as
 * a single object in Blob storage with an ETag-guarded write. Keeping one shape
 * means links, sources and addons behave identically in both, and nothing in
 * the domain layer needs to know where it is running.
 */
export type AddonKind = "vod" | "subs" | "live" | "meta";

export interface LinkRecord {
  id: number;
  code: string;
  label: string;
  permissions: string;
  pinHash: string | null;
  expiresAt: number | null;
  revokedAt: number | null;
  createdAt: number;
  lastSeenAt: number | null;
}

export type LiveSourceStorageKind = "hls" | "m3u" | "xtream" | "addon";

export interface SourceRecord {
  id: string;
  kind: LiveSourceStorageKind;
  name: string;
  url: string;
  config: Record<string, unknown>;
  enabled: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
}

export interface AddonRecord {
  id: string;
  url: string;
  name: string;
  kind: AddonKind;
  enabled: boolean;
  createdAt: number;
}

export interface ProgressRecord {
  /** Who watched it: the admin, or the code of a family link. */
  scope: string;
  type: "movie" | "series" | "live";
  id: string;
  episode?: string;
  name: string;
  poster?: string;
  position: number;
  duration: number;
  updatedAt: number;
}

export interface SyncRecord {
  offsetMs: number;
  confidence: number;
  /** When the alignment was measured; a stale one can be recomputed. */
  at: number;
  source: "audio" | "reference";
}

export interface StateDoc {
  version: 1;
  nextLinkId: number;
  links: LinkRecord[];
  sources: SourceRecord[];
  addons: AddonRecord[];
  settings: Record<string, string>;
  /** Where each viewer left off, so "seguir viendo" works across devices. */
  progress: ProgressRecord[];
  /**
   * Subtitle alignment per title and source. The alignment is a property of
   * the copy, not of the device: computing it once and sharing it is what
   * makes the subtitles land right on every screen of the house.
   */
  sync: Record<string, SyncRecord>;
}

export function emptyState(): StateDoc {
  return {
    version: 1,
    nextLinkId: 1,
    links: [],
    sources: [],
    addons: [],
    settings: {},
    progress: [],
    sync: {},
  };
}

/** Defensive read: a hand-edited or half-written document must not crash pages. */
export function normalizeState(input: unknown): StateDoc {
  const base = emptyState();
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<StateDoc>;
  const links = Array.isArray(raw.links) ? raw.links.filter((link) => link && typeof link.code === "string") : [];
  const sources = Array.isArray(raw.sources) ? raw.sources.filter((source) => source && typeof source.id === "string") : [];
  const addons = Array.isArray(raw.addons) ? raw.addons.filter((addon) => addon && typeof addon.id === "string") : [];
  const settings =
    raw.settings && typeof raw.settings === "object" && !Array.isArray(raw.settings)
      ? Object.fromEntries(
          Object.entries(raw.settings).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : {};
  const maxId = links.reduce((max, link) => Math.max(max, Number(link.id) || 0), 0);
  const progress = Array.isArray(raw.progress)
    ? raw.progress.filter(
        (item) =>
          item &&
          typeof item.scope === "string" &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.position === "number",
      )
    : [];
  const sync =
    raw.sync && typeof raw.sync === "object" && !Array.isArray(raw.sync)
      ? Object.fromEntries(
          Object.entries(raw.sync).filter(
            (entry): entry is [string, SyncRecord] =>
              entry[1] &&
              typeof entry[1] === "object" &&
              typeof (entry[1] as SyncRecord).offsetMs === "number",
          ),
        )
      : {};
  return {
    version: 1,
    nextLinkId: Math.max(Number(raw.nextLinkId) || 1, maxId + 1),
    links: links as LinkRecord[],
    sources: sources as SourceRecord[],
    addons: addons as AddonRecord[],
    settings,
    progress: progress as ProgressRecord[],
    sync,
  };
}
