import { describe, expect, it } from "vitest";
import {
  parseHlsPlaylist,
  rewritePlaylist,
  selectVariant,
} from "../src/lib/live/playlist";

const MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
720/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=12000000,RESOLUTION=3840x2160
2160/index.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:42
#EXT-X-PROGRAM-DATE-TIME:2026-01-01T12:00:00.000Z
#EXTINF:6.000,
seg1.ts
#EXTINF:6.000,
seg2.ts
#EXT-X-ENDLIST
`;

describe("parseHlsPlaylist", () => {
  it("parses master variants", () => {
    const playlist = parseHlsPlaylist(MASTER, "https://cdn.example/live/master.m3u8");
    expect(playlist.isMaster).toBe(true);
    expect(playlist.variants).toHaveLength(3);
    const top = playlist.variants.find((variant) => variant.height === 2160);
    expect(top?.bandwidth).toBe(12_000_000);
    expect(top?.uri).toBe("https://cdn.example/live/2160/index.m3u8");
    expect(playlist.height).toBe(2160);
    expect(playlist.bitrate).toBe(12_000_000);
  });

  it("parses media segments and computes edge age", () => {
    const now = Date.parse("2026-01-01T12:00:20.000Z");
    const playlist = parseHlsPlaylist(MEDIA, "https://cdn.example/live/index.m3u8", now);
    expect(playlist.isMaster).toBe(false);
    expect(playlist.segments).toHaveLength(2);
    expect(playlist.mediaSequence).toBe(42);
    expect(playlist.targetDuration).toBe(6);
    expect(playlist.endList).toBe(true);
    expect(playlist.live).toBe(false);
    // The last segment has no PDT; the first one plus two segments marks the edge.
    expect(playlist.edgeAgeS).toBe(8);
  });

  it("detects low-latency parts", () => {
    const text = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-PART-INF:PART-TARGET=0.5
#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.5
#EXT-X-PART:DURATION=0.5,URI="part1.mp4"
#EXTINF:2,
seg1.ts
`;
    const playlist = parseHlsPlaylist(text, "https://cdn.example/ll/index.m3u8");
    expect(playlist.lowLatency).toBe(true);
    expect(playlist.partTarget).toBe(0.5);
    expect(playlist.holdBack).toBe(1.5);
    expect(playlist.live).toBe(true);
  });

  it("resolves relative URIs against the final URL", () => {
    const playlist = parseHlsPlaylist(MEDIA, "https://cdn.example/live/index.m3u8?a=1");
    expect(playlist.segments[0]?.uri).toBe("https://cdn.example/live/seg1.ts");
  });
});

describe("selectVariant", () => {
  it("prefers the best variant under the cap", () => {
    const playlist = parseHlsPlaylist(MASTER, "https://cdn.example/master.m3u8");
    expect(selectVariant(playlist.variants, 1080)?.height).toBe(1080);
    expect(selectVariant(playlist.variants, 720)?.height).toBe(720);
  });

  it("falls back to the smallest when everything is above the cap", () => {
    expect(selectVariant([{ uri: "a", bandwidth: 1, height: 2160 }], 720)?.height).toBe(2160);
    expect(selectVariant([], 720)).toBeUndefined();
  });
});

describe("rewritePlaylist", () => {
  const map = (absolute: string) => `/api/stream?t=${encodeURIComponent(absolute)}`;

  it("rewrites segments, keys, maps and renditions", () => {
    const text = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXT-X-MAP:URI="init.mp4"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Español",URI="audio/es.m3u8"
#EXTINF:6,
seg1.ts
`;
    const out = rewritePlaylist(text, "https://cdn.example/live/index.m3u8", map);
    expect(out).toContain(`URI="${map("https://cdn.example/live/key.bin")}"`);
    expect(out).toContain(`URI="${map("https://cdn.example/live/init.mp4")}"`);
    expect(out).toContain(`URI="${map("https://cdn.example/live/audio/es.m3u8")}"`);
    expect(out).toContain(map("https://cdn.example/live/seg1.ts"));
    expect(out).toContain("#EXTINF:6,");
  });

  it("leaves absolute URLs and tags without URI untouched", () => {
    const text = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6,
https://other.example/seg.ts
`;
    const out = rewritePlaylist(text, "https://cdn.example/live/index.m3u8", map);
    expect(out).toContain("#EXT-X-TARGETDURATION:6");
    expect(out).toContain(map("https://other.example/seg.ts"));
  });
});
