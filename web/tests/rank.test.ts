import { describe, expect, it } from "vitest";
import {
  failureCount,
  latencyLabel,
  noteFailure,
  noteSuccess,
  rankProbes,
  scoreProbe,
} from "../src/lib/live/rank";
import {
  dedupeSources,
  formatSize,
  normalizeStreams,
  parseSize,
} from "../src/lib/vod/rank";
import type { AddonRef, RawAddonStream } from "../src/lib/addons";

const baseProbe = {
  ok: true,
  ttfbMs: 120,
  edgeAgeS: 3,
  height: 1080,
  live: true,
  kind: "hls" as const,
};

describe("live ranking", () => {
  it("scores a fast 1080p live source high", () => {
    const score = scoreProbe(baseProbe);
    expect(score).toBeGreaterThan(70);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("never lets a dead source win", () => {
    expect(scoreProbe({ ...baseProbe, ok: false })).toBe(0);
  });

  it("prefers low latency over resolution", () => {
    const fast720 = scoreProbe({ ...baseProbe, height: 720, ttfbMs: 60, edgeAgeS: 2 });
    const slow4k = scoreProbe({ ...baseProbe, height: 2160, ttfbMs: 900, edgeAgeS: 40 });
    expect(fast720).toBeGreaterThan(slow4k);
  });

  it("penalizes repeated failures", () => {
    expect(scoreProbe(baseProbe, 3)).toBeLessThan(scoreProbe(baseProbe, 0));
  });

  it("sorts probes by score", () => {
    const ranked = rankProbes([
      { probe: { ...baseProbe, score: 10 } },
      { probe: { ...baseProbe, score: 90 } },
      { probe: { ...baseProbe, score: 50 } },
    ]);
    expect(ranked.map((item) => item.probe.score)).toEqual([90, 50, 10]);
  });

  it("tracks and decays failures", () => {
    const url = "https://fubol.test/decay.m3u8";
    expect(failureCount(url)).toBe(0);
    noteFailure(url);
    noteFailure(url);
    expect(failureCount(url)).toBe(2);
    noteSuccess(url);
    expect(failureCount(url)).toBe(1);
    noteSuccess(url);
    expect(failureCount(url)).toBe(0);
  });

  it("labels latency", () => {
    expect(latencyLabel(null)).toContain("desconocida");
    expect(latencyLabel(4)).toContain("~4 s");
    expect(latencyLabel(20)).toContain("detrás del vivo");
  });
});

const addon: AddonRef = {
  id: "addon1",
  name: "Addon de prueba",
  url: "https://addon.example/manifest.json",
  kind: "vod",
};

describe("VOD normalization", () => {
  it("orders cached 1080p Spanish sources first and drops CAM", () => {
    const streams: RawAddonStream[] = [
      { url: "https://cdn.example/cam.mp4", title: "Película 1080p HDCAM", name: "CAM" },
      {
        url: "https://cdn.example/good.mkv",
        name: "1080p",
        title: "Película 1080p",
        description: "⚡ cached · dual latino · 4.2 GB",
        behaviorHints: { videoSize: 4_500_000_000 },
      },
      { url: "https://cdn.example/720.mp4", title: "Película 720p" },
      { title: "sin url" },
    ];
    const sources = normalizeStreams(addon, streams);
    expect(sources).toHaveLength(3);
    expect(sources[0]?.url).toBe("https://cdn.example/good.mkv");
    expect(sources[0]?.quality).toBe("1080p");
    expect(sources[0]?.cached).toBe(true);
    expect(sources[0]?.spanish).toBe(true);
    expect(sources[0]?.sizeLabel).toBe("4.2 GB");
    expect(sources.at(-1)?.cam).toBe(true);
    expect(sources.at(-1)?.score).toBeLessThan(sources[0]?.score ?? 0);
  });

  it("dedupes by path and keeps the best-ranked duplicate", () => {
    const sources = normalizeStreams(addon, [
      { url: "https://cdn.example/movie.mp4?token=a", title: "1080p" },
      { url: "https://cdn.example/movie.mp4?token=b", title: "720p" },
      { url: "https://cdn.example/other.mp4", title: "720p" },
    ]);
    const deduped = dedupeSources(sources);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.url).toContain("token=a");
  });

  it("parses and formats sizes", () => {
    expect(parseSize("1.5 GB")).toBe(Math.round(1.5 * 1024 ** 3));
    expect(parseSize("700 mb")).toBe(700 * 1024 ** 2);
    expect(parseSize("unknown")).toBeNull();
    expect(formatSize(2 * 1024 ** 3)).toBe("2.0 GB");
    expect(formatSize(500 * 1024 ** 2)).toBe("500 MB");
    expect(formatSize(null)).toBeNull();
  });

  it("detects HDR and remux hints", () => {
    const [source] = normalizeStreams(addon, [
      { url: "https://cdn.example/movie.mkv", title: "1080p REMUX HDR" },
    ]);
    expect(source?.remux).toBe(true);
    expect(source?.hdr).toBe(true);
  });
});
