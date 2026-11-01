import { describe, expect, it } from "vitest";
import {
  buildRelayArgs,
  relayContentType,
  relayFileName,
  relayHeight,
  relayKey,
} from "../src/lib/live/relay";
import { signRelayUrl, verifyStreamToken } from "../src/lib/stream-token";

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
    expect(args[args.indexOf("-hls_delete_threshold") + 1]).toBe("6");
    expect(args[args.indexOf("-i") + 1]).toBe("https://example.test/live.m3u8");
    expect(args).toContain("scale=-2:720");
    expect(args.join(" ")).not.toContain(";");
    expect(args[args.indexOf("-headers") + 1]).toContain("referer: https://example.test/");
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

  it("uses the same key for the same upstream identity", () => {
    const headers = { referer: "https://example.test/" };
    expect(relayKey("https://a.test/x", headers, 720)).toBe(relayKey("https://a.test/x", headers, 720));
    expect(relayKey("https://a.test/x", headers, 720)).not.toBe(relayKey("https://b.test/x", headers, 720));
    expect(relayKey("https://a.test/x", headers, 720)).not.toBe(relayKey("https://a.test/x", headers, 480));
  });
});
