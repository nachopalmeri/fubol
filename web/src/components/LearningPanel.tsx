"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cueAtTime, exportPhrasesTsv, parseLearningCues, readSavedPhrases, savePhrase, validLearningLevel, type SavedPhrase } from "@/lib/learning";
import type { PlayerSubtitle } from "./Player";
import "./learning.css";

interface Props { title: string; storageKey: string; subtitles: PlayerSubtitle[]; current: number; activeSubtitleId: string | null; activeSubtitleOffsetMs: number; video: HTMLVideoElement | null }
const guidance = {
  B1: "First read the Spanish subtitles, then switch to English and replay. Focus on the main meaning.",
  B2: "Read the English cue, hide subtitles for a replay, then compare what you heard.",
  C1: "Listen first without reading; replay for nuance, register and unfamiliar expressions.",
};
export default function LearningPanel({ title, storageKey, subtitles, current, activeSubtitleId, activeSubtitleOffsetMs, video }: Props) {
  const [level, setLevel] = useState<keyof typeof guidance>("B1");
  const [trackId, setTrackId] = useState("");
  const [speed, setSpeed] = useState<0.8 | 1>(video?.playbackRate === 0.8 ? 0.8 : 1);
  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [cues, setCues] = useState<ReturnType<typeof parseLearningCues>>([]);
  const [message, setMessage] = useState("");
  const [phrases, setPhrases] = useState<SavedPhrase[]>([]);
  const englishTracks = subtitles.filter((track) => /^(en|eng)(\b|[-_])/i.test(track.lang));
  const english = englishTracks.find((track) => track.id === trackId) ?? englishTracks[0];
  const englishOffsetMs = english?.id === activeSubtitleId ? activeSubtitleOffsetMs : 0;
  const cue = useMemo(() => cueAtTime(cues, current, englishOffsetMs), [cues, current, englishOffsetMs]);
  const phraseStorageKey = `fubol:learning:v1:${storageKey}`;
  const levelStorageKey = `fubol:learning-level:v1:${storageKey}`;
  const originalRate = useRef<number | null>(null);

  useEffect(() => { try { setPhrases(readSavedPhrases(localStorage.getItem(phraseStorageKey))); } catch { setPhrases([]); setMessage("Browser storage is unavailable."); } }, [phraseStorageKey]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(levelStorageKey);
      setLevel(validLearningLevel(stored) ? stored : "B1");
    } catch { setLevel("B1"); }
  }, [levelStorageKey]);
  useEffect(() => {
    if (!video) return;
    originalRate.current = video.playbackRate;
    return () => { if (originalRate.current !== null) video.playbackRate = originalRate.current; };
  }, [video]);
  useEffect(() => { if (video) video.playbackRate = speed; }, [video, speed]);
  useEffect(() => {
    const controller = new AbortController();
    setCues([]); setMessage(english ? "Loading English subtitles…" : "");
    if (!english) return () => controller.abort();
    fetch(english.url, { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error(); return response.text(); })
      .then((text) => { if (!controller.signal.aborted) { setCues(parseLearningCues(text)); setMessage(""); } })
      .catch(() => { if (!controller.signal.aborted) setMessage("Could not load this subtitle track."); });
    return () => controller.abort();
  }, [english?.id, english?.url, title]);

  const persist = (next: SavedPhrase[]) => { setPhrases(next); try { localStorage.setItem(phraseStorageKey, JSON.stringify(next)); } catch { setMessage("Browser storage is unavailable; phrase was not saved."); } };
  const replay = () => { if (!cue || !video) return; const start = Math.max(0, cue.start / 1000 + englishOffsetMs / 1000); video.currentTime = Math.min(video.duration || start, start); void video.play().catch(() => undefined); };
  const addPhrase = () => {
    if (!cue) return;
    const phrase = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, mediaTitle: title.slice(0, 200), text: cue.text.slice(0, 500), timeSeconds: Math.max(0, cue.start / 1000 + englishOffsetMs / 1000), createdAt: Date.now() };
    persist(savePhrase(phrases, phrase));
  };
  const download = () => { const blob = new Blob([exportPhrasesTsv(phrases)], { type: "text/tab-separated-values;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "fubol-phrases.tsv"; a.click(); URL.revokeObjectURL(url); };
  return <section className="learning-panel" aria-label="English practice">
    <div className="learning-header"><div><h2>English practice</h2><p>Practice with this title’s English subtitles. No translation is generated.</p></div>
      <label>Level <select value={level} onChange={(e) => { const next = e.target.value; if (!validLearningLevel(next)) return; setLevel(next); try { localStorage.setItem(levelStorageKey, next); } catch { setMessage("Browser storage is unavailable."); } if (next === "C1") setTranscriptVisible(false); }}><option>B1</option><option>B2</option><option>C1</option></select></label>
    </div>
    <p className="learning-guidance">{guidance[level]}</p>
    <div className="learning-actions"><label>Playback speed <select aria-label="Playback speed" value={speed} onChange={(e) => { const next = Number(e.target.value) as 0.8 | 1; setSpeed(next); if (video) video.playbackRate = next; }}><option value={0.8}>0.8×</option><option value={1}>1×</option></select></label></div>
    {englishTracks.length ? <label className="learning-track">English subtitles <select value={english?.id ?? ""} onChange={(e) => setTrackId(e.target.value)}>{englishTracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}</select></label> : <p role="status">No English subtitles are available for this title. Choose a title with an English subtitle track to practice.</p>}
    {englishTracks.length > 0 && <><p className="learning-note">Subtitle tracks can come from different releases and may not align. The player’s offset is applied only when this English track is also the selected player subtitle.</p><div className="learning-actions"><button type="button" aria-pressed={transcriptVisible} onClick={() => setTranscriptVisible((visible) => !visible)}>{transcriptVisible ? "Hide transcript" : "Show transcript"}</button></div>{!transcriptVisible && <p className="learning-note">This hides only the practice transcript. Use the player’s subtitle controls to turn off on-screen subtitles for listening-only practice.</p>}{transcriptVisible && <p className="learning-cue" aria-live="polite">{cue?.text ?? (message || "No English cue at the current position.")}</p>}<div className="learning-actions"><button type="button" onClick={replay} disabled={!cue}>Replay cue</button><button type="button" onClick={addPhrase} disabled={!cue}>Save phrase</button></div></>}
    <div className="learning-saved"><h3>Saved phrases ({phrases.length})</h3><button type="button" onClick={download} disabled={!phrases.length}>Export TSV / Anki</button>
      {phrases.map((phrase) => <div className="learning-phrase" key={phrase.id}><span><strong>{phrase.text}</strong><small>{phrase.mediaTitle} · {Math.floor(phrase.timeSeconds / 60)}:{String(Math.floor(phrase.timeSeconds % 60)).padStart(2, "0")}</small></span><button type="button" aria-label={`Remove ${phrase.text}`} onClick={() => persist(phrases.filter((p) => p.id !== phrase.id))}>Remove</button></div>)}
    </div>
  </section>;
}
