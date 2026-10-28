import { shortHash } from "../crypto";
import type { Channel } from "./types";

export interface M3uEntry {
  name: string;
  url: string;
  group: string;
  logo?: string;
  tvgId?: string;
  attrs: Record<string, string>;
  headers: Record<string, string>;
  drm: boolean;
}

/** Splits `#EXTINF` attributes from the display name at the first unquoted comma. */
function splitExtinf(line: string): { attrs: string; name: string } {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      return { attrs: line.slice(0, i), name: line.slice(i + 1).trim() };
    }
  }
  return { attrs: line, name: "" };
}

export function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"|([a-zA-Z0-9_-]+)\s*=\s*([^\s"]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const key = (match[1] ?? match[3] ?? "").toLowerCase();
    const value = match[2] ?? match[4] ?? "";
    if (key) attrs[key] = value;
  }
  return attrs;
}

/**
 * Parses the subset of M3U/M3U8 that IPTV providers use. Playlists with DRM
 * (`#KODIPROP:inputstream.adaptive.license_type`) are kept but flagged: the
 * browser cannot play them without a key we do not have.
 */
export function parseM3u(text: string): M3uEntry[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const entries: M3uEntry[] = [];
  let attrs: Record<string, string> = {};
  let name = "";
  let group = "";
  let logo: string | undefined;
  let tvgId: string | undefined;
  let pendingHeaders: Record<string, string> = {};
  let drm = false;

  const reset = () => {
    attrs = {};
    name = "";
    group = "";
    logo = undefined;
    tvgId = undefined;
    pendingHeaders = {};
    drm = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#EXTM3U")) continue;

    if (line.startsWith("#EXTINF:")) {
      const withoutTag = line.slice("#EXTINF:".length);
      const { attrs: attrPart, name: display } = splitExtinf(withoutTag);
      attrs = parseAttributes(attrPart);
      name = display;
      group = attrs["group-title"] ?? group;
      logo = attrs["tvg-logo"];
      tvgId = attrs["tvg-id"];
      continue;
    }

    if (line.startsWith("#EXTGRP:")) {
      group = line.slice("#EXTGRP:".length).trim();
      continue;
    }

    if (line.startsWith("#EXTVLCOPT:")) {
      const opt = line.slice("#EXTVLCOPT:".length);
      const [key, ...rest] = opt.split("=");
      const value = rest.join("=").trim();
      if (key === "http-user-agent") pendingHeaders["user-agent"] = value;
      if (key === "http-referrer" || key === "http-referer") pendingHeaders.referer = value;
      continue;
    }

    if (line.startsWith("#KODIPROP:")) {
      if (/license|drm/i.test(line)) drm = true;
      continue;
    }

    if (line.startsWith("#")) continue;

    if (/^https?:\/\//i.test(line)) {
      entries.push({
        name: name || line.split("/").pop() || "Canal",
        url: line,
        group: group || "Sin categoría",
        logo,
        tvgId,
        attrs,
        headers: pendingHeaders,
        drm,
      });
      reset();
    }
  }

  return entries;
}

export function m3uChannelId(sourceId: string, entry: Pick<M3uEntry, "tvgId" | "name" | "url">): string {
  return shortHash(`${sourceId}|${entry.tvgId ?? ""}|${entry.name}|${entry.url}`, 16);
}

export function entriesToChannels(
  entries: M3uEntry[],
  source: { id: string; name: string },
): Channel[] {
  const seen = new Set<string>();
  const channels: Channel[] = [];
  for (const entry of entries) {
    if (entry.drm) continue;
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    channels.push({
      id: m3uChannelId(source.id, entry),
      name: entry.name,
      group: entry.group,
      logo: entry.logo,
      tvgId: entry.tvgId,
      sourceId: source.id,
      sourceName: source.name,
      kind: "m3u",
      urls: [entry.url],
      headers: Object.keys(entry.headers).length ? entry.headers : undefined,
    });
  }
  return channels;
}
