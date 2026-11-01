import { cacheGet, cacheSet } from "../db";
import { fetchJson } from "../http";
import { normalizeStreams, type VodSource } from "./rank";
import type { AddonMeta } from "../addons";

/** Deliberately curated: an Archive upload is not automatically rights-cleared. */
export const OPEN_FILM_SEEDS = [{
  imdb: "tt0063350",
  archiveId: "night_of_the_living_dead_dvd",
  video: "Night.mp4",
  caption: "Night.asr.srt",
  name: "Night of the Living Dead",
  year: "1968",
}] as const;

export const OPEN_FILM_ADDON = {
  id: "open-films", name: "Internet Archive · cine abierto", kind: "vod" as const,
  url: "https://archive.org", enabled: true, createdAt: 0,
};

export function openFilmsEnabled(): boolean {
  return process.env.FUBOL_OPEN_FILMS === "1";
}

interface ArchiveFile { name?: string; format?: string; size?: string; length?: string; width?: string; height?: string }
export interface ArchiveMetadata {
  metadata?: { mediatype?: string; licenseurl?: string | string[]; title?: string; date?: string };
  files?: ArchiveFile[];
}
export interface OpenFilm {
  meta: AddonMeta;
  sources: VodSource[];
  captions: { id: string; url: string; lang: string; addonName: string }[];
}

export function parseOpenFilm(seed: typeof OPEN_FILM_SEEDS[number], data: ArchiveMetadata): OpenFilm | null {
  const metadata = data.metadata;
  const licenses = Array.isArray(metadata?.licenseurl) ? metadata.licenseurl : [metadata?.licenseurl];
  if (metadata?.mediatype !== "movies" || !licenses.some((url) => typeof url === "string" && /^https?:\/\/creativecommons\.org\/licenses\/publicdomain\/?$/i.test(url))) return null;
  const video = data.files?.find((file) => file.name === seed.video && /h\.264|mpeg4/i.test(file.format ?? "") && Number(file.size) > 50_000_000 && Number(file.length) > 3600);
  if (!video) return null;
  const height = Number(video.height);
  const base = `https://archive.org/download/${encodeURIComponent(seed.archiveId)}/`;
  const caption = data.files?.find((file) => file.name === seed.caption && /subrip/i.test(file.format ?? "") && Number(file.size) < 1_000_000);
  return {
    meta: {
      id: seed.imdb, type: "movie", name: seed.name, releaseInfo: seed.year, year: seed.year,
      poster: `https://archive.org/services/img/${seed.archiveId}`,
      background: `https://archive.org/services/img/${seed.archiveId}`,
      description: "Un grupo de desconocidos se refugia en una granja mientras los muertos vuelven a la vida. El clásico de George A. Romero, con audio original en inglés.",
      sourceNotice: "Copia completa de Internet Archive, identificada como dominio público en su registro. La pista inglesa ASR corresponde a esta carga, pero es automática y puede tener errores de texto o tiempo.",
      sourcePage: `https://archive.org/details/${seed.archiveId}`,
      genres: ["Terror", "Cine abierto"], runtime: `${Math.round(Number(video.length) / 60)} min`,
    },
    sources: normalizeStreams(OPEN_FILM_ADDON, [{
      url: base + encodeURIComponent(seed.video), name: "Internet Archive · 480p · audio EN",
      title: `${seed.name} (${seed.year}) · ${Number.isFinite(height) && height > 0 ? `${height}p · ` : ""}copia completa`,
      behaviorHints: { filename: seed.video, videoSize: Number(video.size) },
    }]),
    captions: caption ? [{ id: `archive:${seed.archiveId}:en-asr`, url: base + encodeURIComponent(seed.caption), lang: "en", addonName: "Internet Archive · ASR de esta copia" }] : [],
  };
}

export async function getOpenFilm(id: string): Promise<OpenFilm | null> {
  if (!openFilmsEnabled()) return null;
  const seed = OPEN_FILM_SEEDS.find((item) => item.imdb === id);
  if (!seed) return null;
  const key = `open-film:v3:${seed.archiveId}`;
  const cached = cacheGet<{ film: OpenFilm | null }>(key);
  if (cached) return cached.film;
  try {
    const { data } = await fetchJson<ArchiveMetadata>(`https://archive.org/metadata/${seed.archiveId}`, { timeoutMs: 10000 });
    const film = parseOpenFilm(seed, data);
    if (film) {
      try {
        const { data: artwork } = await fetchJson<{ meta?: AddonMeta }>(`https://v3-cinemeta.strem.io/meta/movie/${seed.imdb}.json`, { timeoutMs: 4000 });
        if (artwork.meta?.id === seed.imdb) {
          for (const field of ["poster", "background"] as const) {
            const value = artwork.meta[field];
            if (value && new URL(value).protocol === "https:" && new URL(value).hostname === "images.metahub.space") film.meta[field] = value;
          }
        }
      } catch { /* Archive artwork remains an honest fallback. */ }
    }
    cacheSet(key, { film }, film ? 10 * 60_000 : 30_000);
    return film;
  } catch { return null; }
}

export async function getOpenFilmMetas(query?: string): Promise<AddonMeta[]> {
  if (!openFilmsEnabled()) return [];
  const matching = OPEN_FILM_SEEDS.filter((seed) => !query || `${seed.name} la noche de los muertos vivos ${seed.year}`.toLowerCase().includes(query.toLowerCase().trim()));
  const films = await Promise.all(matching.map((seed) => getOpenFilm(seed.imdb)));
  return films.flatMap((film) => film ? [film.meta] : []);
}
