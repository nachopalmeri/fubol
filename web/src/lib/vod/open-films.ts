import { cacheGet, cacheSet } from "../cache";
import { fetchJson } from "../http";
import { normalizeStreams, type VodSource } from "./rank";
import type { AddonMeta } from "../addons";

/**
 * Curated, not discovered: an Archive upload is not automatically rights-
 * cleared. Every entry below was checked by hand against its own metadata —
 * `mediatype: movies`, a Creative Commons public-domain licence, a single
 * complete h.264/MPEG4 file over an hour long, and (where available) the ASR
 * subtitle track that ships with that same upload.
 */
export interface OpenFilmSeed {
  imdb: string;
  archiveId: string;
  video: string;
  /** ASR subtitle track bundled with the same upload, when the item has one. */
  caption?: string;
  name: string;
  year: string;
  genres: readonly string[];
  description: string;
}

export const OPEN_FILM_SEEDS: readonly OpenFilmSeed[] = [{
  imdb: "tt0063350",
  archiveId: "night_of_the_living_dead_dvd",
  video: "Night.mp4",
  caption: "Night.asr.srt",
  name: "Night of the Living Dead",
  year: "1968",
  genres: ["Terror", "Cine abierto"],
  description:
    "Un grupo de desconocidos se refugia en una granja mientras los muertos vuelven a la vida. El clásico de George A. Romero, con audio original en inglés.",
}, {
  imdb: "tt0013442",
  archiveId: "Nosferatu1922",
  video: "Nosferatu.mp4",
  name: "Nosferatu",
  year: "1922",
  genres: ["Terror", "Mudo", "Cine abierto"],
  description:
    "El vampiro que llega a Wisborg en busca de una casa y de sangre. La versión de Murnau del relato de Stoker, restaurada y con intertítulos en inglés.",
}, {
  imdb: "tt0032599",
  archiveId: "his_girl_friday",
  video: "his_girl_friday.mp4",
  caption: "his_girl_friday.asr.srt",
  name: "His Girl Friday",
  year: "1940",
  genres: ["Comedia", "Cine abierto"],
  description:
    "Una periodista a punto de casarse vuelve a la redacción por una última nota y su exmarido editor hace todo para retenerla. Comedia de Howard Hawks, famosa por su ritmo de diálogo.",
}, {
  imdb: "tt0055830",
  archiveId: "carnival_of_souls",
  video: "carnival_of_souls.mp4",
  caption: "carnival_of_souls.asr.srt",
  name: "Carnival of Souls",
  year: "1962",
  genres: ["Terror", "Cine abierto"],
  description:
    "Tras sobrevivir a un accidente, una organista se muda a una ciudad y empieza a ver una figura pálida que la sigue. Un clásico de culto del cine independiente.",
}, {
  imdb: "tt0017925",
  archiveId: "TheGeneral1926",
  video: "The_General_1926_720p.mp4",
  name: "The General",
  year: "1926",
  genres: ["Comedia", "Acción", "Mudo", "Cine abierto"],
  description:
    "Un maquinista del sur persigue a los espías que le robaron la locomotora y a la mujer que ama. Buster Keaton en su película más celebrada, copia en 720p.",
}, {
  imdb: "tt0033891",
  archiveId: "meet_john_doe",
  video: "meet_john_doe.mp4",
  caption: "meet_john_doe.asr.srt",
  name: "Meet John Doe",
  year: "1941",
  genres: ["Drama", "Cine abierto"],
  description:
    "Una columnista inventa a un hombre común que amenaza con saltar de un edificio en Nochebuena y el personaje se vuelve real. Drama de Frank Capra con Gary Cooper y Barbara Stanwyck.",
}];

export const OPEN_FILM_ADDON = {
  id: "open-films", name: "Internet Archive · cine abierto", kind: "vod" as const,
  url: "https://archive.org", enabled: true, createdAt: 0,
};

export function openFilmsEnabled(): boolean {
  return process.env.FUBOL_OPEN_FILMS === "1";
}

interface ArchiveFile { name?: string; format?: string; size?: string; length?: string; width?: string; height?: string }
export interface ArchiveMetadata {
  metadata?: { mediatype?: string; licenseurl?: string | string[]; title?: string; date?: string; year?: string };
  files?: ArchiveFile[];
}
export interface OpenFilm {
  meta: AddonMeta;
  sources: VodSource[];
  captions: { id: string; url: string; lang: string; addonName: string }[];
}

/** CC public-domain deeds: the legacy `licenses/publicdomain` and the two
 * `publicdomain/*` marks. Anything else stays out of the catalog. */
const PUBLIC_DOMAIN_LICENSE =
  /^https?:\/\/creativecommons\.org\/(licenses\/publicdomain\/?|publicdomain\/(zero|mark)\/1\.0\/?)$/i;

export function parseOpenFilm(seed: OpenFilmSeed, data: ArchiveMetadata): OpenFilm | null {
  const metadata = data.metadata;
  const licenses = Array.isArray(metadata?.licenseurl) ? metadata.licenseurl : [metadata?.licenseurl];
  if (metadata?.mediatype !== "movies" || !licenses.some((url) => typeof url === "string" && PUBLIC_DOMAIN_LICENSE.test(url.trim()))) return null;
  const video = data.files?.find((file) => file.name === seed.video && /h\.264|mpeg4/i.test(file.format ?? "") && Number(file.size) > 50_000_000 && Number(file.length) > 3600);
  if (!video) return null;
  const height = Number(video.height);
  const base = `https://archive.org/download/${encodeURIComponent(seed.archiveId)}/`;
  const caption = "caption" in seed && seed.caption
    ? data.files?.find((file) => file.name === seed.caption && /subrip/i.test(file.format ?? "") && Number(file.size) < 1_000_000)
    : undefined;
  const resolution = Number.isFinite(height) && height > 0 ? `${height}p · ` : "";
  return {
    meta: {
      id: seed.imdb, type: "movie", name: seed.name, releaseInfo: seed.year, year: seed.year,
      poster: `https://archive.org/services/img/${seed.archiveId}`,
      background: `https://archive.org/services/img/${seed.archiveId}`,
      description: seed.description,
      sourceNotice: `Copia completa de Internet Archive (${seed.archiveId}), identificada como dominio público en su registro.${caption ? " La pista inglesa ASR corresponde a esta carga, pero es automática y puede tener errores de texto o tiempo." : ""}`,
      sourcePage: `https://archive.org/details/${seed.archiveId}`,
      genres: [...seed.genres], runtime: `${Math.round(Number(video.length) / 60)} min`,
    },
    sources: normalizeStreams(OPEN_FILM_ADDON, [{
      url: base + encodeURIComponent(seed.video), name: `Internet Archive · ${resolution}audio original`,
      title: `${seed.name} (${seed.year}) · ${resolution}copia completa`,
      behaviorHints: { filename: seed.video, videoSize: Number(video.size) },
    }]),
    captions: caption ? [{ id: `archive:${seed.archiveId}:en-asr`, url: base + encodeURIComponent(seed.caption!), lang: "en", addonName: "Internet Archive · ASR de esta copia" }] : [],
  };
}

export async function getOpenFilm(id: string): Promise<OpenFilm | null> {
  if (!openFilmsEnabled()) return null;
  const seed = OPEN_FILM_SEEDS.find((item) => item.imdb === id);
  if (!seed) return null;
  const key = `open-film:v4:${seed.archiveId}`;
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
  const needle = query?.toLowerCase().trim();
  const matching = OPEN_FILM_SEEDS.filter((seed) =>
    !needle || `${seed.name} ${seed.year} ${seed.genres.join(" ")}`.toLowerCase().includes(needle),
  );
  const films = await Promise.all(matching.map((seed) => getOpenFilm(seed.imdb)));
  return films.flatMap((film) => (film ? [film.meta] : []));
}
