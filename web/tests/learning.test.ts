import { describe, expect, it } from "vitest";
import { cueAtTime, exportPhrasesTsv, parseLearningCues, readSavedPhrases, savePhrase, validLearningLevel, type SavedPhrase } from "@/lib/learning";

describe("English learning helpers", () => {
  const cues = parseLearningCues("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello <b>there</b>\n\n00:00:04.000 --> 00:00:05.000\nAgain");
  it("finds cues at inclusive start and exclusive end, applying subtitle offset", () => {
    expect(cues).toHaveLength(2);
    expect(cueAtTime(cues, 2, 1000)?.text).toBe("Hello there");
    expect(cueAtTime(cues, 5, 1000)?.text).toBe("Again");
    expect(cueAtTime(cues, 4, 1000)).toBeNull();
    expect(cueAtTime(cues, 1, 1000)).toBeNull();
  });
  it("validates bounded saved phrases and safely exports TSV", () => {
    const phrase: SavedPhrase = { id: "p1", mediaTitle: "Film\tOne", text: "=cmd\nword", timeSeconds: 12.4, createdAt: 1 };
    const stored = savePhrase([], phrase);
    expect(readSavedPhrases(JSON.stringify(stored))).toEqual(stored);
    expect(exportPhrasesTsv(stored)).toContain("' =cmd word");
    expect(readSavedPhrases('[{"id":"x","text":"x"}]')).toEqual([]);
    expect(readSavedPhrases("not json")).toEqual([]);
    expect(exportPhrasesTsv(stored)).toContain("Film One");
    expect(exportPhrasesTsv([{ ...phrase, text: "  =1+1" }])).toContain("'   =1+1");
  });
  it("rejects invalid records and levels, caps history, and deduplicates the same phrase", () => {
    const phrase: SavedPhrase = { id: "p1", mediaTitle: "Film", text: "phrase", timeSeconds: 12.4, createdAt: 1 };
    expect(validLearningLevel("B3")).toBe(false);
    expect(validLearningLevel("C1")).toBe(true);
    expect(readSavedPhrases(JSON.stringify([{ id: "bad", text: "x" }, { ...phrase, text: "x".repeat(501) }]))).toEqual([]);
    const full = Array.from({ length: 500 }, (_, i) => ({ ...phrase, id: `p${i}`, timeSeconds: i }));
    expect(savePhrase(full, { ...phrase, id: "new" })).toHaveLength(500);
    expect(readSavedPhrases(JSON.stringify([...full, { ...phrase, id: "p500" }]))).toHaveLength(500);
    const duplicate = savePhrase([phrase], { ...phrase, id: "another", createdAt: 2 });
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0]?.id).toBe("p1");
  });
});
