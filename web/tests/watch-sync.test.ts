import { describe, expect, it } from "vitest";
import { readRelease, shortAddonName } from "../src/lib/vod/release";
import { consensusOffset } from "../src/lib/subs/consensus";
import { describeSync, formatShift } from "../src/lib/subs/describe";
import { alignmentsFor, clearManualSync, getSync, setSync, syncKey } from "../src/lib/state/sync";
import { normalizeStreams } from "../src/lib/vod/rank";
import { setTorrentServerBase } from "../src/lib/vod/torrent";

const estimate = (offsetMs: number, confidence: number) => ({ offsetMs, confidence, score: 0.5, overlapSeconds: 7000 });

describe("release names", () => {
  it("reads what matters out of an addon's decorated name", () => {
    const info = readRelease({
      title: "[TORRENT🧲] Comet 1080p",
      description: "📄 The.Shawshank.Redemption.1994.1080p.BluRay.x264.DTS-HD.MA.5.1-LATINO.mkv\n💾 2.7 GB 🔎 DMM",
      filename: "The.Shawshank.Redemption.1994.1080p.BluRay.x264.DTS-HD.MA.5.1-LATINO.mkv",
    });
    expect(info.name).toBe("The.Shawshank.Redemption.1994.1080p.BluRay.x264.DTS-HD.MA.5.1-LATINO");
    expect(info.tags).toEqual(["BluRay", "H.264", "DTS-HD"]);
    expect(info.languages).toContain("Latino");
    expect(info.seeders).toBeNull();
  });

  it("takes seeders from the text or from the addon's own field", () => {
    expect(readRelease({ title: "Film 1080p\n👤 34 💾 2 GB" }).seeders).toBe(34);
    expect(readRelease({ title: "Film", seeders: 0 }).seeders).toBe(0);
  });

  it("drops the explanation from an addon name", () => {
    expect(shortAddonName("Torrentio (P2P; requiere resolver para web)")).toBe("Torrentio");
    expect(shortAddonName("Comet")).toBe("Comet");
  });
});

describe("sources", () => {
  it("keep the same id across visits even when the addon reorders them", () => {
    setTorrentServerBase("https://resolver.example");
    const hash = "ab".repeat(20);
    const other = "cd".repeat(20);
    const addon = { id: "comet", name: "Comet", kind: "vod" as const, url: "https://comet.example/manifest.json" };
    const first = normalizeStreams(addon, [{ infoHash: other, fileIdx: 0, title: "B 720p mp4" }, { infoHash: hash, fileIdx: 1, title: "A 1080p mp4" }]);
    const later = normalizeStreams(addon, [{ infoHash: hash, fileIdx: 1, title: "A 1080p mp4" }]);
    const id = (list: typeof first) => list.find((source) => source.copyId === `${hash}/1`)?.id;
    expect(id(first)).toBe(`comet:${hash}/1`);
    expect(id(later)).toBe(id(first));
    setTorrentServerBase(undefined);
  });

  it("put a swarm nobody shares at the end", () => {
    setTorrentServerBase("https://resolver.example");
    const addon = { id: "meteor", name: "Meteor", kind: "vod" as const, url: "https://meteor.example/manifest.json" };
    const sources = normalizeStreams(addon, [
      { infoHash: "ab".repeat(20), fileIdx: 0, title: "Film 1080p x264 mp4", behaviorHints: { seeders: 0 } },
      { infoHash: "cd".repeat(20), fileIdx: 0, title: "Film 720p x264 mp4", behaviorHints: { seeders: 40 } },
    ]);
    expect(sources[0]?.seeders).toBe(40);
    expect(sources.at(-1)?.seeders).toBe(0);
    setTorrentServerBase(undefined);
  });
});

describe("consensus between tracks", () => {
  it("keeps the shift most references agree on", () => {
    const result = consensusOffset([estimate(-1200, 0.7), estimate(-1300, 0.6), estimate(8000, 0.8), estimate(-1100, 0.5)]);
    expect(result.offsetMs).toBe(-1200);
    expect(result.agreeing).toBe(3);
    expect(result.compared).toBe(4);
  });

  it("is less sure with a single reference than with several that agree", () => {
    const alone = consensusOffset([estimate(500, 0.8)]);
    const several = consensusOffset([estimate(500, 0.8), estimate(600, 0.8), estimate(400, 0.8)]);
    expect(several.confidence).toBeGreaterThan(alone.confidence);
  });

  it("does not move anything when no comparison was usable", () => {
    expect(consensusOffset([estimate(4000, 0.05)])).toMatchObject({ offsetMs: 0, confidence: 0, agreeing: 0 });
    expect(consensusOffset([])).toMatchObject({ offsetMs: 0, agreeing: 0 });
  });
});

describe("alignment kept per copy and per track", () => {
  it("keeps tracks of the same copy apart", async () => {
    await setSync("tt-sync", "copy-1", { offsetMs: -800, confidence: 0.4, source: "audio" }, "subdl:es");
    expect(await getSync("tt-sync", "copy-1", "subdl:en")).toBeNull();
    expect((await getSync("tt-sync", "copy-1", "subdl:es"))?.offsetMs).toBe(-800);
    expect(syncKey("tt", "c", "t")).toBe("tt:c:t");
  });

  it("never lets a measurement overwrite a hand adjustment", async () => {
    await setSync("tt-sync", "copy-2", { offsetMs: 1500, confidence: 1, source: "manual" }, "os:es");
    const kept = await setSync("tt-sync", "copy-2", { offsetMs: -300, confidence: 0.6, source: "audio" }, "os:es");
    expect(kept.source).toBe("manual");
    expect(kept.offsetMs).toBe(1500);
    await clearManualSync("tt-sync", "copy-2", "os:es");
    expect(await getSync("tt-sync", "copy-2", "os:es")).toBeNull();
  });

  it("does not let a track comparison replace an audio measurement", async () => {
    await setSync("tt-sync", "copy-3", { offsetMs: -2000, confidence: 0.3, source: "audio" }, "os:en");
    const kept = await setSync("tt-sync", "copy-3", { offsetMs: 0, confidence: 0.9, source: "reference" }, "os:en");
    expect(kept.source).toBe("audio");
  });

  it("lists what is known for a title so every screen starts aligned", async () => {
    const known = await alignmentsFor("tt-sync");
    expect(known).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ copy: "copy-1", track: "subdl:es", offsetMs: -800, method: "audio" }),
        expect.objectContaining({ copy: "copy-3", track: "os:en", method: "audio" }),
      ]),
    );
    expect(known.some((item) => item.copy === "copy-2")).toBe(false);
  });
});

describe("sync wording", () => {
  it("speaks in plain terms", () => {
    expect(formatShift(-1200)).toBe("1,2 s antes");
    expect(formatShift(400)).toBe("0,4 s más tarde");
    expect(describeSync("audio", null, -1200)).toBe("Alineado con el audio de esta copia · 1,2 s antes");
    expect(describeSync("reference", "audio", 0)).toContain("midiendo contra el audio");
    expect(describeSync("none", "reference", 0)).toBe("Comparando con otras pistas…");
  });
});

describe("release names in the list", async () => {
  const { distinctReleaseName } = await import("../src/components/VodWatch");
  it("drops the part every row shares", () => {
    expect(distinctReleaseName("The.Shawshank.Redemption.1994.REMASTERED.1080p.BluRay.H264.AAC-LAMA", "The Shawshank Redemption")).toBe(
      "REMASTERED 1080p BluRay H264 AAC-LAMA",
    );
    expect(distinctReleaseName("Breaking.Bad.S01E01.Pilot.1080p.BluRay.x264", "Breaking Bad")).toBe("S01E01 Pilot 1080p BluRay x264");
  });
  it("keeps names that do not start with the title", () => {
    expect(distinctReleaseName("Um.Sonho.De.Liberdade.1994.1080p.BluRay.x264.DUAL-SF", "The Shawshank Redemption")).toBe(
      "Um Sonho De Liberdade 1994 1080p BluRay x264 DUAL-SF",
    );
  });
});

describe("audio measurements", async () => {
  const { audioIsUsable } = await import("../src/lib/subs/consensus");
  it("uses a measurement with enough audio behind it, even against the tracks", () => {
    // Five tracks agreed with each other at 0 and were all 12.8 s early
    // against a remastered copy: the audio was right.
    expect(audioIsUsable({ offsetMs: 12_830, confidence: 0.31 })).toBe(true);
  });
  it("ignores one with too little audio or out of range", () => {
    expect(audioIsUsable({ offsetMs: 2000, confidence: 0.1 })).toBe(false);
    expect(audioIsUsable({ offsetMs: 200_000, confidence: 0.5 })).toBe(false);
  });
});

describe("a copy's shift is shared by its tracks", () => {
  it("is kept apart from the per-track list", async () => {
    const { COPY_TRACK } = await import("../src/lib/state/sync");
    await setSync("tt-copy", "copy-a", { offsetMs: 12_800, confidence: 0.31, source: "audio" }, COPY_TRACK);
    await setSync("tt-copy", "copy-a", { offsetMs: 12_700, confidence: 0.31, source: "audio" }, "os:es");
    const listed = await alignmentsFor("tt-copy");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.track).toBe("os:es");
    expect((await getSync("tt-copy", "copy-a", COPY_TRACK))?.offsetMs).toBe(12_800);
  });
});
