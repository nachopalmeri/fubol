import { describe, expect, it } from "vitest";
import { parseHlsPlaylist } from "../src/lib/live/playlist";
import { ASSUMED_EDGE_AGE_S, scoreProbe, usableEdgeAge } from "../src/lib/live/rank";

const NOW = Date.parse("2026-11-01T14:53:17Z");

/** Builds a media playlist whose first segment carries the given PDT. */
function playlist(options: {
  firstPdt: string;
  segments?: number;
  duration?: number;
  target?: number;
  pdtOnEverySegment?: boolean;
}): string {
  const count = options.segments ?? 8;
  const duration = options.duration ?? 6;
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${options.target ?? duration}`,
    "#EXT-X-MEDIA-SEQUENCE:1367",
  ];
  const start = Date.parse(options.firstPdt);
  for (let i = 0; i < count; i++) {
    if (i === 0 || options.pdtOnEverySegment) {
      lines.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + i * duration * 1000).toISOString()}`);
    }
    lines.push(`#EXTINF:${duration.toFixed(3)},`, `seg${i}.ts`);
  }
  return lines.join("\n");
}

describe("edge-age trust", () => {
  it("measures the delay when a PDT sits on the newest segment", () => {
    // 8 x 6 s window whose last segment starts 25 s ago: the edge is ~19 s back.
    const text = playlist({ firstPdt: "2026-11-01T14:52:12Z", pdtOnEverySegment: true });
    const parsed = parseHlsPlaylist(text, "https://origin.test/live.m3u8", NOW);
    expect(parsed.edgeTrust).toBe("measured");
    expect(parsed.edgeAgeS).toBeCloseTo(17, 0);
    expect(parsed.pdtCount).toBe(8);
  });

  it("flags a single top-of-window PDT as extrapolated", () => {
    // Real providers ship exactly one PDT, so the edge is derived by adding
    // every segment duration after it. The number is usable but not measured.
    const text = playlist({ firstPdt: "2026-11-01T14:52:12Z" });
    const parsed = parseHlsPlaylist(text, "https://origin.test/live.m3u8", NOW);
    expect(parsed.pdtCount).toBe(1);
    expect(parsed.edgeTrust).toBe("extrapolated");
    expect(parsed.edgeAgeS).not.toBeNull();
    expect(parsed.pdtExtrapolatedS).toBeCloseTo(42, 0);
  });

  it("rejects an origin whose clock puts the newest frame at the present", () => {
    // Observed in production: four sources for one match disagreed by 33 s and
    // the leader reported 0 s. A re-stream cannot be level with the wall clock,
    // so the reading is refused instead of being clamped to zero and shown.
    const text = playlist({ firstPdt: "2026-11-01T14:52:29.451Z" });
    const parsed = parseHlsPlaylist(text, "https://origin.test/live.m3u8", NOW);
    expect(parsed.edgeTrust).toBe("implausible");
    expect(parsed.edgeAgeS).toBeNull();
    expect(parsed.edgeRawS).not.toBeNull();
  });

  it("rejects the relay's own PDT, which runs ahead of the wall clock", () => {
    // Measured against a real origin, ffmpeg's `program_date_time` came out
    // 0.4-3.2 s AHEAD of now: it derives PDT from the input timeline, and the
    // origin delivers its window in bursts. The classifier has to catch this,
    // otherwise the relay path would display a negative or zero delay.
    const future = new Date(Date.now() + 2_000).toISOString();
    const text = [
      "#EXTM3U",
      "#EXT-X-VERSION:7",
      "#EXT-X-TARGETDURATION:1",
      "#EXT-X-MEDIA-SEQUENCE:44",
      `#EXT-X-PROGRAM-DATE-TIME:${future}`,
      "#EXTINF:1.001000,",
      "seg00044.m4s",
    ].join("\n");
    const parsed = parseHlsPlaylist(text, "http://127.0.0.1:3002/api/relay/x/index.m3u8");
    expect(parsed.edgeTrust).toBe("implausible");
    expect(parsed.edgeAgeS).toBeNull();
    expect(parsed.edgeRawS).toBeLessThan(0);
  });

  it("reports no trust at all when the playlist carries no PDT", () => {
    const text = [
      "#EXTM3U",
      "#EXT-X-TARGETDURATION:6",
      "#EXTINF:6.000,",
      "seg0.ts",
      "#EXTINF:6.000,",
      "seg1.ts",
    ].join("\n");
    const parsed = parseHlsPlaylist(text, "https://origin.test/live.m3u8", NOW);
    expect(parsed.edgeTrust).toBe("none");
    expect(parsed.edgeAgeS).toBeNull();
    expect(parsed.pdtCount).toBe(0);
  });

  it("only hands a usable number to the ranking when it can be trusted", () => {
    expect(usableEdgeAge({ edgeAgeS: 19, edgeTrust: "measured" })).toBe(19);
    expect(usableEdgeAge({ edgeAgeS: 19, edgeTrust: "extrapolated" })).toBe(19);
    expect(usableEdgeAge({ edgeAgeS: 0, edgeTrust: "implausible" })).toBeNull();
    expect(usableEdgeAge({ edgeAgeS: null, edgeTrust: "none" })).toBeNull();
  });
});

describe("ranking no longer rewards ignorance", () => {
  const base = { ok: true, live: true, kind: "hls" as const };

  it("prefers a measured low delay over an unmeasured source", () => {
    const measuredFast = scoreProbe({ ...base, ttfbMs: 400, edgeAgeS: 10, edgeTrust: "measured", height: 720 });
    const unknown = scoreProbe({ ...base, ttfbMs: 232, edgeAgeS: null, edgeTrust: "none", height: 1080 });
    expect(measuredFast).toBeGreaterThan(unknown);
  });

  it("puts an unmeasured source above one measured as clearly worse", () => {
    // Unknown is scored as a typical source, not as a free pass: a 1080p
    // origin that admits to 25 s used to lose to one that said nothing.
    const unknown = scoreProbe({ ...base, ttfbMs: 232, edgeAgeS: null, edgeTrust: "none", height: 1080 });
    const measuredSlow = scoreProbe({ ...base, ttfbMs: 384, edgeAgeS: 35, edgeTrust: "measured", height: 1080 });
    expect(unknown).toBeGreaterThan(measuredSlow);
  });

  it("does not let a clock-skewed origin win by claiming zero delay", () => {
    const skewed = scoreProbe({ ...base, ttfbMs: 1115, edgeAgeS: 0, edgeTrust: "implausible", height: null });
    const honest = scoreProbe({ ...base, ttfbMs: 1019, edgeAgeS: 18, edgeTrust: "measured", height: null });
    expect(honest).toBeGreaterThan(skewed);
  });

  it("treats an unmeasured source as the neutral prior", () => {
    const unknown = scoreProbe({ ...base, ttfbMs: 300, edgeAgeS: null, edgeTrust: "none", height: 720 });
    const atPrior = scoreProbe({
      ...base,
      ttfbMs: 300,
      edgeAgeS: ASSUMED_EDGE_AGE_S,
      edgeTrust: "measured",
      height: 720,
    });
    // Same assumed delay, minus a small penalty for telling us nothing.
    expect(atPrior - unknown).toBeGreaterThan(0);
    expect(atPrior - unknown).toBeLessThanOrEqual(5);
  });

  it("stops resolution from buying its way past a slow edge", () => {
    const sharpAndLate = scoreProbe({ ...base, ttfbMs: 100, edgeAgeS: 40, edgeTrust: "measured", height: 1080 });
    const softAndClose = scoreProbe({ ...base, ttfbMs: 100, edgeAgeS: 8, edgeTrust: "measured", height: 480 });
    expect(softAndClose).toBeGreaterThan(sharpAndLate);
  });
});
