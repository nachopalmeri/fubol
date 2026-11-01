# Family release — agreed requirements and execution

Date: 2026-10-28. User authorized autonomous implementation, Docker execution and multi-agent work. Existing uncommitted work is preserved.

## Acceptance contract

- Docker-hosted family web with revocable links, PIN/permissions and durable data. Remote access requires a reachable, configured endpoint; TorBox is a media resolver, not hosting for this web app.
- Netflix-inspired content-first browsing: restrained charcoal/red palette, large landscape feature, readable artwork rails, mobile navigation, no fake content or decorative dashboard cards.
- Search and browse show only titles with a currently validated web-compatible source. Metadata, torrent hashes and HTML gates do not count. For a series, validate a real episode and link to that episode rather than assuming series-level streams exist.
- English practice: opt-in B1/B2/C1 viewing workflow, subtitle selection, cue replay and saved phrases/export. No promise that watching alone certifies C1 or that mismatched subtitle tracks are synchronized.
- Reuse existing public protocols/configuration and respect upstream licenses; do not copy credential stores or assume open-source clients provide media rights, resolver credentials or universal streams.
- No claim of universal football/films, zero upstream delay, perfect subtitle sync, remote/device acceptance without evidence. Missing external inputs remain explicit blockers, not fabricated completions.

## Independent work scopes

1. **Presentation**: `web/src/app/page.tsx`, `globals.css`, `components/TopBar.tsx`, `PosterRow.tsx`, `TitleHero.tsx`, `SearchView.tsx`; design receipt `audit/17_DESIGN.md`. Uses existing service contracts. Do not change player, services, Docker or auth.
2. **English practice**: `web/src/components/Player.tsx`, new `LearningPanel.tsx`, `learning.css`, `web/src/lib/learning.ts`, `web/tests/learning.test.ts`. No other shared files. No dependencies or external AI services.
3. **Primary integration**: availability-first services/tests, Docker, safe config import documentation and checks, acceptance/integration/security review. Update task state after actual verification.

## Blockers observed before work

No TorBox key; Torrentio only P2P. Sports Streams catalogs resolve to HTML/no signal in the current sweep. AIOStreams healthy but does not manufacture sources. No configured public hostname/tunnel. Physical devices unavailable.

## Agent accounting

- OpenCode DeepSeek free planner attempt: rejected, free usage limit reached, no work returned.
- OpenAI GPT-6 Luna planner: read-only plan returned. Explicit user authorization to use OpenAI models; no model usage cost reported by tool.

## Status

### Continuation: actual playable content and provider setup diagnosis

User steering: only the configured addons are wanted. The curated open-film provider is now opt-in/off by default and must not be presented as completion of the requested addon VOD objective. Stop its full-file decode test; focus on normal provider setup and user-owned addon manifests/credentials.

- [x] Recognize Sports Streams' reinstall notice (not HLS failure), expose actionable409 status, and fix source/addon cache invalidation after manifest edits. Runtime TNT session now409 `source_setup_required` with official action for admin only.
- [x] Open-film prototype tested then disabled on explicit user correction: addons only. Runtime no longer returns its video source; it is OFF by default and not counted as requested VOD fulfillment.
- [x] Added regressions:112 web tests/typecheck/lint +2 Node manifest-validation tests; final Docker image deployed healthy. Optional prototype observations retained in audit20, cancelled decoder not a completed film test.
- [ ] Sports Streams' current configure page requires provider Turnstile verification; no bypass/fabricated freeUserId or payment. Working provider manifest must come from that normal setup flow.
- [ ] Provider configure page opened both in automation browser and Windows default browser on user's instruction. Await user's CAPTCHA completion and generated manifest. No `.secrets/sports-manifest.txt` exists yet; addon VOD remains without a direct/resolver source. Preserve all real remaining blockers.

- [x] Preserve baseline and inspect existing application.
- [x] Presentation implemented; empty-state screenshots inspected at 390/768/1440, self-rated14/18. Real populated VOD artwork not accepted because no available media.
- [x] English practice implemented and verified with synthetic subtitle/stream fixtures in Chrome; no real dialogue-sync claim.
- [x] Availability filtering implemented and regression-tested, including search refill and third-episode availability.
- [x] Docker healthy on3001; config and actual PIN-protected LAN link persisted across recreate/restart.
- [x] 99 tests, typecheck, lint, Docker production build, scoped independent review, browser checks and documented external blockers: `audit/18_FAMILY_RELEASE.md`.
- [ ] Universal real sports/VOD, external HTTPS family access, physical devices and sustained/full-film acceptance. These are NOT marked complete by the local feature delivery.

### 2026-11-01: live match access

- [x] Relay serves only stable files (`temp_file`, delete threshold, size-stability wait); 90 s sustained 1280×720 playback through a family link over the LAN address, 0.7% dropped frames, `spa` audio track with real program audio.
- [x] Fixed link redemption redirecting to `0.0.0.0` inside Docker; `baseUrl()` now uses the forwarded or `Host` header. Regression tests added (123 total).
- [ ] The 15:00 Boca–River broadcast, a physical second PC, Spanish commentary by listening and a public/internet endpoint remain unverified.
- [ ] VOD still blocked by `BAD_TOKEN` from TorBox; AIOStreams returns only P2P hashes.
- Evidence: `audit/21_LIVE_MATCH_ACCESS.md`.
