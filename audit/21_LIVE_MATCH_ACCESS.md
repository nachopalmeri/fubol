# Live match access — relay, LAN link and Superclásico readiness

Date: 2026-11-01 (America/Argentina/Buenos_Aires).

Scope: make a live Argentine channel play through a family link from a second
PC on the same LAN, for Boca vs River at 15:00. Evidence below is from this
machine and its Docker container; no external device was available.

## What was fixed

1. **Relay served half-written files.** ffmpeg writes the HLS playlist in place,
   so a request could read a truncated playlist mid-rewrite. Added
   `-hls_flags temp_file` and `-hls_delete_threshold 6`, and
   `waitForRelayFile` now returns a file only after its size is stable
   (150 ms for playlists, 100 ms for segments).
2. **Link redemption redirected to the container bind address.** Inside Docker,
   `request.url` is built from `HOSTNAME=0.0.0.0`, so `/f/<code>` answered
   `307 → http://0.0.0.0:3001/`, which no other PC can open. `baseUrl()` now
   prefers `x-forwarded-host`, then the `Host` header, then the URL host, and
   `/f/[code]` builds its redirects from it.

## Verification (fresh evidence, 2026-11-01 10:35–10:50)

Playback through the family link over the LAN address
(`http://192.168.0.122:3001/f/<code>` → `/watch/live/e83dff1508ffb9ff`,
Chromium via Playwright, cookies cleared first):

| t (s) | readyState | resolution | currentTime | frames | dropped | audio bytes |
| --- | --- | --- | --- | --- | --- | --- |
| 15 | 4 | 1280×720 | 14.9 | 880 | 1 | 244 300 |
| 35 | 4 | 1280×720 | 35.0 | 2 079 | 13 | 572 951 |
| 60 | 4 | 1280×720 | 57.4 | 3 413 | 23 | 967 646 |
| 90 | 4 | 1280×720 | 88.8 | 5 210 | 37 | 1 465 105 |

- 88.8 s of continuous playback in 90 s, no fatal player error, no source
  failover. Dropped frames 37/5 210 (0.7%) with a browser and the ffmpeg relay
  competing for the same CPU.
- A separate 75 s run on the admin session reached 70.5 s and 4 152 frames with
  4 dropped frames.

Relay output probed inside the container:

- video: H.264, browser reports 1280×720, `objectFit: contain`; captured frame
  is full 16:9 with the broadcast scoreboard, no stretching.
- audio: AAC-LC, 48 000 Hz, stereo, 129 kb/s, `language=spa`,
  `mean_volume -25.0 dB`, `max_volume -7.7 dB` (real program audio, not silence).

Link and authorization path over the LAN address:

| Check | Result |
| --- | --- |
| `/f/<code>` redemption | 307 → `http://192.168.0.122:3001/` (correct host) |
| session cookie issued | yes |
| home page | 200 |
| `/api/live/session?channel=e83dff1508ffb9ff` | 200, one relay source |
| relay playlist / init / segment | 200, `#EXTM3U`, 1 385 B init, ~250–350 KB segments |
| request without a session | 401 |

Cold start after a container restart: playlist in 1.35 s, `init.mp4` in 125 ms,
first segment in 130 ms.

Network readiness: the container publishes `0.0.0.0:3001`, the active profile is
Public, "Docker Desktop Backend" inbound allow rules exist, and AC/DC sleep and
hibernate timeouts are 0.

## What this does not prove

- The 15:00 broadcast itself. At 10:40 the same channel was showing another
  match (scoreboard `0-1`, 43:38), so the relay is confirmed working, not the
  specific fixture.
- Spanish *commentary* by listening. Only the track language tag (`spa`) and the
  Argentine broadcaster are evidence.
- A physical second PC, Wi-Fi stability, or more than one concurrent viewer
  (relay allows 4 jobs).
- Zero delay. The relay re-encodes to H.264/AAC fMP4 with 1 s segments, which
  adds roughly 2–4 s on top of the origin's own HLS delay. The player exposes a
  latency chip and an "Ir al vivo" button above 10 s.
- No ads: the relay copies the broadcaster's picture as-is. It cannot remove
  advertising inserted upstream.
- VOD remains blocked by the invalid TorBox key (`BAD_TOKEN`); AIOStreams only
  returns P2P hashes.

## Operational notes

- The container must stay running; restarting it drops the relay job (it warms
  again in about 1.5 s on the next request).
- Losing the LAN means losing access: this is still not an internet link.
  Public access needs an HTTPS hostname or a private network such as Tailscale,
  with `FUBOL_BASE_URL` set accordingly.
- The working link is written to `.secrets/other-pc-link.txt` (7 days, no PIN)
  and is not committed.
