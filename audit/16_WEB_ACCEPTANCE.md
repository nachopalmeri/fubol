# Fubol web — acceptance checks

Date: 2026-10-28. Local Windows/Chrome checks. This is not a declaration that every product goal is complete.

Later evidence/correction: after the old Node process stopped, its saved sweep logs revealed Sports Streams HTTP 429 responses. Thus the 72-entry sweep's many no-source results include upstream rate limiting, not only proven absent video. Do not interpret that sweep as 71 permanently dead sources. Final deployment, new features and remaining blockers are recorded in `18_FAMILY_RELEASE.md`.

## Changes

- AIOStreams recovered without resetting data or credentials. Its initial anime database rebuild took 4m 9s; subsequent dataset refreshes completed and the server became healthy. The earlier unhealthy state was observed before startup finished.
- Added Torrentio to the web addon store as a VOD provider, explicitly labeled P2P. No TorBox key is present. Registration does not make torrent hashes playable in HTML video.
- Connected the existing Sports Streams `sports_live` and `sports_football` catalogs to the web live-source store. The combined listing returned 72 entries, including the demo. Entries are not verified signals or guaranteed current events.
- Added OpenSubtitles v3 (`opensubtitles-v3.strem.io`) to the web store and curated addon catalog. This is distinct from the failing PRO endpoint.
- Renamed the demo source to `Demo técnica · Big Buck Bunny (no es TV)`. It is a sample film, not a live television channel or football coverage.
- Fixed live-session validation: failed probes are no longer signed and presented as HLS fallback sources. An HTML page, fake playlist or unavailable origin must not count as playable video. With zero validated sources the watch screen shows an unavailable state.
- Added four local integration regression cases for rejected HTML, fake `.m3u8`, HTTP 503, and accepted HLS. The three rejection tests failed before the fix and passed afterward.

Configuration changes above are in the existing local SQLite store; they are not automatically replicated to another machine or a separate Docker database. No secrets or private share links are included here.

## Results

| Objective | Result | Evidence / boundary |
| --- | --- | --- |
| TypeScript, lint, automated suite | PASS | `npm run check`: 83 tests, 11 files; includes four new live-session cases. |
| Final production build | PASS | `npm run build` and standalone cleanup passed after the live-session/UI fix. One build attempt exceeded the 120 s command limit; the subsequent run completed successfully. |
| AIOStreams runtime | PASS | Healthy, zero restarts; profile HTTP 200; manifest HTTP 200, 13 catalogs, 9 presets. |
| TorBox | BLOCKED | `key_present=false`, `torbox_configured=false`, `vod_mode=p2p`. |
| Curated addon manifests | PASS, limited | 18 entries: 13 responding manifests, 0 down, 5 manual entries. This is availability, not video/subtitle resource functionality. |
| Web metadata/search | PASS | Shawshank search HTTP 200 with 10 results. |
| Web movie/episode video | FAIL | `tt0111161`, `tt0133093`, `tt0063350`, `tt0944947:1:1` returned HTTP 200 but zero playable video sources. Torrentio registration does not resolve P2P. |
| Spanish subtitle discovery | PASS, sampled | Those titles returned respectively 37/26/69/80 tracks, including 3/4/19/6 Spanish tracks. The service caps its returned list at 80. |
| Spanish subtitle download/conversion | PASS, sampled | Signed proxy returned HTTP 200, `text/vtt`, `WEBVTT`, 1,692 cues. |
| Other subtitle providers | FAIL, sampled | Earlier direct requests: PRO HTTP 500; SubSource, SubDL, Community Subtitles and SubSense HTTP 404. Working manifests do not negate these failures. |
| Subtitle parsing/offset estimation | PASS, limited | Automated SRT/ASS/VTT conversion and known-offset tests. Real subtitle reference-vs-itself API: HTTP 200, offset 0 ms, confidence 0.964. This is not real film synchronization. |
| VOSE synchronization with matching video | BLOCKED | No playable movie source. Audio sidecar and real subtitle offset persistence not verified in this pass. |
| Demo HLS playback in Chrome | PASS, short | Initial isolated browser: 20.477 s measured, video advanced 19.501 s, zero waiting/stalled/error events; 848×480 decoded. Pause, seek +10 s and resume passed. Final build retest: 20.026 s measured, advanced 17.092 s including startup, 1,031 decoded frames and zero waiting/stalled/error events. These short runs do not prove sustained continuity. |
| Sports Streams catalog connection | PASS, listing only | Web listing: 22 football entries + 49 live entries + 1 demo. Counts may include duplicates and agenda entries. |
| All listed source sessions after fix | FAIL for sports | Requested sessions for all 72 entries with concurrency four and a 15 s request timeout. Only the demo returned a validated source; all 71 sports entries had no validated video. Some returned no configured sources (404), others zero sources after rejected probes (200). This was a session/probe sweep, not 72 successful playback tests. |
| Sports Streams sampled playback | FAIL | TNT SPORT 2, SKY SPORTS PREMIER LEAGUE and Panathinaikos–Aris each resolved to an HTML gate. Chrome playback failed; TNT reported DEMUXER_ERROR_COULD_NOT_OPEN. |
| TNT Sports Argentina / BCanal | BLOCKED | TNT SPORT 2 is only an upstream label, not proof of Argentine TNT Sports. No verified Argentine signal or audio. |
| MeteGol | NOT RUN | Not integrated; remains outside the repo's documented source scope. |
| Family link PIN | PASS, local | A new test link was created; wrong PIN 401, correct PIN 200. Only this test link was revoked afterward. |
| Family link permission isolation | PASS, local | Live-only session: live 200, VOD 403; anonymous admin request 403. |
| Family link revocation | PASS, local | Revocation 200; previously authenticated link session then rejected with 401. |
| Final unavailable UI | PASS | TNT SPORT 2 watch page rendered `No pudimos abrir la señal`, rather than offering rejected HTML as HLS. |
| Mobile layout | PASS, emulated only | At 390×844, home/live/movies/series/search/admin/TNT watch pages returned 200 with no horizontal document overflow. Not a real-device or full visual-accessibility audit. |
| Public family access / tunnel | NOT VERIFIED | No external link published or tunnel configured in this pass. Local checks are not remote-access acceptance. |
| iPhone, Android, TV/HDMI/Cast | NOT VERIFIED | Requires real devices. Browser emulation is not a device test. |
| Full movie, 3-hour expiry | NOT VERIFIED | No playable film and no multi-hour run. |
| Football latency / 20-minute continuity / cut recovery | BLOCKED | Sample sports sources failed before video decoding. The short demo run is not football stability or live-latency evidence. |
| Three streams for ten minutes | NOT VERIFIED | No successful sustained three-stream playback test. |
| Docker web image / backup / restore / image pinning | NOT VERIFIED | No image build, dependency installation, migration or restore performed in this pass. |

## Verification commands

```text
cd web
npm run check
npm run build
cd ..
node scripts/aiostreams-config.mjs status
node scripts/addons.mjs status
git diff --check
```

## Remaining acceptance gates

1. Obtain a working direct video source or configure the user's resolver credentials securely; do not put keys in chat or Git.
2. Verify an actual Argentine football signal and its audio, not just a similarly named catalog entry.
3. With working media, run the 20-minute live, ten-minute concurrency, full-film, real VOSE and expiry tests.
4. Test real family devices and remote access separately, with authorization before publication or installations.
