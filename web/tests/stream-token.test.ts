import { describe, expect, it } from "vitest";
import {
  sanitizeHeaders,
  signStreamUrl,
  signSubtitleUrl,
  verifyStreamToken,
} from "../src/lib/stream-token";

describe("stream tokens", () => {
  it("signs a proxied stream URL", () => {
    const signed = signStreamUrl("https://cdn.example/live/index.m3u8", {
      headers: { Referer: "https://site.example/", "x-custom": "nope" },
      sourceId: "src1",
      kind: "live",
    });
    expect(signed.startsWith("/api/stream?t=")).toBe(true);
    const token = new URL(signed, "http://local").searchParams.get("t");
    const payload = verifyStreamToken(token);
    expect(payload?.u).toBe("https://cdn.example/live/index.m3u8");
    expect(payload?.s).toBe("src1");
    expect(payload?.k).toBe("live");
    expect(payload?.h).toEqual({ referer: "https://site.example/" });
  });

  it("signs subtitle URLs with a VOD kind", () => {
    const signed = signSubtitleUrl("https://subs.example/es.srt");
    expect(signed.startsWith("/api/subtitles/proxy?t=")).toBe(true);
    const token = new URL(signed, "http://local").searchParams.get("t");
    expect(verifyStreamToken(token)?.k).toBe("vod");
  });

  it("times out old tokens", () => {
    const signed = signStreamUrl("https://cdn.example/a.m3u8", {}, -1000);
    const token = new URL(signed, "http://local").searchParams.get("t");
    expect(verifyStreamToken(token)).toBeNull();
  });
});

describe("sanitizeHeaders", () => {
  it("keeps only allow-listed headers with bounded values", () => {
    const result = sanitizeHeaders({
      "User-Agent": "Mozilla/5.0",
      Origin: "https://example.com",
      Cookie: "session=secret",
      Referer: "x".repeat(600),
    });
    expect(result).toEqual({
      "user-agent": "Mozilla/5.0",
      origin: "https://example.com",
    });
  });

  it("returns undefined when nothing is allowed", () => {
    expect(sanitizeHeaders({ cookie: "a=b" })).toBeUndefined();
    expect(sanitizeHeaders(undefined)).toBeUndefined();
  });
});
