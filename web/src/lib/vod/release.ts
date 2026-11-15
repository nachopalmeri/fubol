/**
 * What a person needs to know about a release, read out of its name.
 *
 * Addons describe a torrent in their own dialect: "[TORRENT🧲] Comet 1080p",
 * a filename on the next line, emoji for seeders and size, the addon's own
 * name repeated. The source list showed that verbatim, so three different
 * copies of the same film all read "Comet 1080p". This turns the name into
 * the few facts that decide which copy to pick: where it came from (BluRay,
 * WEB), how it is encoded, the languages it carries and how many people
 * share it.
 */

export interface ReleaseInfo {
  /** The release name to show: the filename when there is one. */
  name: string;
  /** Short, ordered facts: origin, codec, audio. */
  tags: string[];
  /** Spoken languages the name mentions, as display labels. */
  languages: string[];
  /** People sharing the torrent, when the addon says so. */
  seeders: number | null;
}

const ORIGINS: [RegExp, string][] = [
  [/\bremux\b/i, "REMUX"],
  [/\b(blu-?ray|bdrip|brrip|bdremux|bd)\b/i, "BluRay"],
  [/\bweb-?dl\b/i, "WEB-DL"],
  [/\bweb-?rip\b/i, "WEBRip"],
  [/\bhdtv\b/i, "HDTV"],
  [/\b(dvd-?rip|dvd)\b/i, "DVD"],
];

const CODECS: [RegExp, string][] = [
  [/\b(x265|h\.?265|hevc)\b/i, "HEVC"],
  [/\bav1\b/i, "AV1"],
  [/\b(x264|h\.?264|avc)\b/i, "H.264"],
];

const AUDIO: [RegExp, string][] = [
  [/\batmos\b/i, "Atmos"],
  [/\b(truehd)\b/i, "TrueHD"],
  [/\bdts[-.\s]?hd\b/i, "DTS-HD"],
  [/\bdts\b/i, "DTS"],
  [/\b(ddp|e-?ac-?3|dd\+)/i, "DD+"],
  [/\b(ac-?3|dd5|dd2|dolby digital)\b/i, "AC3"],
  [/\baac\b/i, "AAC"],
];

const LANGUAGES: [RegExp, string][] = [
  [/\b(latino|lat|spanish latin)\b|🇲🇽|🇦🇷/i, "Latino"],
  [/\b(castellano|cast|spa|spanish|español|espanol)\b|🇪🇸/i, "Español"],
  [/\b(dual)\b/i, "Dual"],
  [/\b(multi)\b/i, "Multi"],
  [/\b(eng|english)\b|🇬🇧|🇺🇸/i, "Inglés"],
];

/** Strips the addon's own branding and decoration from a line. */
function cleanLine(line: string): string {
  return line
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/\b(torrentio|comet|meteor|mediafusion|midnight|p2p)\b/gi, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(text: string, table: [RegExp, string][]): string | null {
  for (const [pattern, label] of table) if (pattern.test(text)) return label;
  return null;
}

export function readRelease(input: {
  title?: string;
  description?: string;
  filename?: string;
  seeders?: number;
}): ReleaseInfo {
  const text = [input.title, input.description, input.filename].filter(Boolean).join("\n");

  // The filename is the most faithful name; otherwise the longest line that
  // still reads like a release once the decoration is gone.
  const candidates = [input.filename, ...text.split("\n")]
    .filter((line): line is string => Boolean(line))
    .map(cleanLine)
    .filter((line) => line.length >= 6 && !/^\d+(\.\d+)?\s*(gb|mb)\b/i.test(line) && /[a-z]{3}/i.test(line));
  const name = (input.filename ? cleanLine(input.filename) : candidates.sort((a, b) => b.length - a.length)[0]) ?? "";

  const tags = [firstMatch(text, ORIGINS), firstMatch(text, CODECS), firstMatch(text, AUDIO)].filter(
    (tag): tag is string => Boolean(tag),
  );
  if (/\b(hdr10\+?|hdr|dolby vision|dovi|\bdv\b)\b/i.test(text)) tags.push("HDR");

  const languages: string[] = [];
  for (const [pattern, label] of LANGUAGES) {
    if (pattern.test(text) && !languages.includes(label)) languages.push(label);
  }

  let seeders: number | null = typeof input.seeders === "number" && input.seeders >= 0 ? input.seeders : null;
  if (seeders === null) {
    const stated = /👤\s*(\d+)/u.exec(text) ?? /\bseed(?:er)?s?\s*[:=]?\s*(\d+)/i.exec(text);
    if (stated?.[1]) seeders = Number(stated[1]);
  }

  return { name: name.replace(/\.(mkv|mp4|avi|m4v|webm)$/i, ""), tags, languages, seeders };
}

/** "Torrentio (P2P; requiere resolver para web)" → "Torrentio". */
export function shortAddonName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}
