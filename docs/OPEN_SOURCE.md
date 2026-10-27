# Open source: reutilizar sin robar

Fecha: 2026-10-27

Este documento separa **reutilizar codigo open source** de **copiar codigo sin
permiso**. No es asesoramiento legal: antes de redistribuir un fork, revisar la
licencia del repo y los avisos de copyright.

## Regla corta

| Licencia | Se puede reutilizar | Obligacion |
|---|---|---|
| MIT / BSD / Apache-2.0 | Si | Conservar copyright y aviso de licencia |
| GPL-2.0 / GPL-3.0 | Si | El derivado se distribuye bajo GPL |
| AGPL-3.0 | Si | Como GPL, y tambien si se ofrece como servicio en red |
| Zlib | Si | Conservar el aviso de origen |
| Sin licencia / NOASSERTION | No asumir permiso | Pedir autorizacion al autor |
| Propietario | No copiar | Solo usar la API/servicio en los terminos ofrecidos |

"Robar totalmente" un repo sin licencia es una infraccion de copyright, no una
forma de ahorrar trabajo. Si el objetivo es aprender, se puede estudiar el
comportamiento publico y escribir una implementacion propia.

## Repos verificados (2026-10-27)

Stars y licencia segun la API de GitHub; la licencia se contrasto con el archivo
`LICENSE` cuando estaba disponible.

| Proyecto | Stars | Licencia | Uso posible en Fubol |
|---|---:|---|---|
| [AIOStreams](https://github.com/Viren070/AIOStreams) | 3.0k | AGPL-3.0 | Ya es el agregador self-hosted. Un fork debe publicar el codigo bajo AGPL. |
| [MediaFusion](https://github.com/mhdzumair/MediaFusion) | 956 | MIT | Addon de streams/catalogos; se puede forkear con aviso. |
| [Comet](https://github.com/g0ldyy/comet) | 1.1k | GPL-3.0 | Addon de streams; un fork queda bajo GPL-3.0. |
| [Torrentio scraper](https://github.com/TheBeastLT/torrentio-scraper) | 1.3k | Apache-2.0 | Scraper P2P; reutilizable con aviso. |
| [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk) | 1.4k | MIT | Base para un addon propio de metadata o catalogo. |
| [hls.js](https://github.com/video-dev/hls.js) | 17k | Apache-2.0 | Player HLS para una pagina web propia. |
| [Shaka Player](https://github.com/shaka-project/shaka-player) | 8.3k | Apache-2.0 | Player DASH/HLS con soporte de baja latencia. |
| [mpv](https://github.com/mpv-player/mpv) | 37k | GPL-2.0+ | Ya es el player de escritorio; un fork queda bajo GPL. |
| [Threadfin](https://github.com/Threadfin/Threadfin) | 1.8k | MIT | Proxy M3U/EPG para una fuente autorizada. |
| [ErsatzTV](https://github.com/ErsatzTV/legacy) | 3.0k | Zlib | Canales lineales a partir de una biblioteca propia. |
| [Jellyfin](https://github.com/jellyfin/jellyfin) | 59k | GPL-2.0 | Servidor de biblioteca propia; no aporta vivo. |
| [MediaMTX](https://github.com/bluenviron/mediamtx) | 21k | MIT | Restream propio con LL-HLS/WebRTC/SRT. |
| [Owncast](https://github.com/owncast/owncast) | 12k | MIT | Emision propia con chat; no es una fuente de deportes. |

## Ya usado por Fubol

- **AIOStreams**: contenedor self-hosted; licencia AGPL-3.0.
- **MediaFusion / Comet / Torrentio / Meteor**: addons remotos; no se copia su
  codigo, se consume su manifest.
- **Caddy**: proxy HTTPS; Apache-2.0.
- **mpv**: player de escritorio; GPL-2.0+.
- **Addons de metadata y subtitulos**: se consumen como servicios hosted. La
  licencia figura como `verificar` en `config/addons/catalog.json` cuando no se
  encontro un repo publico con licencia.

## Excluidos a proposito

- **MeteGol**: scrapea y reemite canales de pago; su propio `LEGAL.md` lo
  reconoce. No se copia, no se ejecuta, no se integra.
- **ChocoPop TV**: frontend propietario sobre Blogger/Hls.js; no hay repo con
  licencia. Se estudio su tecnologia publica, no se extrajeron sus fuentes.
- **Listas IPTV agregadas** (`iptv-org` y similares): muchas señales no tienen
  autorizacion del titular. No se integran como catalogo de Fubol.
- **Scrapers de futbol premium**: aunque el codigo sea MIT, el contenido que
  indexan no esta licenciado. No se agregan.

## El limite que no resuelve ningun repo

Ningun repositorio de GitHub otorga derechos sobre un partido. Para vivo legal
hace falta una señal autorizada (por ejemplo, el servicio oficial que tenga los
derechos en tu pais). Si esa señal existe y es LL-HLS/DASH, MediaMTX o Threadfin
pueden restreamearla en la LAN y mpv/hls.js pueden reproducirla con baja latencia.
Sin esa señal, solo queda el contenido que ya tengas licenciado o las apps
oficiales; no se agregan scrapers de canales de pago.
