# Family release — verified state, not universal media acceptance

Date: 2026-10-28. Repository `D:/Dev/fubol`. No commit, push, public tunnel or external message was made.

## Running now

- `fubol-web`: Docker standalone application on host port **3001**, healthy, non-root user `fubol`, restart policy `unless-stopped`.
- `aiostreams` and `caddy`: remain running and healthy; no unrelated containers removed.
- Independent deployment: `docker compose -f compose.web.yml up -d --build`.
- Existing web config transferred additively: **10 addons, 3 live sources**, no application secrets, history or old share links copied. Provider URLs/config were explicitly included with the credential-transfer flag; values were not printed.
- A new **30-day PIN-protected family link** was created. URL and random PIN are in ignored `data/fubol/family-access.txt`; admin password is in ignored `data/fubol/admin-password.txt`. The family link is **LAN-only**, not public internet access.
- After a container recreate and a separate restart, config counts and the actual family PIN login still worked. LAN-address health, family auth and channel listing each returned HTTP 200 from this host. This is not a second-device/firewall test.
- Image checks: no `/app/data`, no `/app/secret.key`; runtime database is mounted at `/data/fubol.sqlite`.

## Implemented and checked

| Requirement | Actual result |
| --- | --- |
| Docker execution | Build passed; final image deployed and healthy on 3001. Persistent data verified across restart. |
| Family permission/revocation | Anonymous signed-media request 401; wrong PIN 401; correct PIN 200; authorized media 200; live-only VOD request 403; revocation 200; previously valid signed media then 401. |
| Hide unavailable VOD | Search/home/browse require a checked compatible source. P2P-only, disguised HTML and unsupported MKV are excluded. Published episode scanning is bounded and documented. |
| Search refill and series checks | Fixtures cover a playable 49th search candidate and a playable third episode after earlier missing episodes. |
| Public-input safety | Redirect targets checked before requesting them; a regression prevents redirect-to-loopback fetching. Signed media/subtitles also require current sessions. No public response caching of media. |
| Cinematic presentation | Charcoal/red, feature/rails architecture, simplified navigation and honest empty states. Screenshots inspected at 390×844, 768×1024, 1440×900. No horizontal document overflow in tested pages. See `17_DESIGN.md`. |
| English practice | `/aprender` plus opt-in player panel: B1/B2/C1 guidance, English cue transcript, replay, 0.8×/1×, saved phrases, duplicate prevention and TSV export. Browser controls tested with a clearly synthetic subtitle/stream response, not real film dialogue. |
| Learning persistence | Browser test confirmed C1 and saved phrase after closing/reopening. Speed restored to 1×. Export produced `fubol-phrases.tsv`. |
| Fixture/channel matching | Removed the generic sports-group bonus that falsely associated every sports channel with unrelated Brazilian fixtures. Regression failed before fix and passed after. Final agenda had zero spurious watch links in inspected state. |

Final `npm run check`: **99 tests in 14 files**, TypeScript and lint passed. Docker's final production build passed. Script syntax checks and `git diff --check` passed (Windows line-ending warnings only).

After the final container restart, the real demo HLS player ran for 20.009 seconds: video advanced 16.571 seconds including startup, decoded 999 frames, zero error/stalled events. This was the demo only, without intercepted API responses; it is not sustained football acceptance.

## External objectives NOT met

- **Any football match, Argentine/Spanish commentary, zero delay:** not achieved. Three sampled Sports Streams entries returned HTML gates and failed browser decoding. The earlier 72-entry sweep found only the demo validated, but later inspection of that sweep's logs also revealed upstream **HTTP 429 rate limiting**. Many 404/no-source session results therefore do not prove permanent absence of upstream media. No repeated bulk sweep was performed after discovering this. No real Argentine broadcast was established.
- **Any movie/series:** not achieved. Torrentio is registered but P2P-only here, with no resolver credential. Final Shawshank search returned **zero available titles**, correctly hidden rather than advertised. Catalog browsing can therefore be empty.
- **Perfect real-film subtitle synchronization:** not achieved. Subtitle retrieval and synthetic/reference offset checks work, but no matching full film was available to validate audio alignment. The practice feature does not certify C1.
- **Family outside LAN:** not achieved. No reachable HTTPS domain, VPN or tunnel has been configured or externally tested. Do not distribute the LAN URL as an internet link.
- **TorBox hosting:** not a supported concept; it is a resolver, not a hosting platform. A future credential can help media resolution, but the web still needs this PC or a server.
- Physical iPhone/Android/TV tests, full-film playback, multi-hour expiry, 20-minute live stability and ten-minute three-stream acceptance remain unverified. A short Big Buck Bunny demo is not substituted for these objectives.

## Upstream reuse and review

GitHub repository/license metadata checked for Stremio Web (GPL-2.0), its addon SDK (MIT), Nuvio TV Smart and Mobile (GPL-3.0). No client application code or user account token was copied. Fubol already implements the public addon protocol. Repository existence does not supply media or remove network delay. Details and local config transfer instructions: `docs/FAMILY_RELEASE.md`.

OpenCode's free DeepSeek attempt was unavailable due quota. User-authorized OpenAI GPT-6 Luna handled planning, two disjoint implementation scopes and an independent review using the same sessions. Review findings on credential disclosure and scan coverage were corrected; corrective review returned LAN GO subject to runtime verification, public-internet NO-GO. Runtime checks above were subsequently completed. No human approval claimed; tool cost/usage totals were not supplied.

A concise English project guide was actually written to `D:/Facultad/UADE-Vault/Efforts/Proyectos/Fubol/Family web - engineering guide.md`, with a Mermaid decision flow and a verified link to the software class's cache/diagnosis discussion. No Atlas/MOC was changed.
