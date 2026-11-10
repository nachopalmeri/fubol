import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeStreams } from "../src/lib/vod/rank";
import { setTorrentServerBase, torrentResolverEnabled } from "../src/lib/vod/torrent";
import { validateVodSource } from "../src/lib/vod/availability";

/**
 * The addons answer a movie with `infoHash` and no URL. A torrent resolver
 * (Stremio's streaming server) is what turns that into bytes: it joins the
 * swarm and re-serves the file over HTTP with Range support, which is how
 * Stremio and Nuvio play the very same addons. This test pins the contract
 * between the app and that resolver, so pointing the panel at one is enough.
 */

let server: http.Server;
let base: string;
const HASH = "0123456789abcdef0123456789abcdef01234567";
const previousAllowPrivate = process.env.FUBOL_ALLOW_PRIVATE_SOURCES;

beforeAll(async () => {
  // The resolver stands in for a container on the same host, which is exactly
  // the case the SSRF guard blocks unless it is allowed explicitly.
  process.env.FUBOL_ALLOW_PRIVATE_SOURCES = "1";
  server = http.createServer((req, res) => {
    // /{infoHash}/{fileIndex}
    const match = /^\/([0-9a-f]{40})\/(\d+)$/.exec(req.url ?? "");
    if (!match) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const body = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]);
    const range = req.headers.range;
    if (range) {
      res.statusCode = 206;
      res.setHeader("content-range", `bytes 0-${body.length - 1}/${body.length}`);
      res.setHeader("content-type", "video/mp4");
      res.end(body);
      return;
    }
    res.setHeader("content-type", "video/mp4");
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setTorrentServerBase(base);
});

afterAll(async () => {
  setTorrentServerBase(undefined);
  if (previousAllowPrivate === undefined) delete process.env.FUBOL_ALLOW_PRIVATE_SOURCES;
  else process.env.FUBOL_ALLOW_PRIVATE_SOURCES = previousAllowPrivate;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("torrent resolver", () => {
  it("turns an infoHash into a playable HTTP source when a resolver is configured", () => {
    expect(torrentResolverEnabled()).toBe(true);
    const sources = normalizeStreams(
      { id: "torrentio", name: "Torrentio", kind: "vod", url: "https://torrentio.strem.fun/manifest.json" },
      [{ infoHash: HASH, title: "Torrentio 1080p x264 AAC", fileIdx: 0 }],
    );
    expect(sources).toHaveLength(1);
    expect(sources[0]!.url).toBe(`${base}/${HASH}/0`);
    expect(sources[0]!.viaTorrent).toBe(true);
  });

  it("drops releases a browser could never decode", () => {
    const sources = normalizeStreams(
      { id: "torrentio", name: "Torrentio", kind: "vod", url: "https://torrentio.strem.fun/manifest.json" },
      [{ infoHash: HASH, title: "Torrentio 2160p x265 HEVC", fileIdx: 0 }],
    );
    expect(sources).toEqual([]);
  });

  it("drops the torrent entirely when no resolver is configured", () => {
    setTorrentServerBase(undefined);
    expect(torrentResolverEnabled()).toBe(false);
    const sources = normalizeStreams(
      { id: "torrentio", name: "Torrentio", kind: "vod", url: "https://torrentio.strem.fun/manifest.json" },
      [{ infoHash: HASH, title: "Torrentio 1080p x264 AAC", fileIdx: 0 }],
    );
    expect(sources).toEqual([]);
    setTorrentServerBase(base);
  });

  it("accepts the resolver's bytes as a playable container", async () => {
    const sources = normalizeStreams(
      { id: "torrentio", name: "Torrentio", kind: "vod", url: "https://torrentio.strem.fun/manifest.json" },
      [{ infoHash: HASH, title: "Torrentio 1080p x264 AAC", fileIdx: 0 }],
    );
    expect(await validateVodSource(sources[0]!)).toBe("mp4");
  });
});
