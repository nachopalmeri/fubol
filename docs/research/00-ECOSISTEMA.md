# Fase 0 — Mapa del ecosistema open source

Fecha: 2026-10-27. Licencias y actividad verificadas contra la API de GitHub y el
archivo `LICENSE` del repo (no de memoria). Stars al momento de la consulta.

## Regla de reutilización

| Licencia | Qué hacemos |
|---|---|
| MIT / BSD / Apache-2.0 / ISC / Zlib / Unlicense | Dependencia, fork o porte conservando copyright y aviso |
| GPL-2.0 / GPL-3.0 | Solo proceso aislado o servicio separado; nunca se linkea al core propietario |
| AGPL-3.0 | Se consume por red/API, no se copia código al core |
| Sin licencia / NOASSERTION sin LICENSE | Se estudia el comportamiento público y se reimplementa; no se copia |
| Contenido (partidos, películas, señales) | No se copia ni se reemite sin derechos |

La licencia del código no otorga derechos sobre el contenido. Fubol no incluye
scrapers de señales premium ni listas IPTV agregadas sin autorización; integra
**fuentes que el operador configura** (su IPTV, sus addons, sus canales oficiales).

## 1. Clientes y agregadores

| Proyecto | Licencia | Stars | Qué resuelve | Reutilización en Fubol |
|---|---|---:|---|---|
| [Stremio Web](https://github.com/Stremio/stremio-web) | GPL-2.0 | 14.8k | Cliente web de referencia del protocolo addons | Se estudia el protocolo público (manifests JSON); no se copia código |
| [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk) | MIT | 1.4k | Contrato de addons (catalog/meta/stream/subtitles) | Dependencia conceptual; nuestro cliente implementa el contrato en TS |
| [AIOStreams](https://github.com/Viren070/AIOStreams) | AGPL-3.0 | 3.0k | Agrega addons + debrid, gestiona usuarios y manifests | Se consume como servicio (manifest URL). No se copia al core |
| [MediaFusion](https://github.com/mhdzumair/MediaFusion) | MIT | 956 | Addon de catálogo/streams, deportes | Se consume por manifest; si se forkea, se conserva aviso MIT |
| [Comet](https://github.com/g0ldyy/comet) | GPL-3.0 | 1.1k | Búsqueda torrent/debrid rápida | Servicio externo opcional; sin copia |
| [Torrentio scraper](https://github.com/TheBeastLT/torrentio-scraper) | Apache-2.0 | 1.3k | Indexado P2P | No se integra al producto (contenido sin licencia) |
| [NuvioTV](https://github.com/NuvioMedia/NuvioTV) | GPL-3.0 | 3.2k | Cliente Android TV (Kotlin) | Se estudia su UX de fuentes/subtítulos; sin copia |
| [NuvioStreaming](https://github.com/tapframe/NuvioStreaming) | GPL-3.0 | 4.2k | Cliente móvil (Kotlin) | Ídem: referencia de UX y modelo de addons |
| [Jellyfin](https://github.com/jellyfin/jellyfin) | GPL-2.0 | 58.7k | Biblioteca propia | Integración futura por API (contenido propio) |

**Decisión:** el core de Fubol es un cliente web propio. Consume addons por HTTP
(protocolo Stremio) y fuentes HLS/M3U/XTream del operador. No embebe addons de
piratería; el operador decide qué manifest carga. Esto mantiene el código del
cliente limpio y la responsabilidad donde corresponde.

## 2. Vivo, IPTV y EPG

| Proyecto | Licencia | Stars | Qué aporta | Reutilización |
|---|---|---:|---|---|
| [MediaMTX](https://github.com/bluenviron/mediamtx) | MIT | 20.5k | LL-HLS / WebRTC / SRT / RTMP, restream propio | Sidecar opcional para señales propias |
| [Threadfin](https://github.com/Threadfin/Threadfin) | MIT | 1.8k | Proxy M3U/EPG para fuentes autorizadas | Referencia de normalización M3U/XMLTV |
| [ErsatzTV](https://github.com/ErsatzTV/legacy) | Zlib | 3.0k | Canales lineales desde biblioteca propia | Referencia de scheduling; no necesario ahora |
| [Streamlink](https://github.com/streamlink/streamlink) | BSD-2-Clause | 11.9k | Extrae HLS de sitios que lo permiten | No se usa para saltar logins/paywalls |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Unlicense | 202k | Extractores de sitios públicos | Solo como herramienta manual del operador; no en runtime |
| [iptv-org/iptv](https://github.com/iptv-org/iptv) | Unlicense | 142k | Listas públicas de canales | No se integra por defecto (señales sin derechos verificados) |
| [iptv-org/epg](https://github.com/iptv-org/epg) | Unlicense | 3.4k | Guías EPG de múltiples fuentes | Referencia de formatos; Fubol usa ICS + TheSportsDB |
| [Owncast](https://github.com/Owncast/owncast) | MIT | 11.6k | Emisión propia | Fuera de alcance |

**EPG de fútbol:** se usan hechos (fixtures), no video. TheSportsDB (API pública,
key de prueba `123`, límite comunitario) aporta fecha/equipos/competición; ICS
aporta calendarios oficiales que el operador pegue. El estado "en curso" se
deriva del horario (kickoff + ventana), no se inventan goles ni relato.

## 3. Players

Ver `01-PLAYER-Y-LATENCIA.md`. Resumen: **hls.js** (Apache-2.0, 17k stars) es la
base del player web; Shaka (Apache-2.0) queda como alternativa si se necesita
DASH/EME; Video.js (Apache-2.0) y Plyr (MIT, deprecado) se descartan como base
por peso y por no aportar baja latencia.

## 4. Subtítulos

| Proyecto | Licencia | Stars | Uso |
|---|---|---:|---|
| [OpenSubtitles REST](https://opensubtitles.com) | Servicio | — | Búsqueda/descarga con API key del operador |
| [SubDL](https://subdl.com) | Servicio | — | Búsqueda con API key |
| [ffsubsync](https://github.com/smacke/ffsubsync) | MIT | 3.4k | Sync por audio (VAD + correlación); sidecar opcional |
| [alass](https://github.com/kaegi/alass) | GPL-3.0 | 1.5k | Sync por audio rápido; solo binario aislado, no linkeado |
| [go-astisub](https://github.com/asticode/go-astisub) | MIT | 721 | Referencia de conversión de formatos; reimplementamos SRT/ASS→VTT en TS |
| [SubtitleEdit](https://github.com/SubtitleEdit/subtitleedit) | MIT | 14.7k | Referencia de algoritmos de sync y limpieza |
| [libass](https://github.com/libass/libass) | ISC | 1.2k | Render ASS avanzado (futuro, WASM) |
| [ass-compiler](https://github.com/weizhenye/ass-compiler) | MIT | 137 | Parseo ASS en JS si se necesita styling completo |

**Decisión:** búsqueda vía addons de subtítulos ya configurados (protocolo
Stremio) + OpenSubtitles/SubDL por API key opcional. Conversión SRT/ASS→VTT en
TS. Sync inmediato por offset y por correlación de envolventes entre dos pistas
(implementación propia, MIT). Sync por audio vía sidecar ffsubsync (MIT) cuando
el operador lo habilita.

## 5. Infra y observabilidad

| Proyecto | Licencia | Uso |
|---|---|---|
| [Caddy](https://github.com/caddyserver/caddy) | Apache-2.0 | HTTPS automático, reverse proxy, headers |
| [Grafana](https://github.com/grafana/grafana) | AGPL-3.0 | Opcional: paneles sobre métricas exportadas |
| [Uptime Kuma](https://github.com/louislam/uptime-kuma) | MIT | Opcional: alertas de disponibilidad |

Fubol expone `/api/health` y métricas propias por fuente; no requiere Grafana
para funcionar.

## 6. Qué se reimplementa y por qué

| Pieza | Origen | Cómo |
|---|---|---|
| Cliente addons | Protocolo Stremio (público) | Implementación TS propia (MIT) |
| Ranking/failover de fuentes | Idea general de AIOStreams/Nuvio | Algoritmo propio con probes y métricas |
| Rewrite de playlists HLS | Necesidad técnica | Implementación propia + tests |
| Conversión SRT/ASS→VTT | Formatos públicos | Implementación propia + tests |
| Sync por envolventes | Técnica publicada | Implementación propia (cross-correlation) |
| Remux HLS bajo demanda | ffmpeg (LGPL/GPL según build) | Se invoca como proceso externo, no se linkea |
| Player | hls.js (Apache-2.0) | Dependencia npm con aviso de licencia |

## 7. Descartados explícitamente

- Scrapers de canales premium y bypass de Cloudflare/captchas.
- Listas IPTV agregadas sin autorización.
- Repos sin licencia (se estudian, no se copian).
- Addons de torrents como dependencia por defecto: el operador puede cargar su
  manifest, pero Fubol no los distribuye ni los promociona.
