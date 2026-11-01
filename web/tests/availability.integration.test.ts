import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { availableMeta, filterAvailable, validateVodSource } from "../src/lib/vod/availability";
import { normalizeStreams } from "../src/lib/vod/rank";
import { addAddon } from "../src/lib/vod/store";
import { getHomeRows, searchVod, getPlayableVodStreams } from "../src/lib/vod/service";

let server: http.Server;
let base: string;
const previous = process.env.FUBOL_ALLOW_PRIVATE_SOURCES;
const metas = ["available", "p2p", "html", "mkv"].map((id) => ({ id, type: "movie", name: `Movie ${id}` }));

beforeAll(async () => {
  process.env.FUBOL_ALLOW_PRIVATE_SOURCES = "1";
  server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/manifest.json") {
      res.end(JSON.stringify({ id: "availability.fixture", name: "Availability fixture", version: "1", types: ["movie"], resources: ["catalog", "stream"], catalogs: [{ id: "movies", name: "Fixture", type: "movie", extra: [{ name: "search" }] }] }));
    } else if (req.url?.startsWith("/catalog/")) {
      const list = req.url.includes("Refill")
        ? [...Array.from({ length: 48 }, (_, index) => ({ id: `missing-${index}`, type: "movie", name: `Missing ${index}` })), metas[0]]
        : metas;
      res.end(JSON.stringify({ metas: list }));
    } else if (req.url?.startsWith("/stream/")) {
      const id = req.url.split("/").pop()?.replace(".json", "");
      res.end(JSON.stringify({ streams: id === "p2p" ? [{ infoHash: "abc", title: "P2P" }] : [{ url: `${base}/${id === "available" ? "video.mp4" : id === "html" ? "fake.mp4" : "video.mkv"}` }] }));
    } else if (req.url === "/video.mp4") {
      res.setHeader("content-type", "video/mp4");
      res.end(Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]));
    } else if (req.url === "/video.mkv") {
      res.setHeader("content-type", "video/x-matroska");
      res.end(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    } else {
      // A deceptive extension AND MIME must not turn HTML into a movie.
      res.setHeader("content-type", "video/mp4");
      res.end("<!doctype html><html>Not a movie</html>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await addAddon({ url: `${base}/manifest.json`, kind: "vod" });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (previous === undefined) delete process.env.FUBOL_ALLOW_PRIVATE_SOURCES;
  else process.env.FUBOL_ALLOW_PRIVATE_SOURCES = previous;
});

describe("availability-first browsing", () => {
  it("hides P2P, HTML gates and unsupported MKV from search", async () => {
    expect((await searchVod("Movie")).map((item) => item.meta.id)).toEqual(["available"]);
  });
  it("does not advertise unavailable titles on browse rails", async () => {
    const rows = await getHomeRows();
    expect(rows.flatMap((row) => row.metas.map((meta) => meta.id))).toEqual(["available"]);
  });
  it("refills search beyond the first 48 metadata candidates", async () => {
    expect((await searchVod("Refill")).map((item) => item.meta.id)).toEqual(["available"]);
  });
  it("checks the source container rather than a manifest or URL extension", async () => {
    const source = normalizeStreams({ id: "test", name: "Test", kind: "vod", url: `${base}/manifest.json` }, [{ url: `${base}/fake.mp4` }])[0]!;
    expect(await validateVodSource(source)).toBeNull();
    expect((await getPlayableVodStreams("movie", "html")).sources).toEqual([]);
  });
  it("validates an actual episode, not the series id or an unreleased episode", async () => {
    const calls: string[] = [];
    const source = normalizeStreams({ id: "test", name: "Test", kind: "vod", url: `${base}/manifest.json` }, [{ url: `${base}/video.mp4` }]);
    const result = await availableMeta({ id: "series-test", name: "Series", type: "series" }, "fixture", {
      meta: async () => ({ id: "series-test", name: "Series", type: "series", videos: [
        { id: "future", season: 1, episode: 1, released: "2099-01-01" },
        { id: "released-episode", season: 1, episode: 2, released: "2020-01-01" },
      ] }),
      streams: async (_type, id) => { calls.push(id); return { sources: source }; },
    });
    expect(calls).toEqual(["released-episode"]);
    expect(result?.playableId).toBe("released-episode");
  });
  it("fails closed on unavailable episode metadata", async () => {
    const result = await availableMeta({ id: "unknown-series", name: "Unknown", type: "series" }, "fixture", {
      meta: async () => null, streams: async () => ({ sources: [] }),
    });
    expect(result).toBeNull();
  });
  it("bounds a cold availability sweep by a global deadline", async () => {
    const started = Date.now();
    const result = await filterAvailable(
      Array.from({ length: 24 }, (_, index) => ({ id: `slow-${index}`, type: "movie", name: `Slow ${index}` })),
      "deadline-fixture",
      {
        meta: async () => null,
        streams: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return { sources: [] };
        },
      },
      250,
    );
    expect(result).toEqual([]);
    expect(Date.now() - started).toBeLessThan(3000);
  });
  it("finds a playable third released episode when earlier episodes have no source", async () => {
    const calls: string[] = [];
    const sources = normalizeStreams({ id: "test", name: "Test", kind: "vod", url: `${base}/manifest.json` }, [{ url: `${base}/video.mp4` }]);
    const result = await availableMeta({ id: "third-episode-series", name: "Series", type: "series" }, "fixture", {
      meta: async () => ({ id: "third-episode-series", name: "Series", type: "series", videos: [1, 2, 3].map((episode) => ({ id: `ep-${episode}`, season: 1, episode, released: "2020-01-01" })) }),
      streams: async (_type, id) => { calls.push(id); return { sources: id === "ep-3" ? sources : [] }; },
    });
    expect(calls).toEqual(["ep-1", "ep-2", "ep-3"]);
    expect(result?.playableId).toBe("ep-3");
  });
});
