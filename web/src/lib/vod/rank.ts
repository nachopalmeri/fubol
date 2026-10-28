import type { AddonRef, RawAddonStream } from "../addons";

export interface VodSource {
  id: string;
  addonId: string;
  addonName: string;
  title: string;
  description: string;
  url: string;
  quality: string;
  height: number | null;
  sizeBytes: number | null;
  sizeLabel: string | null;
  cached: boolean;
  hdr: boolean;
  remux: boolean;
  cam: boolean;
  spanish: boolean;
  headers?: Record<string, string>;
  filename?: string;
  score: number;
}

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
};

export function parseSize(label: string): number | null {
  const match = label.match(/([\d.]+)\s*(tb|gb|mb|kb|b)\b/i);
  if (!match?.[1] || !match[2]) return null;
  const unit = SIZE_UNITS[match[2].toLowerCase()];
  if (!unit) return null;
  return Math.round(Number(match[1]) * unit);
}

function detectHeight(text: string): number | null {
  if (/\b(2160p|4k|uhd)\b/i.test(text)) return 2160;
  if (/\b1080p\b/i.test(text)) return 1080;
  if (/\b720p\b/i.test(text)) return 720;
  if (/\b480p\b/i.test(text)) return 480;
  return null;
}

export function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function scoreSource(source: Omit<VodSource, "score">): number {
  let score = 50;
  if (source.height === 1080) score += 40;
  else if (source.height === 2160) score += 32;
  else if (source.height === 720) score += 22;
  else if (source.height === 480) score += 8;
  if (source.cached) score += 35;
  if (source.remux) score += 8;
  if (source.hdr) score += 4;
  if (source.spanish) score += 10;
  if (source.cam) score -= 90;
  if (source.sizeBytes) {
    if (source.sizeBytes > 40 * 1024 ** 3) score -= 8;
    if (source.sizeBytes < 700 * 1024 ** 2 && (source.height ?? 0) >= 1080) score -= 12;
  }
  return Math.round(score);
}

export function normalizeStreams(addon: AddonRef, streams: RawAddonStream[]): VodSource[] {
  const sources: VodSource[] = [];
  for (const [index, stream] of streams.entries()) {
    if (!stream.url) continue;
    const title = stream.title || stream.name || "Fuente";
    const description = stream.description || "";
    const filename = stream.behaviorHints?.filename;
    const haystack = `${title} ${description} ${filename ?? ""}`;
    const height = detectHeight(haystack);
    const sizeBytes = stream.behaviorHints?.videoSize ?? parseSize(description) ?? parseSize(title);
    const base = {
      id: `${addon.id}:${index}:${stream.url.slice(-16)}`,
      addonId: addon.id,
      addonName: addon.name,
      title,
      description,
      url: stream.url,
      quality: height ? `${height}p` : "auto",
      height,
      sizeBytes,
      sizeLabel: formatSize(sizeBytes),
      cached: /⚡|cached|instant|✅|ready/i.test(haystack),
      hdr: /\b(hdr|dolby vision|dovi|dv)\b/i.test(haystack),
      remux: /\bremux|blu-?ray\b/i.test(haystack),
      cam: /\b(cam|hdcam|telesync|telecine|\bts\b)\b/i.test(haystack),
      spanish: /\b(dual|latino|castellano|español|espanol|spanish|vose)\b/i.test(haystack),
      headers: stream.behaviorHints?.proxyHeaders?.request,
      filename,
    };
    sources.push({ ...base, score: scoreSource(base) });
  }
  return sources.sort((a, b) => b.score - a.score);
}

export function dedupeSources(sources: VodSource[]): VodSource[] {
  const seen = new Set<string>();
  const out: VodSource[] = [];
  for (const source of sources) {
    const key = `${source.url.split("?")[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}
