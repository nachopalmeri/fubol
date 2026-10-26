# Audit 15 — Addons, fuentes y latencia (investigacion)

Fecha: 2026-10-24
Alcance: investigacion tecnica y de ecosistema. No se extrajeron URLs de canales ni se ejecutaron scrapers de terceros.

## 1. ChocoPop TV

Identidad: `tv.chocopopflow.com`, parte de ChocoPop Flow. Se analizo solo el frontend publico.

| Pieza | Hallazgo |
|---|---|
| Generador | Blogger (widgets, CSS y feeds Atom) |
| UI | HTML + CSS + JavaScript propio |
| Player | `<video>` HTML5 + Hls.js 1.5.8 sobre MSE |
| Cast | Google Cast SDK |
| CORS | Proxies AllOrigins y CodeTabs |
| Config | Listas `tv` y `deportes` con URL, nombre y logo |

Flujo: si la URL termina en `.m3u8`, Hls.js la conecta al `<video>`; si no, asigna `video.src` directo y llama a `play()`. Contempla `.mp4` y `.ts` para Chromecast. Buffers de hasta 250 MB y 20 s de historial. Sin DRM visible ni frameworks (React/Vue/Video.js/Shaka/dash.js).

No se puede confirmar desde el frontend quien opera cada fuente, si tiene permisos ni el servidor final. Las etiquetas "Geo-blocked" indican restricciones por region. Es un agregador de terceros sin señales de licenciamiento; no se reutilizan sus fuentes.

## 2. MeteGol

Addon de Stremio para deportes en vivo. Arquitectura:

- **Agenda**: scrapea `alangulotv.si`, `futbollibretv.sx`, `agenda18.com` (backend de futbollibre.mx / rojadirectaa.net) y `deporflix.pe` como complemento.
- **Merge**: deduplica por titulo y combina enlaces del mismo partido; Deporflix solo agrega streams a eventos existentes.
- **Catalogo**: "MeteGol Live", portadas PNG generadas y escudos via TheSportsDB.
- **Extraccion**: peticiones HTTP + regex del `.m3u8`; no renderiza iframes ni carga publicidad.
- **Proxy**: HLS local en `127.0.0.1:7000` porque los tokens estan atados a IP y los datacenters estan bloqueados.
- **Exposicion**: Netlify para catalogo/manifest HTTPS + Cloudflare Tunnel al proxy local; Worker como respaldo (Fubo18 bloquea rangos de Cloudflare).

Su `docs/LEGAL.md` declara que los streams provienen de servicios que re-emiten canales de pago sin autorizacion (ESPN, Fox Sports, TNT Sports, Disney+, Liga 1 Max, UFC). Decision: no copiar, no ejecutar, no integrar.

## 3. Addons verificados (2026-10-24)

| Addon | HTTP | Version | Recursos | Riesgo |
|---|---|---|---|---|
| Torrentio | 200 | 0.0.15 | stream | P2P |
| Comet | 200 | 2.0.0 | stream | P2P |
| MediaFusion | 200 | 6.2.0 | stream/catalog/meta | P2P |
| Meteor | 200 | — | stream | P2P |
| AIO Metadata | 200 | 3.7.0 | configurable | oficial |
| Cinemeta v3 | 200 | 3.0.14 | catalog/meta | oficial |
| TMDB Addon | 200 | — | meta/catalog | oficial |
| OpenSubtitles PRO | 200 | — | subtitles | oficial |
| SubSource | 200 | 1.4.2 | subtitles | oficial |
| SubDL | 200 | 1.2.2 | subtitles | oficial |
| Stremio Community Subtitles | 200 | — | subtitles | oficial |
| SubSense | 200 | — | subtitles | oficial |

No disponibles en la verificacion: StremThru (404 en la raiz) y Sootio (DNS no resuelve). No se agregan al catalogo hasta confirmar una URL estable.

## 4. Latencia

Medicion previa sobre el origen Sky Sports: ventana HLS de 8×6 s, inicio del playlist ~76 s atras, borde ~28 s atras. El player arranca ~12 s antes del borde con `live_start_index=-2`.

| Etapa | Delay |
|---|---|
| Origen / re-stream | 20–35 s |
| Playlist | 6–12 s |
| Buffer | 8–18 s |
| Total | 35–45 s |

Para 3–8 s hace falta una fuente legal con LL-HLS o DASH low-latency. No se puede lograr con la fuente gratuita actual.

## 5. Cambios en Fubol

- `config/addons/catalog.json`: catalogo curado con licencia, riesgo y nota.
- `scripts/addons.mjs`: verificacion de manifests y generacion de pagina.
- `public/addons/index.html`: pagina de instalacion (sin secretos).
- `config/mpv/mpv.low.conf`: perfil de 8 s de cache.
- `scripts/mpv-latency.ps1`: instala perfil estable o bajo delay con backup y hash.
- `docs/ADDONS.md`: guia de instalacion y regla P2P.

## 6. Limites y riesgos

- Los scrapers P2P pueden indexar contenido sin licencia; el debrid no lo legaliza.
- Los eventos de Sports Streams pueden devolver 0 streams.
- AIOStreams Desktop no reproduce P2P; requiere TorBox para VOD.
- No se integran MeteGol, ChocoPop ni scrapers de canales de pago.
- La unica via para bajar de ~35 s es una fuente legal de baja latencia.
