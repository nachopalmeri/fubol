import { detectFormat, parseCues, toVtt, type SubtitleCue } from "@/lib/subs/format";

export interface SavedPhrase { id: string; mediaTitle: string; text: string; timeSeconds: number; createdAt: number }
const MAX_PHRASES = 500;
const MAX_TEXT = 500;
export function validLearningLevel(value: unknown): value is "B1" | "B2" | "C1" {
  return value === "B1" || value === "B2" || value === "C1";
}

export function parseLearningCues(text: string): SubtitleCue[] {
  return parseCues(toVtt(text, detectFormat("", ""))).map((cue) => ({ ...cue, text: cue.text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() })).filter((cue) => cue.text.length > 0);
}

export function cueAtTime(cues: SubtitleCue[], currentSeconds: number, offsetMs = 0): SubtitleCue | null {
  const time = currentSeconds * 1000;
  return cues.find((cue) => time >= Math.max(0, cue.start + offsetMs) && time < Math.max(0, cue.end + offsetMs)) ?? null;
}

function validPhrase(value: unknown): value is SavedPhrase {
  if (!value || typeof value !== "object") return false;
  const p = value as SavedPhrase;
  return typeof p.id === "string" && p.id.length <= 100 && typeof p.mediaTitle === "string" && p.mediaTitle.length <= 200 &&
    typeof p.text === "string" && p.text.length > 0 && p.text.length <= MAX_TEXT && Number.isFinite(p.timeSeconds) && p.timeSeconds >= 0 && Number.isFinite(p.createdAt);
}
export function readSavedPhrases(raw: string | null): SavedPhrase[] {
  if (!raw) return [];
  try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value.filter(validPhrase).slice(-MAX_PHRASES) : []; } catch { return []; }
}
export function savePhrase(phrases: SavedPhrase[], phrase: SavedPhrase): SavedPhrase[] {
  if (!validPhrase(phrase)) return phrases;
  const duplicate = phrases.find((item) => item.mediaTitle === phrase.mediaTitle && item.text === phrase.text && item.timeSeconds === phrase.timeSeconds);
  if (duplicate) return phrases;
  return [...phrases.filter((item) => item.id !== phrase.id), phrase].slice(-MAX_PHRASES);
}
function safeCell(value: string): string {
  const cleaned = value.replace(/[\t\r\n]+/g, " ").slice(0, MAX_TEXT);
  return /^\s*[=+\-@]/.test(cleaned) ? `' ${cleaned}` : cleaned;
}
export function exportPhrasesTsv(phrases: SavedPhrase[]): string {
  return ["Phrase\tMedia\tTime (s)", ...phrases.filter(validPhrase).map((p) => `${safeCell(p.text)}\t${safeCell(p.mediaTitle)}\t${p.timeSeconds.toFixed(1)}`)].join("\n");
}
