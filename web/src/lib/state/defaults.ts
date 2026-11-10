import type { StateDoc } from "./types";

/**
 * What a brand-new deployment starts with.
 *
 * The addons and live sources below are the ones verified against the real
 * providers in `audit/16_WEB_ACCEPTANCE.md`: the four catalog/subtitle addons
 * that answer anonymously, Torrentio (P2P, kept visible so the player can
 * explain why it needs a debrid key) and the two Sports Streams catalogs.
 * Nothing here needs a credential, so a fresh install is usable immediately.
 */
export const DEFAULT_ADDONS: { id: string; url: string; name: string; kind: StateDoc["addons"][number]["kind"] }[] = [
  { id: "cinemeta", url: "https://v3-cinemeta.strem.io/manifest.json", name: "Cinemeta", kind: "meta" },
  { id: "ee1c928e0c06", url: "https://aiometadata.elfhosted.com/manifest.json", name: "AIO Metadata", kind: "meta" },
  { id: "11186684a75f", url: "https://tmdb.elfhosted.com/manifest.json", name: "TMDB Addon", kind: "meta" },
  {
    id: "2466b9bfe76c",
    url: "https://opensubtitles-v3.strem.io/manifest.json",
    name: "OpenSubtitles v3",
    kind: "subs",
  },
  {
    id: "fc62801e6df7",
    url: "https://opensubtitlesv3-pro.dexter21767.com/manifest.json",
    name: "OpenSubtitles PRO",
    kind: "subs",
  },
  { id: "3709f04b38f5", url: "https://subsource.strem.top/manifest.json", name: "SubSource", kind: "subs" },
  { id: "36358d92715e", url: "https://subdl.strem.top/manifest.json", name: "SubDL", kind: "subs" },
  {
    id: "1a17aec7b995",
    url: "https://stremio-community-subtitles.top/manifest.json",
    name: "Stremio Community Subtitles",
    kind: "subs",
  },
  { id: "c89c60685642", url: "https://subsense.nepiraw.com/manifest.json", name: "SubSense", kind: "subs" },
  {
    id: "e6e87eac0902",
    url: "https://torrentio.strem.fun/manifest.json",
    name: "Torrentio (P2P; requiere resolver para web)",
    kind: "vod",
  },
];

export const DEFAULT_SOURCES: {
  id: string;
  kind: StateDoc["sources"][number]["kind"];
  name: string;
  url: string;
  config: Record<string, unknown>;
  priority: number;
}[] = [
  {
    id: "sports-streams-football",
    kind: "addon",
    name: "Sports Streams · Fútbol",
    // The encoded segment is the addon's own `{"hideTip":true}` configuration.
    url: "https://sports.highfly.dev/eyJoaWRlVGlwIjp0cnVlfQ/manifest.json",
    config: { catalogId: "sports_football", catalogType: "sport" },
    priority: 10,
  },
  {
    id: "sports-streams-live",
    kind: "addon",
    name: "Sports Streams · En vivo",
    url: "https://sports.highfly.dev/eyJoaWRlVGlwIjp0cnVlfQ/manifest.json",
    config: { catalogId: "sports_live", catalogType: "sport" },
    priority: 20,
  },
  {
    id: "a9edaf589662",
    kind: "hls",
    name: "Demo técnica · Big Buck Bunny (no es TV)",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    config: {},
    priority: 100,
  },
];
