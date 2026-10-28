import { describe, expect, it } from "vitest";
import {
  assToVtt,
  cuesToVtt,
  decodeSubtitle,
  detectFormat,
  parseCues,
  parseVttTime,
  shiftVtt,
  srtToVtt,
  toVtt,
} from "../src/lib/subs/format";
import { buildEnvelope, estimateOffset } from "../src/lib/subs/sync";

const SRT = `1
00:00:01,500 --> 00:00:03,000
Hola mundo

2
00:00:04,000 --> 00:00:06,250 align:start
Segunda línea
con salto
`;

const ASS = `[Script Info]
Title: Prueba

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\i1}Hola\\Nmundo{\\i0}
Dialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,Texto con, coma
`;

describe("subtitle formats", () => {
  it("converts SRT timestamps to WebVTT", () => {
    const vtt = srtToVtt(SRT);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:01.500 --> 00:00:03.000");
    expect(vtt).toContain("00:00:04.000 --> 00:00:06.250 align:start");
  });

  it("converts ASS events and strips override tags", () => {
    const vtt = assToVtt(ASS);
    expect(vtt).toContain("00:00:01.000 --> 00:00:03.500");
    expect(vtt).toContain("Hola\nmundo");
    expect(vtt).not.toContain("{\\i1}");
    expect(vtt).toContain("Texto con, coma");
  });

  it("detects the format from content type, URL or body", () => {
    expect(detectFormat("text/plain", "https://x/sub.ass")).toBe("ass");
    expect(detectFormat("text/vtt", "https://x/sub")).toBe("vtt");
    expect(detectFormat("application/x-subrip", "https://x/sub.srt")).toBe("srt");
    expect(toVtt(ASS, "srt")).toContain("Hola");
    expect(toVtt("1\n00:00:01,000 --> 00:00:02,000\nHola", "srt")).toContain("WEBVTT");
  });

  it("decodes UTF-8 with BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x6f, 0x6c, 0x61]);
    expect(decodeSubtitle(bytes)).toBe("Hola");
  });
});

describe("cue parsing", () => {
  const vtt = `WEBVTT

intro
00:00:01.500 --> 00:00:03.000
Hola

00:00:04.000 --> 00:00:06.250
Dos
líneas
`;

  it("parses cue times and multi-line text", () => {
    const cues = parseCues(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1500, end: 3000, text: "Hola" });
    expect(cues[1]?.text).toBe("Dos\nlíneas");
  });

  it("parses VTT times with optional hours", () => {
    expect(parseVttTime("01:02:03.004")).toBe(3_723_004);
    expect(parseVttTime("00:01.500")).toBe(1500);
    expect(parseVttTime("bogus")).toBeNull();
  });

  it("serializes cues back to VTT", () => {
    const output = cuesToVtt([{ start: 0, end: 1500, text: "Hola" }]);
    expect(output).toContain("00:00:00.000 --> 00:00:01.500");
    expect(parseCues(output)).toHaveLength(1);
  });

  it("shifts cues and clamps negative starts", () => {
    const shifted = shiftVtt(
      "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nA\n\n00:00:04.000 --> 00:00:05.000\nB\n",
      -1500,
    );
    const cues = parseCues(shifted);
    expect(cues[0]?.start).toBe(0);
    expect(cues[0]?.end).toBe(500);
    expect(cues[1]?.start).toBe(2500);
    expect(shiftVtt("WEBVTT\n", 0)).toBe("WEBVTT\n");
  });
});

describe("subtitle sync", () => {
  const reference = [
    { start: 10_000, end: 12_000, text: "uno" },
    { start: 15_000, end: 17_000, text: "dos" },
    { start: 20_000, end: 22_000, text: "tres" },
  ];
  const target = reference.map((cue) => ({
    start: cue.start + 3000,
    end: cue.end + 3000,
    text: cue.text,
  }));

  it("builds a binary envelope", () => {
    const envelope = buildEnvelope(reference, 1000);
    expect(envelope.stepMs).toBe(1000);
    expect(envelope.values.length).toBe(22);
    expect(envelope.values[10]).toBe(1);
    expect(envelope.values[13]).toBe(0);
  });

  it("finds a positive shift as a negative offset", () => {
    const estimate = estimateOffset(reference, target, { maxOffsetMs: 10_000 });
    expect(Math.abs(estimate.offsetMs + 3000)).toBeLessThanOrEqual(150);
    expect(estimate.confidence).toBeGreaterThan(0.5);
  });

  it("returns zero for aligned tracks", () => {
    const estimate = estimateOffset(reference, reference);
    expect(Math.abs(estimate.offsetMs)).toBeLessThanOrEqual(100);
    expect(estimate.confidence).toBeGreaterThan(0.5);
  });

  it("returns no confidence for empty tracks", () => {
    const estimate = estimateOffset([], target);
    expect(estimate.offsetMs).toBe(0);
    expect(estimate.confidence).toBe(0);
  });
});
