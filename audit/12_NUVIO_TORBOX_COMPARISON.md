# Comparison checkpoint: Fubol vs. Nuvio / TorBox

Date checked: 2026-10-24.

## Verified from official pages

- Nuvio (`https://nuvio.tv/`) describes itself as a free, open-source media client. It says it
  does **not** host, store, or provide media; sources/addons must be connected separately.
- The Nuvio site lists iOS, Windows, and Samsung Tizen builds, but its iOS section currently says
  **TestFlight unavailable**. This does not establish compatibility with the family's 2015
  Samsung UN32J4290/Tizen 2.3; that must be checked on that TV or in the exact release notes.
- Stremio's official iPhone guide recommends Stremio Web as a Safari PWA with VLC or Outplayer as
  the external player. It warns that iOS Web lacks some features; real family playback still needs
  an iPhone test: <https://blog.stremio.com/using-stremio-web-on-iphone-ipad/>.
- The official page does not identify a product called **“Nuvio Prime”**. It may be a third-party
  package/service. Do not claim Fubol is more complete until the user shares its exact URL or
  feature list.
- TorBox official pricing (`https://torbox.app/pricing`) currently lists a **Free** tier: one
  concurrent slot, 24-hour cooldown, 10 downloads/month, 10 GB max per download, 250 Mbps, reduced
  traffic priority, and API/third-party-app access. It is suitable for a limited no-paid-plan
  trial, not a fair REMUX performance test when a file exceeds 10 GB.

## Fubol evidence today

- Windows client installed at `D:\Fubol\Client`; Desktop and Start Menu shortcuts named **Fubol**.
- AIOStreams and Caddy are healthy. The desktop home loaded the sports-first rows and Spanish
  catalog names after the server was restarted.
- The independent family profile exists with its own manifest credentials in the ignored,
  restricted `.secrets/family-user.env`; these are not the owner's credentials.
- Family iPhone setup page is generated locally in the ignored `public/family/index.html`, served
  only on HTTPS to private IPs. HTTP serves only the public CA bootstrap profile; other paths
  redirect to HTTPS.
- VOD has not been tested: no TorBox key exists. Without the key, movie/series endpoints return
  zero streams by design. This is not yet comparable to any service with working VOD.
- Sports catalog is present, but measured free HLS latency is ~36–75 seconds. Argentine fixtures
  may not have a usable source; zero-delay viewing requires an open-TV broadcast and an antenna.

## Decision

Do not buy a TorBox plan or describe Fubol as “better/more complete” yet. A small Free-tier test
can validate a compatible VOD file and ES/EN subtitle controls first. To compare against the
specific “Nuvio Prime” offer, record its catalog, sports channels, price, supported devices, and
latency using the actual product page/user evidence.
