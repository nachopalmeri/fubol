import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildRelayArgs,
  nextStartNumber,
  RELAY_MIN_READY_SEGMENTS,
  relayContentType,
  relayFileName,
  relayHeight,
  relayKey,
  waitForRelayFile,
} from "../src/lib/live/relay";
import { signRelayUrl, verifyStreamToken } from "../src/lib/stream-token";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fubol-relay-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("local compatibility relay", () => {
  it("accepts only the exact playlist, init and segment names", () => {
    expect(relayFileName(undefined)).toBe("index.m3u8");
    expect(relayFileName("index.m3u8")).toBe("index.m3u8");
    expect(relayFileName("init.mp4")).toBe("init.mp4");
    expect(relayFileName("seg00042.m4s")).toBe("seg00042.m4s");
    for (const name of ["../index.m3u8", "seg1.m4s", "index.m3u8/../x", "init.mp4?x", "other.ts"]) {
      expect(relayFileName(name)).toBeNull();
    }
  });

  it("clamps requested heights to supported values", () => {
    expect(relayHeight(480)).toBe(480);
    expect(relayHeight("720")).toBe(720);
    expect(relayHeight(1080)).toBe(1080);
    expect(relayHeight(9999)).toBe(720);
    expect(relayHeight(undefined)).toBe(720);
  });

  it("returns web media types for every relayed file", () => {
    expect(relayContentType("index.m3u8")).toContain("mpegurl");
    expect(relayContentType("init.mp4")).toBe("video/mp4");
    expect(relayContentType("seg00001.m4s")).toBe("video/mp4");
  });

  it("re-encodes to H.264/AAC fMP4 with one-second segments and no shell string", () => {
    const args = buildRelayArgs({
      url: "https://example.test/live.m3u8",
      dir: "D:/data/relay/key",
      height: 720,
      headers: { referer: "https://example.test/" },
    });
    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args).toContain("fmp4");
    expect(args).toContain("-hls_time");
    expect(args[args.indexOf("-hls_time") + 1]).toBe("1");
    expect(args[args.indexOf("-hls_flags") + 1]).toContain("temp_file");
    expect(args[args.indexOf("-i") + 1]).toBe("https://example.test/live.m3u8");
    expect(args).toContain("scale=-2:720");
    expect(args.join(" ")).not.toContain(";");
    expect(args[args.indexOf("-headers") + 1]).toContain("referer: https://example.test/");
  });

  it("publishes a window long enough to survive a rebuffer", () => {
    const args = buildRelayArgs({ url: "https://example.test/live.m3u8", dir: "/tmp/x", height: 720 });
    const listSize = Number(args[args.indexOf("-hls_list_size") + 1]);
    const segment = Number(args[args.indexOf("-hls_time") + 1]);
    // A five-second window meant any stall longer than five seconds asked for
    // an already-deleted segment, which hls.js reports as a fatal error.
    expect(listSize * segment).toBeGreaterThanOrEqual(15);
    expect(Number(args[args.indexOf("-hls_delete_threshold") + 1])).toBeGreaterThanOrEqual(listSize);
  });

  it("stamps PROGRAM-DATE-TIME so the relay's own delay is measurable", () => {
    const args = buildRelayArgs({ url: "https://example.test/live.m3u8", dir: "/tmp/x", height: 720 });
    expect(args[args.indexOf("-hls_flags") + 1]).toContain("program_date_time");
  });

  it("does not force zerolatency, which cost picture quality on grass", () => {
    const args = buildRelayArgs({ url: "https://example.test/live.m3u8", dir: "/tmp/x", height: 720 });
    expect(args).not.toContain("zerolatency");
  });

  it("continues the segment numbering on restart instead of resetting to zero", () => {
    const fresh = buildRelayArgs({ url: "https://e.test/l.m3u8", dir: "/tmp/x", height: 720 });
    expect(fresh).not.toContain("-start_number");

    const resumed = buildRelayArgs({
      url: "https://e.test/l.m3u8",
      dir: "/tmp/x",
      height: 720,
      startNumber: 64,
    });
    expect(resumed[resumed.indexOf("-start_number") + 1]).toBe("64");
  });

  it("signs a stable relay URL without exposing the upstream URL in the path", () => {
    const url = signRelayUrl("https://example.test/private/live.m3u8", {
      sourceId: "ar-test",
      height: 720,
    });
    expect(url).toMatch(/^\/api\/relay\/[^/]+\/index\.m3u8$/);
    const token = url.split("/")[3];
    const payload = verifyStreamToken(token);
    expect(payload?.u).toBe("https://example.test/private/live.m3u8");
    expect(payload?.d).toBe("720");
    expect(payload?.k).toBe("live");
    expect(url).not.toContain("private");
  });

  it("derives the next segment number from what is already on disk", () => {
    const dir = tempDir();
    expect(nextStartNumber(dir)).toBe(0);

    for (const name of ["seg00061.m4s", "seg00062.m4s", "seg00063.m4s", "init.mp4", "index.m3u8"]) {
      fs.writeFileSync(path.join(dir, name), "x");
    }
    // The logs showed ffmpeg dying after 11 s and 38 s. Restarting at zero made
    // the playlist go backwards while the client sat at sequence 63.
    expect(nextStartNumber(dir)).toBe(64);
  });

  it("holds the playlist back until it has enough segments to play", async () => {
    const dir = tempDir();
    const file = path.join(dir, "index.m3u8");
    fs.writeFileSync(file, "#EXTM3U\n#EXTINF:1.0,\nseg00000.m4s\n");

    // One segment is a one-second window: hls.js starts and starves at once.
    const tooShort = await waitForRelayFile(dir, "index.m3u8", 400, RELAY_MIN_READY_SEGMENTS);
    expect(tooShort).toBe(file);
    expect((fs.readFileSync(file, "utf8").match(/\.m4s/g) ?? []).length).toBe(1);

    fs.writeFileSync(
      file,
      "#EXTM3U\n#EXTINF:1.0,\nseg00000.m4s\n#EXTINF:1.0,\nseg00001.m4s\n#EXTINF:1.0,\nseg00002.m4s\n",
    );
    const ready = await waitForRelayFile(dir, "index.m3u8", 2_000, RELAY_MIN_READY_SEGMENTS);
    expect(ready).toBe(file);
  });

  it("reports nothing when ffmpeg never wrote a playlist", async () => {
    const dir = tempDir();
    expect(await waitForRelayFile(dir, "index.m3u8", 300, RELAY_MIN_READY_SEGMENTS)).toBeNull();
  });

  it("uses the same key for the same upstream identity", () => {
    const headers = { referer: "https://example.test/" };
    expect(relayKey("https://a.test/x", headers, 720)).toBe(relayKey("https://a.test/x", headers, 720));
    expect(relayKey("https://a.test/x", headers, 720)).not.toBe(relayKey("https://b.test/x", headers, 720));
    expect(relayKey("https://a.test/x", headers, 720)).not.toBe(relayKey("https://a.test/x", headers, 480));
  });
});
