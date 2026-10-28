# Reutilización y licencias — Fubol

Actualizado: 2026-10-28. Este documento responde a una sola pregunta: **qué código
de terceros hay en Fubol, con qué licencia y qué se tomó de cada proyecto.**

Regla del repo: MIT/Apache/BSD se usan citando autor y licencia; GPL/AGPL se
consumen como servicio o proceso aislado; el código sin licencia se estudia y se
reimplementa, no se copia. La licencia del código nunca autoriza el contenido.

## 1. Dependencias que sí se distribuyen

| Componente | Versión | Licencia | Uso en Fubol |
|---|---|---|---|
| [Next.js](https://github.com/vercel/next.js) | 16.4.3 | MIT | Framework SSR/API de `web/` |
| [React](https://github.com/facebook/react) | 19.3.1 | MIT | UI |
| [hls.js](https://github.com/video-dev/hls.js) | 1.7.3 | Apache-2.0 | Player HLS, LL-HLS, ABR y recuperación |
| [Node.js](https://github.com/nodejs/node) | 22.5+ | MIT | Runtime, `node:sqlite`, `fetch`, crypto |
| [TypeScript](https://github.com/microsoft/TypeScript) | 5.9.3 | Apache-2.0 | Compilador (dev) |
| [Vitest](https://github.com/vitest-dev/vitest) | 5.0.5 | MIT | Tests (dev) |
| [ESLint](https://github.com/eslint/eslint) | 9.x | MIT | Lint (dev) |
| [typescript-eslint](https://github.com/typescript-eslint/typescript-eslint) | 8.x | MIT | Reglas TS (dev) |
| [ffmpeg](https://ffmpeg.org/) | distro | LGPL/GPL según build | Proceso externo opcional para audio sync; no se linkea |

Los avisos completos viajan en `node_modules` y en `package-lock.json`. Si se
redistribuye una imagen Docker, mantener el aviso MIT de Next/React y la licencia
Apache-2.0 de hls.js. hls.js no incluye un archivo `NOTICE` adicional.

## 2. Servicios y protocolos (no son código copiado)

| Fuente | Qué se usa | Condición |
|---|---|---|
| [Protocolo Stremio Addon](https://github.com/Stremio/stremio-addon-sdk) | Contrato HTTP público: manifest, catalog, meta, stream, subtitles | Implementación propia en TS; el SDK es MIT, no se copió código |
| [Cinemeta](https://v3-cinemeta.strem.io) | Metadata pública de películas/series | API pública; no provee streams |
| [TheSportsDB](https://www.thesportsdb.com) | Fixtures y resultados | API pública con key configurable; respetar límite y términos |
| [OpenSubtitles](https://opensubtitles.com) | Búsqueda/descarga de subtítulos | Requiere API key del operador y aceptación de sus términos |
| [ffsubsync](https://github.com/smacke/ffsubsync) | Sync por audio | MIT; sidecar opcional por HTTP, no se embebe |
| [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/) | Publicar `:3001` sin abrir puertos | Servicio externo, credenciales fuera del repo |

## 3. Proyectos estudiados y no copiados

| Proyecto | Licencia | Por qué no se copia | Qué se reimplementó |
|---|---|---|---|
| [AIOStreams](https://github.com/Viren070/AIOStreams) | AGPL-3.0 | Copyleft fuerte; se usa como servicio previo, no dentro del core | Idea de ranking y agregación |
| [Stremio Web](https://github.com/Stremio/stremio-web) | GPL-2.0 | Copyleft; solo se leyó el protocolo público | Cliente de addons propio |
| [NuvioTV](https://github.com/NuvioMedia/NuvioTV) / [NuvioStreaming](https://github.com/tapframe/NuvioStreaming) | GPL-3.0 | Copyleft; referencia de UX | Navegación, selector de fuentes y subtítulos |
| [Comet](https://github.com/g0ldyy/comet) | GPL-3.0 | Copyleft; servicio externo opcional | Nada |
| [alass](https://github.com/kaegi/alass) | GPL-3.0 | Se usaría solo como binario aislado; hoy no está integrado | Sync propio por envolventes |
| [go-astisub](https://github.com/asticode/go-astisub) | MIT | No hacía falta una dependencia Go | Conversión SRT/ASS→VTT en TS |
| [torrentio-scraper](https://github.com/TheBeastLT/torrentio-scraper) | Apache-2.0 | Contenido sin licencia; no se integra | Nada |
| [iptv-org/iptv](https://github.com/iptv-org/iptv) | Unlicense | Señales sin derechos verificados | Nada; el operador carga su lista |
| [MediaFusion](https://github.com/mhdzumair/MediaFusion) | MIT | Se consume por manifest si el operador lo decide | Nada en el core |
| [Threadfin](https://github.com/Threadfin/Threadfin) | MIT | Innecesario para esta fase | Parser M3U y normalización propios |

Ningún archivo de esos repos fue copiado a `web/src`. La implementación propia
pertenece a este repositorio; no se agregó una licencia nueva en esta etapa y los
tests de `web/tests/` son la evidencia de comportamiento.

## 4. Piezas reimplementadas (autoría Fubol)

| Pieza | Archivo | Test |
|---|---|---|
| Parser M3U tolerante a atributos y grupos | `web/src/lib/live/m3u.ts` | `tests/m3u.test.ts` |
| Cliente Xtream (login, categorías, canales) | `web/src/lib/live/sources.ts` | integrado en sesión |
| Probe + ranking + historial de fallos | `web/src/lib/live/probe.ts`, `rank.ts` | `tests/rank.test.ts` |
| Sesión multi-fuente y failover | `web/src/lib/live/session.ts` | `tests/playlist.test.ts` |
| Proxy HLS con reescritura y tokens | `web/src/app/api/stream/route.ts` | `tests/stream-token.test.ts` |
| Conversión SRT/ASS→VTT | `web/src/lib/subs/format.ts` | `tests/subs.test.ts` |
| Sync por correlación de envolventes | `web/src/lib/subs/sync.ts` | `tests/subs.test.ts` |
| Links, HMAC, PIN scrypt | `web/src/lib/links.ts`, `crypto.ts` | `tests/links.test.ts`, `crypto.test.ts` |
| Fixtures TheSportsDB + ICS | `web/src/lib/live/fixtures.ts` | `tests/fixtures.test.ts` |
| Cliente de addons y ranking VOD | `web/src/lib/addons.ts`, `vod/rank.ts` | `tests/rank.test.ts` |

## 5. Contenido y límites

- Fubol **no incluye** canales, películas, series, listas IPTV ni credenciales.
- El operador configura sus fuentes (M3U, Xtream, HLS, addons). La legalidad de
  esas fuentes es responsabilidad del operador.
- No se implementan scrapers de señales premium, bypass de captchas/Cloudflare ni
  DRM. Un stream con DRM no se reproduce.
- TheSportsDB y OpenSubtitles tienen términos propios; se usan con las keys del
  operador cuando corresponda.
- Las carátulas y metadata de Cinemeta pertenecen a sus titulares; se muestran
  como referencia, no se redistribuyen como catálogo propio.

## 6. Atribución mínima

Si se publica una copia o se redistribuye la imagen:

```
Fubol — app web familiar de streaming.
Incluye Next.js y React (MIT), hls.js (Apache-2.0) y Node.js (MIT).
Ver docs/REUTILIZACION.md para el detalle.
```

No afirmar que el proyecto es oficial de Stremio, AIOStreams, Nuvio ni de las
ligas/canales que aparecen en la agenda.
