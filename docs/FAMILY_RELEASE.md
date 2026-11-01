# Family web deployment

## Run in Docker

```powershell
docker compose -f compose.web.yml up -d --build
docker compose -f compose.web.yml ps
```

Open `http://<this-PC-LAN-address>:3001`. The PC must remain powered on. Docker restarts the application automatically when its engine starts. Data is stored outside the image in `data/fubol`; do not commit or publish that directory.

For a staging instance alongside the Node development server:

```powershell
$env:FUBOL_WEB_PORT = '3002'
docker compose -f compose.web.yml up -d --build
```

The container generates its own admin password at `data/fubol/admin-password.txt`. Read it locally, not in a chat or screenshot. Login at `/admin/login`. Create a family link with a PIN and an expiry. Generate links while accessing the application through its LAN URL (not localhost), so they have a host reachable by other devices. Manage and revoke links in `/admin`.

Optional local helper: `node scripts/create-family-access.mjs --origin http://<LAN-address>:3001` creates a 30-day link with a random six-digit PIN and writes `data/fubol/family-access.txt`. It refuses to overwrite an existing access file. Both files are ignored by Git; send the link and PIN privately only to intended family members. On this delivery that access file has already been created. The checked runtime and remaining media/remote-access blockers are in `audit/18_FAMILY_RELEASE.md`.

## Existing local configuration

The Stremio public addon protocol is already supported. A source code repository is not a source of films, subscription rights or account credentials. Existing addon manifests can be reused without copying another client's implementation.

Repository metadata checked against GitHub's API on 2026-10-28:

| Upstream | Verified license | Reuse decision |
| --- | --- | --- |
| [Stremio Web](https://github.com/Stremio/stremio-web) | GPL-2.0 | Reference client architecture; no application code copied. |
| [Stremio addon SDK](https://github.com/Stremio/stremio-addon-sdk) | MIT | Use the existing public manifest/catalog/meta/stream/subtitle protocol. No extra dependency needed. |
| [Nuvio TV Smart](https://github.com/NuvioMedia/NuvioTVSmart) | GPL-3.0 | Reference web/TV constraints; no application code copied. |
| [Nuvio Mobile](https://github.com/NuvioMedia/NuvioMobile) | GPL-3.0 | Native player code does not make browser P2P/MKV support appear. No code copied. |

The checked local Windows Stremio path contains its streaming-server directory; no Nuvio configuration was found at the checked `%APPDATA%/nuvio` path. This is not a claim that all user profile locations were searched. An installed native client and a GitHub repository do not expose its signed-in account configuration through this project automatically. No browser profile, account tokens or unrelated personal files were copied. A GitHub repository search for `metegol stremio` returned zero results; the existing repo audit still excludes that scraper. This is not an exhaustive search of every possible spelling/fork.

To copy only the repository's existing local web addon/source configuration into the Docker instance, run a preview first, then explicitly apply:

```powershell
node scripts/web-config-transfer.mjs --to http://127.0.0.1:3002
node scripts/web-config-transfer.mjs --to http://127.0.0.1:3002 --apply --include-provider-secrets
```

This local-only additive transfer reads `web/data/fubol.sqlite` read-only. It does not copy application sessions, application HMAC keys, the application admin password, history or family links. **Provider URLs and source configuration can contain credentials, including Xtream usernames/passwords or addon tokens.** Applying therefore requires the explicit `--include-provider-secrets` flag; the preview discloses this without printing values. Those provider credentials are transferred to the target's private config store, not stripped. Existing target source IDs are preserved. No global Stremio/Nuvio account tokens are extracted. For an addon configured in another client, export/copy its manifest from that client and use Admin → Addons; a sports addon uses Admin → Sources with its catalog ID and type.

## Live channels and the local relay

Argentine channels are configured with `relay: true`. The server re-encodes the
upstream HLS to H.264/AAC fragmented MP4 in 1-second segments, which is what
makes it play in a plain browser, and serves it through signed `/api/relay/...`
URLs scoped to the viewer's session. Without the relay many of these signals are
MPEG-TS or codecs the browser does not accept.

- The relay starts on the first request; a cold start takes about 1.5 s, and an
  idle job is stopped after 90 s. A restart of the container therefore means a
  short warm-up, not a broken link.
- Up to 4 channels can run at once. More viewers of the *same* channel share one
  relay job.
- Re-encoding adds roughly 2–4 s on top of the delay the broadcaster already has.
  No player can remove upstream latency. The player shows a latency chip and an
  "Ir al vivo" button past 10 s.
- Advertising inserted by the broadcaster stays in the picture; the relay does
  not alter content.

For a second PC on the same network, open `http://<this-PC-LAN-address>:3001`,
redeem a family link once, then use the channel page. `FUBOL_BASE_URL` matters
for links created behind a proxy: if it is unset, redirects use the `Host` header
the visitor sent, never the container's `0.0.0.0` bind address. See
`audit/21_LIVE_MATCH_ACCESS.md` for the measured playback, audio and
authorization evidence.

## Outside the home network

The private LAN address is **not an internet share link**. Public access requires a reachable HTTPS hostname, an approved reverse proxy or an authenticated private network (for example Tailscale). Never forward a router port directly to the admin panel. Set `FUBOL_BASE_URL` to the actual HTTPS origin and terminate TLS at the trusted proxy. Test anonymous rejection, PIN/permissions and revocation from an external connection before distributing links. No public hostname, VPN membership or DNS account is created automatically.

## TorBox and media

The optional curated open-film source is disabled by default and in the current runtime, per the user's request to use their addons only. It is not a replacement for the requested catalog.

TorBox can resolve supported media into direct files; it does **not host the Fubol web application**. It still needs a machine or server running this container. Load a valid user-owned key using the existing secure script; never commit a key or use a placeholder as if it worked. Configure the resulting provider manifest in the web admin, then verify an actual MP4/WebM/HLS source. P2P hashes, HTML pages and unsupported MKV files are excluded from browsing.

### Sports Streams reconfiguration

The old public link returns an installation message, not a signal. Open `https://sports.highfly.to/configure` in the regular browser and complete the provider's verification. Save the generated personal manifest in `.secrets/sports-manifest.txt`, then run `node scripts/apply-sports-manifest.mjs`. It validates the personal-config shape and manifest, updates the two existing web sports sources, and never prints the private URL. `aiostreams-config.mjs prepare` and `family-profile.mjs` also read the same private override when subsequently run. No CAPTCHA, account verification or payment is bypassed. A valid manifest still needs a real playback test.

Availability is a short-lived observation, not a promise: a provider can expire or remove a source. Browse checks are bounded; unknown/unverified titles are hidden rather than advertised. Search inspects up to 144 candidates and returns up to 48 available titles; home inspects up to 48 candidates. For a series, it checks up to 12 published episodes within a 12-second per-title observation window, not every season. Only a successful inspected episode makes that series visible. A playable episode outside that bounded sample can therefore be omitted. The player rechecks sources when opened.

## Non-negotiable external limits

- A player cannot remove latency already added by a broadcaster or upstream restream.
- No client repository guarantees every match, Spanish commentary or every film/series.
- Subtitle files must match the video edition. Reference correlation helps compare cues but cannot prove audio alignment. Manual offset and optional audio synchronization remain distinct tools.
- English practice supports deliberate listening and recall; it does not certify a CEFR level.
