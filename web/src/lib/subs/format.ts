export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

const TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

export function decodeSubtitle(buffer: Uint8Array): string {
  const bytes = buffer;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function toVttTime(match: RegExpMatchArray): string {
  const hours = (match[1] ?? "0").padStart(2, "0");
  const minutes = (match[2] ?? "0").padStart(2, "0");
  const seconds = (match[3] ?? "0").padStart(2, "0");
  const millis = (match[4] ?? "0").padEnd(3, "0").slice(0, 3);
  return `${hours}:${minutes}:${seconds}.${millis}`;
}

export function srtToVtt(input: string): string {
  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const body = text
    .split("\n")
    .map((line) => {
      const times = line.split("-->");
      if (times.length !== 2) return line;
      const start = times[0]?.match(TIME_RE);
      const end = times[1]?.match(TIME_RE);
      if (!start || !end) return line;
      const settings = times[1]?.replace(TIME_RE, "").trim();
      return `${toVttTime(start)} --> ${toVttTime(end)}${settings ? ` ${settings}` : ""}`;
    })
    .join("\n");
  return `WEBVTT\n\n${body}\n`;
}

function assTimeToMs(value: string): number | null {
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})[.:](\d{1,3})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const centis = Number((match[4] ?? "0").padEnd(3, "0").slice(0, 3));
  return hours * 3600_000 + minutes * 60_000 + seconds * 1000 + centis;
}

function msToVtt(ms: number): string {
  const hours = Math.floor(ms / 3600_000);
  const minutes = Math.floor((ms % 3600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = Math.round(ms % 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function assToVtt(input: string): string {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  let inEvents = false;
  let format: string[] = [];
  const cues: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[events\]$/i.test(trimmed)) {
      inEvents = true;
      continue;
    }
    if (/^\[.+\]$/.test(trimmed)) {
      inEvents = false;
      continue;
    }
    if (!inEvents) continue;
    if (/^format:/i.test(trimmed)) {
      format = trimmed.slice(7).split(",").map((field) => field.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue:/i.test(trimmed)) continue;
    const payload = trimmed.slice("dialogue:".length);
    const fields = payload.split(",");
    const startIndex = format.indexOf("start") >= 0 ? format.indexOf("start") : 1;
    const endIndex = format.indexOf("end") >= 0 ? format.indexOf("end") : 2;
    const textIndex = format.indexOf("text") >= 0 ? format.indexOf("text") : 9;
    const start = assTimeToMs(fields[startIndex] ?? "");
    const end = assTimeToMs(fields[endIndex] ?? "");
    if (start === null || end === null || end <= start) continue;
    const rawText = fields.slice(textIndex).join(",");
    const text = rawText
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\N/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\h/g, " ")
      .replace(/-->/g, "→")
      .trim();
    if (!text) continue;
    cues.push(`${msToVtt(start)} --> ${msToVtt(end)}\n${text}`);
  }
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

export function toVtt(input: string, format: "srt" | "ass" | "vtt"): string {
  const text = input.replace(/^\uFEFF/, "");
  if (format === "vtt" || text.trimStart().startsWith("WEBVTT")) {
    return text.trimStart().startsWith("WEBVTT") ? text : `WEBVTT\n\n${text}`;
  }
  if (format === "ass" || /\[Script Info\]/i.test(text)) return assToVtt(text);
  return srtToVtt(text);
}

export function detectFormat(contentType: string, url: string): "srt" | "ass" | "vtt" {
  const lower = `${contentType} ${url}`.toLowerCase();
  if (lower.includes(".ass") || lower.includes("x-ass")) return "ass";
  if (lower.includes(".vtt") || lower.includes("text/vtt") || lower.includes("webvtt")) return "vtt";
  return "srt";
}

export function parseCues(vtt: string): SubtitleCue[] {
  const blocks = vtt.replace(/\r/g, "").split(/\n{2,}/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex === -1) continue;
    const timeLine = lines[timeLineIndex];
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split("-->");
    const start = parseVttTime(startRaw?.trim() ?? "");
    const end = parseVttTime((endRaw ?? "").trim().split(" ")[0] ?? "");
    if (start === null || end === null || end <= start) continue;
    const text = lines
      .slice(timeLineIndex + 1)
      .join("\n")
      .trim();
    if (!text) continue;
    cues.push({ start, end, text });
  }
  return cues;
}

export function parseVttTime(value: string): number | null {
  const match = value.match(/^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{1,3})$/);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number((match[4] ?? "0").padEnd(3, "0").slice(0, 3));
  return hours * 3600_000 + minutes * 60_000 + seconds * 1000 + millis;
}

export function cuesToVtt(cues: SubtitleCue[]): string {
  const body = cues
    .map((cue) => `${msToVtt(cue.start)} --> ${msToVtt(cue.end)}\n${cue.text}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

export function shiftVtt(vtt: string, offsetMs: number): string {
  if (!offsetMs) return vtt;
  const cues = parseCues(vtt).map((cue) => ({
    start: Math.max(0, cue.start + offsetMs),
    end: Math.max(0, cue.end + offsetMs),
    text: cue.text,
  }));
  return cuesToVtt(cues.filter((cue) => cue.end > 0));
}

export function guessFormatFromFilename(filename: string | undefined): "srt" | "ass" | "vtt" {
  if (!filename) return "srt";
  if (/\.ass$/i.test(filename)) return "ass";
  if (/\.vtt$/i.test(filename)) return "vtt";
  if (/\.ssa$/i.test(filename)) return "ass";
  return "srt";
}
