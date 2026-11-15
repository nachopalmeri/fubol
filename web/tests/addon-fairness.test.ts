import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddonRef, RawAddonStream } from "../src/lib/addons";
import {
  dedupeSources,
  episodeOf,
  interleaveByAddon,
  namesEpisode,
  normalizeStreams,
} from "../src/lib/vod/rank";
import { resolveTorrentHlsUrl, setTorrentServerBase, torrentKeyOf } from "../src/lib/vod/torrent";

/**
 * Four stream addons are installed and all four answer, but the title page
 * only ever offered the first one's torrents. These tests pin the three
 * things that made the others invisible or wrong: the cut that kept one
 * addon, the session shared by every remuxed title, and the file index.
 */

const hash = (seed: string) => seed.repeat(40).slice(0, 40);
const addon = (id: string): AddonRef => ({ id, name: id, kind: "vod", url: `https://${id}.example/manifest.json` });
const torrent = (seed: string, title: string, fileIdx?: number): RawAddonStream => ({
  infoHash: hash(seed),
  title,
  ...(fileIdx === undefined ? {} : { fileIdx }),
});

beforeEach(() => setTorrentServerBase("https://resolver.example"));
afterEach(() => setTorrentServerBase(undefined));

describe("sources from every addon", () => {
  it("offers each addon instead of only the first one", () => {
    const first = normalizeStreams(
      addon("torrentio"),
      Array.from({ length: 60 }, (_, index) => torrent(index.toString(16).padStart(2, "0"), `Film 1080p x264 mp4 👤 ${900 - index}`, 0)),
    );
    const second = normalizeStreams(addon("comet"), [torrent("c1", "Film 1080p mkv", 0), torrent("c2", "Film 720p mkv", 0)]);
    const third = normalizeStreams(addon("meteor"), [torrent("d1", "Film 1080p mkv", 0)]);

    const offered = interleaveByAddon(dedupeSources([...first, ...second, ...third]), 12);

    expect(offered).toHaveLength(12);
    const counts = new Map<string, number>();
    for (const source of offered) counts.set(source.addonId, (counts.get(source.addonId) ?? 0) + 1);
    expect(counts.get("comet")).toBe(2);
    expect(counts.get("meteor")).toBe(1);
    expect(counts.get("torrentio")).toBe(9);
    // Ordered for the viewer: best first.
    expect(offered.map((source) => source.score)).toEqual([...offered.map((source) => source.score)].sort((a, b) => b - a));
  });

  it("returns everything when there is less than the limit", () => {
    const sources = normalizeStreams(addon("comet"), [torrent("c1", "Film 1080p mkv", 0)]);
    expect(interleaveByAddon(sources, 12)).toHaveLength(1);
    expect(interleaveByAddon([], 12)).toEqual([]);
  });

  it("counts the same torrent once even when two addons list it", () => {
    const fromOne = normalizeStreams(addon("torrentio"), [torrent("ab", "Film 1080p HEVC mkv", 0)]);
    const fromOther = normalizeStreams(addon("comet"), [torrent("ab", "Film.1080p.HEVC.mkv", 0)]);
    expect(dedupeSources([...fromOne, ...fromOther])).toHaveLength(1);
  });

  it("keeps different remuxed releases apart", () => {
    // Both are HLS URLs with the same path shape: the file lives in the query.
    const sources = normalizeStreams(addon("torrentio"), [
      torrent("ab", "Film 1080p HEVC mkv", 0),
      torrent("cd", "Film 2160p HEVC mkv", 0),
    ]);
    expect(sources.every((source) => source.transcoded)).toBe(true);
    expect(dedupeSources(sources)).toHaveLength(2);
  });
});

describe("resolver sessions", () => {
  it("gives every file its own transcoding session", () => {
    const one = resolveTorrentHlsUrl(hash("ab"), 0)!;
    const other = resolveTorrentHlsUrl(hash("cd"), 0)!;
    const session = (url: string) => /\/hlsv2\/([^/]+)\//.exec(url)?.[1];
    expect(session(one)).toBe(`${hash("ab")}-0`);
    expect(session(one)).not.toBe(session(other));
    // Two files of the same torrent are two sessions as well.
    expect(session(resolveTorrentHlsUrl(hash("ab"), 3)!)).toBe(`${hash("ab")}-3`);
  });

  it("asks the server to choose the file when the addon gives no index", () => {
    const url = resolveTorrentHlsUrl(hash("ab"), undefined)!;
    expect(url).toContain(`/hlsv2/${hash("ab")}-auto/`);
    expect(decodeURIComponent(url)).toContain(`/${hash("ab")}/-1&`);
  });

  it("reads the file out of both URL forms", () => {
    expect(torrentKeyOf(`https://resolver.example/${hash("ab")}/2`)).toBe(`${hash("ab")}/2`);
    expect(torrentKeyOf(resolveTorrentHlsUrl(hash("ab"), 2)!)).toBe(`${hash("ab")}/2`);
    expect(torrentKeyOf(resolveTorrentHlsUrl(hash("ab"), undefined)!)).toBe(`${hash("ab")}/-1`);
    expect(torrentKeyOf("https://cdn.example/movie.mp4")).toBeNull();
  });
});

describe("episodes", () => {
  it("reads the episode from an IMDb series id only", () => {
    expect(episodeOf("series", "tt0903747:1:1")).toEqual({ season: 1, episode: 1 });
    expect(episodeOf("movie", "tt0111161")).toBeUndefined();
    expect(episodeOf("series", "kitsu:123:5")).toBeUndefined();
  });

  it("recognises the episode in a release name", () => {
    const ref = { season: 1, episode: 1 };
    expect(namesEpisode("Breaking.Bad.S01E01.Pilot.1080p", ref)).toBe(true);
    expect(namesEpisode("Breaking Bad 1x01 Pilot", ref)).toBe(true);
    expect(namesEpisode("Breaking.Bad.S01E010.1080p", ref)).toBe(false);
    expect(namesEpisode("Breaking.Bad.S01E11.1080p", ref)).toBe(false);
    expect(namesEpisode("Breaking Bad COMPLETE S01-S05 2160p", ref)).toBe(false);
  });

  it("leaves out a season pack that cannot be pointed at the episode", () => {
    const sources = normalizeStreams(
      addon("mediafusion"),
      [
        torrent("a1", "Breaking Bad COMPLETE S01-S05 2160p WEB-DL x264"),
        torrent("a2", "Breaking.Bad.S01E01.Pilot.1080p.x264.mp4"),
        torrent("a3", "Breaking Bad Season 1 1080p x264", 4),
      ],
      { episode: { season: 1, episode: 1 } },
    );
    expect(sources.map((source) => source.title)).toEqual(
      expect.arrayContaining(["Breaking.Bad.S01E01.Pilot.1080p.x264.mp4", "Breaking Bad Season 1 1080p x264"]),
    );
    expect(sources).toHaveLength(2);
  });

  it("keeps a movie without a file index", () => {
    const [source] = normalizeStreams(addon("mediafusion"), [torrent("a1", "Film 1994 1080p x264 mp4")]);
    expect(source?.url).toBe(`https://resolver.example/${hash("a1")}/-1`);
  });
});
