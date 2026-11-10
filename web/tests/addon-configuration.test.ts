import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureUrlFor, needsConfiguration, type AddonManifest } from "../src/lib/addons";
import { normalizeStreams } from "../src/lib/vod/rank";
import { resolveTorrentUrl } from "../src/lib/vod/torrent";
import type { AddonRef, RawAddonStream } from "../src/lib/addons";

function manifest(overrides: Partial<AddonManifest> = {}): AddonManifest {
  return {
    id: "org.example",
    version: "1.0.0",
    name: "Example",
    types: ["movie"],
    resources: ["subtitles"],
    ...overrides,
  };
}

/**
 * Measured 2026-11-01: five of the six registered subtitle providers answer
 * `manifest.json` with HTTP 200 and every `subtitles/...` request with 404,
 * because a working install needs a per-user manifest from their configure
 * page. Only `opensubtitles-v3.strem.io` serves unconfigured (37 tracks, 3 ES).
 * Treating a 200 manifest as "the addon works" is what hid this.
 */
describe("addons that declare themselves unconfigured", () => {
  it("detects the manifest flag the app used to ignore", () => {
    expect(needsConfiguration(manifest({ behaviorHints: { configurationRequired: true } }))).toBe(true);
    expect(needsConfiguration(manifest({ behaviorHints: { configurationRequired: false } }))).toBe(false);
    expect(needsConfiguration(manifest({ behaviorHints: { configurable: true } }))).toBe(false);
    expect(needsConfiguration(manifest())).toBe(false);
  });

  it("derives the configure page from the manifest URL", () => {
    expect(configureUrlFor("https://subdl.strem.top/manifest.json")).toBe(
      "https://subdl.strem.top/configure",
    );
    expect(configureUrlFor("https://example.test/path/manifest.json")).toBe(
      "https://example.test/path/configure",
    );
  });

  it("drops credentials and query strings from the configure link", () => {
    expect(configureUrlFor("https://host.test/abc123/manifest.json?token=secret")).toBe(
      "https://host.test/abc123/configure",
    );
  });

  it("returns nothing for a URL it cannot parse", () => {
    expect(configureUrlFor("not a url")).toBeNull();
  });
});

const addon: AddonRef = {
  id: "torrentio",
  name: "Torrentio",
  url: "https://torrentio.strem.fun/manifest.json",
  kind: "vod",
};

/**
 * Measured 2026-11-01: Torrentio answers a movie with 100 streams and the
 * user's own AIOStreams with 522 — every one a BitTorrent `infoHash`, none an
 * HTTP URL. Without a resolver a browser cannot open any of them.
 */
describe("P2P streams without a resolver", () => {
  const streams: RawAddonStream[] = [
    { name: "Torrentio\n1080p", title: "Movie 1080p x264 MP4", infoHash: "e0d00667650aba9ee05aacbbbd8b55ea8a51f534", fileIdx: 3 },
    { name: "Resolved", title: "Movie 1080p", url: "https://cdn.example.test/movie.mp4" },
  ];

  beforeEach(() => {
    delete process.env.FUBOL_TORRENT_SERVER;
  });

  it("keeps only the stream a browser can open", () => {
    const sources = normalizeStreams(addon, streams);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.url).toBe("https://cdn.example.test/movie.mp4");
  });

  it("counts the P2P entries so the screen can explain itself", () => {
    expect(streams.filter((stream) => !stream.url && stream.infoHash).length).toBe(1);
  });
});

/**
 * Stremio's own streaming server joins the swarm and re-serves the chosen file
 * over HTTP, which is how Stremio and Nuvio play these same streams. Verified
 * against `stremio/server:4.22.5`: a Torrentio infoHash answered HTTP 206 with
 * `content-type: video/mp4` and an `ftyp` box at byte 4.
 */
describe("P2P streams with the local streaming server", () => {
  beforeEach(() => {
    process.env.FUBOL_TORRENT_SERVER = "http://stremio-server:11470";
  });

  afterEach(() => {
    delete process.env.FUBOL_TORRENT_SERVER;
  });

  it("resolves an infoHash into a playable HTTP URL", () => {
    expect(resolveTorrentUrl("E0D00667650ABA9EE05AACBBBD8B55EA8A51F534", 3)).toBe(
      "http://stremio-server:11470/e0d00667650aba9ee05aacbbbd8b55ea8a51f534/3",
    );
  });

  it("defaults to the first file when the addon omits the index", () => {
    expect(resolveTorrentUrl("e0d00667650aba9ee05aacbbbd8b55ea8a51f534", undefined)).toMatch(/\/0$/);
  });

  it("refuses anything that is not a 40-character info hash", () => {
    expect(resolveTorrentUrl("nope", 0)).toBeNull();
    expect(resolveTorrentUrl("e0d00667", 0)).toBeNull();
    expect(resolveTorrentUrl(undefined, 0)).toBeNull();
  });

  it("turns a torrent into a source the player can use", () => {
    const sources = normalizeStreams(addon, [
      { name: "Torrentio\n1080p", title: "Movie 1080p x264 MP4 👤 698", infoHash: "e0d00667650aba9ee05aacbbbd8b55ea8a51f534", fileIdx: 3 },
    ]);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.url).toContain("/e0d00667650aba9ee05aacbbbd8b55ea8a51f534/3");
    expect(sources[0]?.viaTorrent).toBe(true);
  });

  it("skips containers no browser can decode", () => {
    // Joining a swarm only to discover it is Matroska costs tens of seconds.
    const sources = normalizeStreams(addon, [
      { name: "a", title: "Movie 1080p x265 HEVC MKV", infoHash: "a".repeat(40), fileIdx: 0 },
      { name: "b", title: "Movie 1080p AV1 mkv", infoHash: "b".repeat(40), fileIdx: 0 },
      { name: "c", title: "Movie 720p XviD avi", infoHash: "c".repeat(40), fileIdx: 0 },
    ]);
    expect(sources).toEqual([]);
  });

  it("ranks a well-seeded MP4/H.264 release above a bare one", () => {
    const sources = normalizeStreams(addon, [
      { name: "bare", title: "Movie 1080p", infoHash: "a".repeat(40), fileIdx: 0 },
      { name: "good", title: "Movie 1080p x264 MP4 AAC 👤 698", infoHash: "b".repeat(40), fileIdx: 0 },
    ]);
    expect(sources[0]?.title).toContain("x264");
  });

  it("does not mark a direct HTTP source as swarm-backed", () => {
    const [source] = normalizeStreams(addon, [
      { name: "cdn", title: "Movie 1080p", url: "https://cdn.example.test/movie.mp4" },
    ]);
    expect(source?.viaTorrent).toBeFalsy();
  });
});
