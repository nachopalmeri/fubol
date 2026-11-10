import fs from "node:fs";
import path from "node:path";
import { getAddonSubtitles, type AddonSubtitle } from "../addons";
import { fetchUpstream, mapLimit, UpstreamError, withTimeout } from "../http";
import { sanitizeHeaders } from "../stream-token";
import { shortHash } from "../crypto";
import { subdir } from "../env";
import { detectFormat, decodeSubtitle, toVtt } from "./format";
import { subtitleProviders } from "../vod/service";
import { getOpenFilm } from "../vod/open-films";

export interface SubtitleOption {
  id: string;
  lang: string;
  langLabel: string;
  url: string;
  addonId: string;
  addonName: string;
  forced: boolean;
  note?: string;
}

const LANG_LABELS: Record<string, string> = {
  es: "Español",
  en: "Inglés",
  pt: "Portugués",
  fr: "Francés",
  de: "Alemán",
  it: "Italiano",
  ja: "Japonés",
  ko: "Coreano",
  zh: "Chino",
  ru: "Ruso",
  ar: "Árabe",
  tr: "Turco",
};

export function normalizeLang(raw: string): string {
  const value = raw.toLowerCase().trim();
  if (/^(es|spa|spanish|castellano|latino|es-la|es-es)/.test(value)) return "es";
  if (/^(en|eng|english)/.test(value)) return "en";
  if (/^(pt|por|portugu)/.test(value)) return "pt";
  if (/^(fr|fre|fra)/.test(value)) return "fr";
  if (/^(de|ger|deu)/.test(value)) return "de";
  if (/^(it|ita)/.test(value)) return "it";
  if (/^(ja|jpn)/.test(value)) return "ja";
  if (/^(ko|kor)/.test(value)) return "ko";
  if (/^(zh|chi|zho)/.test(value)) return "zh";
  if (/^(ru|rus)/.test(value)) return "ru";
  return value.slice(0, 5);
}

export function langLabel(lang: string): string {
  return LANG_LABELS[lang] ?? lang.toUpperCase();
}

export async function listSubtitles(
  type: string,
  id: string,
  extra: { filename?: string; videoSize?: number; videoHash?: string } = {},
): Promise<SubtitleOption[]> {
  const providers = await subtitleProviders();
  const results = await mapLimit(providers, 4, async (provider) => {
    try {
      const list: AddonSubtitle[] = await withTimeout(
        getAddonSubtitles(
          { id: provider.addon.id, name: provider.addon.name, url: provider.addon.url, kind: "subs" },
          type,
          id,
          {
            filename: extra.filename,
            videoSize: extra.videoSize,
            videoHash: extra.videoHash,
          },
        ),
        12000,
        "subtítulos lentos",
      );
      return list.map((sub) => {
        const lang = normalizeLang(sub.lang);
        const haystack = `${sub.id} ${sub.lang} ${sub.url}`.toLowerCase();
        return {
          id: sub.id,
          lang,
          langLabel: langLabel(lang),
          url: sub.url,
          addonId: provider.addon.id,
          addonName: provider.addon.name,
          forced: /forced|forzado/.test(haystack),
        } satisfies SubtitleOption;
      });
    } catch {
      return [] as SubtitleOption[];
    }
  });

  const openFilm = type === "movie" ? await getOpenFilm(id) : null;
  const builtIn: SubtitleOption[] = (openFilm?.captions ?? []).map((track) => ({
    id: track.id, lang: track.lang, langLabel: `${langLabel(track.lang)} · automática ASR`,
    url: track.url, addonId: "open-films", addonName: track.addonName, forced: false,
    note: "Transcripción automática vinculada a esta carga; revisar errores y sincronización.",
  }));
  const seen = new Set<string>();
  const merged: SubtitleOption[] = [];
  for (const option of [...builtIn, ...results.flat()]) {
    if (!option.url || seen.has(option.url)) continue;
    seen.add(option.url);
    merged.push(option);
  }

  const langOrder = (lang: string) => (lang === "es" ? 0 : lang === "en" ? 1 : 2);
  return merged
    .sort((a, b) => {
      if (a.forced !== b.forced) return a.forced ? 1 : -1;
      const langDiff = langOrder(a.lang) - langOrder(b.lang);
      if (langDiff !== 0) return langDiff;
      return a.addonName.localeCompare(b.addonName);
    })
    .slice(0, 80);
}

const subCacheDir = () => subdir("subtitles");

/** Fetches a subtitle, normalizes encoding/format, and returns WebVTT. */
export async function fetchSubtitleAsVtt(
  url: string,
  options: { headers?: Record<string, string>; referer?: string } = {},
): Promise<{ vtt: string; cached: boolean; bytes: number }> {
  const key = shortHash(url, 40);
  const file = path.join(subCacheDir(), `${key}.vtt`);
  try {
    const existing = fs.readFileSync(file, "utf8");
    if (existing.startsWith("WEBVTT")) return { vtt: existing, cached: true, bytes: existing.length };
  } catch {
    // miss
  }

  const headers = sanitizeHeaders(options.headers) ?? {};
  if (options.referer) headers.referer = options.referer;
  const { res } = await fetchUpstream(url, { headers, timeoutMs: 15000 });
  if (!res.ok) throw new Error(`El subtítulo respondió ${res.status}`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength > 8_000_000) throw new Error("Subtítulo demasiado grande");
  const text = decodeSubtitle(buffer);
  const vtt = toVtt(text, detectFormat(res.headers.get("content-type") ?? "", url));
  try {
    // Serverless instances get a per-instance /tmp, so this cache is a
    // short-lived optimisation there; a read-only filesystem must not turn a
    // perfectly good subtitle into an error.
    fs.writeFileSync(file, vtt, { mode: 0o600 });
  } catch {
    return { vtt, cached: false, bytes: buffer.byteLength };
  }
  // Keep the cache bounded.
  try {
    const files = fs.readdirSync(subCacheDir());
    if (files.length > 2000) {
      for (const old of files.slice(0, files.length - 1500)) {
        fs.unlinkSync(path.join(subCacheDir(), old));
      }
    }
  } catch {
    // best effort
  }
  return { vtt, cached: false, bytes: buffer.byteLength };
}

export interface AudioSyncResult {
  offsetMs: number;
  confidence: number;
  source: string;
}

/** Optional sidecar (ffsubsync) for audio-based alignment. */
export async function audioSync(
  subtitleUrl: string,
  videoUrl: string,
): Promise<AudioSyncResult> {
  const base = process.env.SUBSYNC_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("Sync por audio no configurado (SUBSYNC_URL)");
  }
  const res = await fetch(`${base}/align`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subtitle_url: subtitleUrl, video_url: videoUrl }),
    // The sidecar has to pull real audio down before it can align anything,
    // and the source is the bottleneck: the same film answered a four-minute
    // window in 23 s once and in 181 s the next time. This is an explicit
    // user action with a spinner, so it gets room instead of a false failure.
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    // Surface what the sidecar said. A bare status turned every cause —
    // unreachable video, no dialogue found, timeout — into "Error interno".
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === "string") detail = body.error;
    } catch {
      // Non-JSON body: the status is all we have.
    }
    throw new UpstreamError(
      detail || `El servicio de sync respondió ${res.status}`,
      res.status === 504 ? 504 : 502,
    );
  }
  const data = (await res.json()) as { offset_seconds?: number; confidence?: number };
  if (typeof data.offset_seconds !== "number") throw new Error("Respuesta de sync inválida");
  return {
    offsetMs: Math.round(data.offset_seconds * 1000),
    confidence: data.confidence ?? 0.5,
    source: "audio",
  };
}
