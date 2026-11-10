# Fubol — estado de ejecución

Actualizado: 2026-11-10

## Despliegue en Vercel (2026-11-10) — lo prioritario funcionando
- [x] Front y back publicados en `https://fubol-five.vercel.app` (proyecto `fubol`, equipo `nachopalmeris-projects`). Vercel CLI 59.23.2, login `nachopalmeri`.
- [x] Estado persistente sin Turso ni click legal: un documento JSON con links, fuentes, addons y ajustes, sobre **Vercel Blob privado** (`fubol-state`, `fubol/state.json`) con escritura CAS por ETag. SQLite sigue siendo el backend de Docker/local, con migración automática desde las tablas viejas.
- [x] Bug real encontrado en producción: `get()` devuelve ETag **débil** (`W/"…"`) y `put()` con `ifMatch` exige el fuerte → toda escritura posterior al seed fallaba con 412 y crear un link familiar devolvía 500. Normalizado en `state/blob.ts`.
- [x] Bug real encontrado en producción: `TZ=":UTC"` en Vercel hacía que `Intl.DateTimeFormat` tirara `RangeError` y rompiera el render de la home. `env.safeTimeZone()` normaliza y valida.
- [x] **Addons: manifest personal de Sports Streams aplicado** (estaba en `.secrets/sports-manifest.txt`). Con el manifest público el proveedor exige verificación y todo canal devolvía 409; con el personal se resolvieron 43 canales.
- [x] **Token atado a la IP**: el JWT del proveedor incluye la IP de quien lo pidió y rechaza la misma URL desde otra dirección (`403 Stream already active on another device`). Como Vercel rota la IP de salida entre invocaciones, el proxy repregunta al addon en cada request (`/api/stream` lleva la referencia del addon en el token firmado). Verificado: Sky Sports Premier League y TNT Sport 2 con playlist 200 y segmentos reales de 3-6 MB; en el navegador 1920x1080 con el delay del origen medido.
- [x] Panel: ahora se puede **reemplazar el manifest** de un addon (`PATCH /api/admin/addons/[id]`) y de una fuente viva (`PATCH /api/admin/sources/[id]` acepta `url`), con validación del manifest antes de guardar, botón "Configurar ↗" al proveedor y guía por tipo de addon.
- [x] Panel → Salud muestra la **IP de salida** y avisa cuando el deployment rota entre varias: es la causa de los 403 "stream already active".
- [x] Sin sustitutos gratuitos: se sacaron los canales públicos de prueba y la franja "Señales que funcionan ahora". `FUBOL_OPEN_FILMS` quedó sin definir (Internet Archive queda disponible pero apagado detrás de la variable).
- [x] Verificación end-to-end en el deploy: home, /live, /peliculas, /buscar, panel (links, fuentes, addons, salud), link familiar `/f/CODIGO`, película MP4 (640x480, 95 min) con pista de subtítulos, vivo HLS 1080p.
- [ ] **Pendiente del usuario**: manifest propio de SubSource, SubDL, Community Subtitles, SubSense y OpenSubtitles PRO (piden cuenta). Con la URL pegada en el panel, cada uno queda operativo.
- [ ] **Pendiente del usuario**: token de debrid para Torrentio/AIOStreams. Sin debrid el addon devuelve `infoHash` y el navegador no lo abre. El manifest personal de AIOStreams en `.secrets/` apunta a `192.168.0.122` (LAN), no alcanzable desde Vercel.
- [ ] Pendiente del usuario: rotar `FUBOL_ADMIN_PASSWORD` y `FUBOL_SECRET` si se comparten fuera de esta máquina.
- [ ] El relay de ffmpeg sigue sin existir en Vercel: las fuentes con `relay: true` degradan a la señal original con aviso explícito en la sesión.

## Family release (current runtime, supersedes older startup notes)
- [x] Continuation: Sports Streams root cause is a reinstall notice, not a real stream. New configure flow requires provider verification; normal browser opened for user. Runtime diagnostics409 and cache invalidation fixed;112web+2Node tests pass.
- [ ] Await generated personal Sports Streams manifest (provider CAPTCHA). User rejected an open-film substitute; it is disabled by default and in Docker. Requested addon VOD still needs usable direct/resolver sources.
- [x] Docker `fubol-web` healthy on3001, independent `compose.web.yml`, non-root and persistent `data/fubol`; AIOStreams/Caddy preserved.
- [x] Existing10addons/3sources transferred via explicit local credential-config opt-in. New30-day PIN family link saved privately in `data/fubol/family-access.txt`; LAN auth verified after restart.
- [x] Availability-first VOD filtering, cinematic presentation, English practice and signed-media revocation checks; final99tests/typecheck/lint/Dockerbuild pass.
- [x] Agent review and rendered390/768/1440screenshots; acceptance evidence in `audit/18_FAMILY_RELEASE.md`.
- [ ] Real football/Spanish commentary, working VOD resolver credentials, external HTTPS access and physical/long-running acceptance remain blocked or unverified. Historical broad sports sweep also encountered upstream429; do not claim all entries permanently dead.

## Verificación integral en curso (2026-10-28)
- [x] Diagnosticar arranque AIOStreams: reconstrucción inicial del dataset de anime tardó 4m 9s; luego terminó de iniciar y quedó healthy, sin reinicios.
- [x] Ejecutar typecheck, lint, 83 tests y build web final.
- [x] Verificar runtime, manifests, catálogo, reproducción de prueba, subtítulos y enlaces familiares en Chrome.
- [x] Registrar matriz de objetivos aprobados/fallidos/bloqueados con evidencia, sin confundir fixtures con contenido real: `audit/16_WEB_ACCEPTANCE.md`.
- [x] Registrar Torrentio en web y Sports Streams como dos fuentes de catálogos (22 fútbol + 49 en vivo). Barrido de las 72 entradas: solo la demo validó video; 71 deportivas sin fuente válida.
- [x] Conectar OpenSubtitles v3 funcional: tres películas + un episodio con pistas ES; proxy WebVTT HTTP 200 y sync de referencia contra sí misma con offset 0 ms.
- [x] Corregir falsos HLS: probes rechazados ya no aparecen como fuentes reproducibles. Regresión HTML/falso m3u8/503/HLS válido cubierta por cuatro tests.
- [x] Renombrar Test HLS como demo técnica Big Buck Bunny (no es TV).
- [ ] Resolver video VOD: Torrentio P2P registrado, pero falta resolver compatible/credencial TorBox; cero fuentes web en los cuatro títulos probados.
- [ ] Conseguir señal deportiva reproducible; TNT SPORT 2 del catálogo no confirma TNT Sports Argentina. No se completaron fútbol real, continuidad 20 min ni VOSE sincronizado con película.
- [ ] Validar dispositivos físicos, acceso remoto, película completa y pruebas largas; no fueron sustituidos por el smoke de demo ni por emulación móvil.

## F7 — App web familiar (`web/`)
- [x] Fase 0: informe en `docs/research/` (ecosistema, player/latencia, subtítulos, distribución, plan)
- [x] Next.js 16 + React 19 + TS estricto + hls.js + SQLite nativo
- [x] Motor vivo HLS/M3U/Xtream/addon: probe paralelo, ranking, failover, proxy firmado anti-SSRF
- [x] Fixtures TheSportsDB + ICS, hora argentina y estado en curso
- [x] VOD por protocolo Stremio + Cinemeta; catálogo, búsqueda, meta, streams y subtítulos
- [x] Subtítulos SRT/ASS→VTT, offset manual, sync por envolventes y audio sidecar opcional
- [x] Auth HMAC, links `/f/CODE` revocables, PIN opcional, admin y rate limit
- [x] UI dark mobile-first: home, vivo, películas, series, búsqueda, watch, admin y PWA
- [x] Tests (79, incluido addon fixture end-to-end) + typecheck + lint + build
- [x] Dockerfile standalone + servicio `fubol` en compose + healthcheck
- [x] CI en `.github/workflows/ci.yml`
- [x] Docs `docs/FUBOL.md` y `docs/REUTILIZACION.md`
- [x] “Sin fuentes”: CTA de admin a `/admin?tab=addons`, aviso de addon de streams y acceso por pie de página
- [x] `postbuild` borra `.next/standalone/data` (Turbopack trazaba SQLite/secretos)
- [x] Smoke del build standalone en :3002 (link, admin, addons, CTA)
- [ ] Probar con fuente real de fútbol argentino y medir latencia/estabilidad
- [ ] Probar en iPhone/Safari y Android/Chrome reales
- [ ] Cloudflare Tunnel nombrado + link público para la familia pasando por Caddy/túnel
- [ ] Remux MKV/AC3→fMP4 para VOD (fase siguiente)
- [ ] Build de Docker `fubol` (daemon no disponible en la última pasada; `compose config` OK)

## F0 — Runtime y baseline
- [x] Verificar virtualización (SVM/SLAT: OK)
- [x] Instalar Docker Desktop 4.96.0 + Compose v5.6.0
- [x] Reiniciar Windows (DISM 3010 resuelto)
- [x] `wsl --update` + verificar WSL2 (WSL 3.0.3.0, kernel 6.18.54.1)
- [x] `docker info` con engine real (29.9.1, 12 CPU, 8.29 GB)
- [x] `bash setup.sh` (migración `.env` con backup)
- [x] `docker compose up -d` (core: aiostreams + caddy healthy)
- [x] `bash scripts/stage-a-check.sh` (10 PASS / 0 FAIL)
- [x] Login real del panel (200 / cookie 200 / password mala 401)
- [x] Cerrar `audit/10_RUNTIME_BASELINE.md` con evidencia
- [ ] Pin de imágenes (diferido a F5; digests en audit/10)
- [ ] Instalar CA en clientes (F3/F4)

## F1 — VOD E2E (TorBox)
- [x] Configuración real de AIOStreams (9 presets, 13 catálogos, manifest 200)
- [x] Gate de autenticación del panel (`AIOSTREAMS_AUTH_REQUIRED=true`)
- [x] Subtítulos ES/EN disponibles (167 para `tt0111161`; 45 ES / 122 EN)
- [x] Validador de clave TorBox (faltante=2, inválida=1; no imprime la clave)
- [x] Script seguro `scripts/set-torbox-key.ps1` (pregunta oculta, valida y aplica `prepare`)
- [x] Perfil familiar independiente con manifest privado (`scripts/family-profile.mjs`)
- [x] Sin clave: modo P2P; Torrentio/Comet/MediaFusion devuelven `infoHash` (película 508, serie 314) para Stremio/Nuvio; Desktop no reproduce P2P
- [x] Catálogos Cinemeta curados (6) + 7 de deportes; home de la app con 13 filas verificado
- [x] Hardware relevado: Ryzen 5 3600, RTX 2060 Super 8 GB, 16 GB RAM, monitor 1080p
- [x] VOD ajustado a 1080p REMUX/BluRay máximo, HEVC permitido; 2160p/1440p excluidos por monitor/TV
- [ ] Verificar 1080p REMUX/HEVC real y subtítulos VOSE con TorBox
- [ ] Clave en `.secrets/torbox.key` (usuario)
- [ ] Activar TorBox y verificar `torbox_configured=true`
- [ ] Resolver película: ffprobe + Range 99%
- [ ] Playwright: play/seek/pausa/resume/subtítulo ES/`ended`
- [ ] Offset manual de subtítulos persistente
- [ ] Prueba de expiración 3 h
- [ ] Película completa de punta a punta

## F2 — Deportes en vivo
- [x] Integración de Sports Streams (Live Now, Today, Football y categorías)
- [x] Home deportivo reordenado por prioridad: `Fútbol` primero, `En vivo internacional` segundo
- [ ] Conseguir/verificar fuente argentina en español o Premier con relato de Bambino; no inventar audio/canales
- [x] HLS real 1080p H.264/AAC y reproducción en app de escritorio
- [x] Prueba de cliente web: Chrome no reproduce HLS (limitación confirmada)
- [ ] **Prioridad máxima: fútbol argentino sin delay ni lag**
- [x] Latencia HLS medida: ~76 s al inicio del playlist y ~28 s al borde; con `live_start_index=-2` el player arranca ~12 s antes del borde (~35-45 s total); no es cero-delay
- [x] Config mpv de bajo delay instalada en `D:\Fubol\Client\data\mpv\mpv.conf` y `D:\Fubol\MamaClient\data\mpv\mpv.conf` (`config/mpv/mpv.conf`, `scripts/install-mpv-config.ps1`)
- [x] Sports Streams con `hideTip:true` en el manifest; el stream falso “Tip: Use an external player” ya no aparece
- [x] Fixtures argentinos detectados: River vs Racing (25/10 22:15 UTC) e Independiente vs Boca (25/10 20:00 UTC); sin fuente hasta el kickoff
- [ ] Probar esos partidos en vivo y medir latencia/estabilidad reales
- [ ] Confirmar antena conectada y qué partido va por TV abierta; no hay cable en casa
- [ ] Benchmark Sports Streams vs MediaFusion
- [ ] Cobertura fútbol argentino/Libertadores/Champions/Premier
- [x] Error de evento sin fuente: health JSON filtrado; ahora muestra `No streams found`
- [x] Cobertura de 8 eventos: 4 con HLS real, 3 sin streams, 1 solo con enlace HTML descartado
- [x] Canales verificados: Sky Sports Premier/F1/Golf/Tennis/News, Fox Sports 1/502, TSN 1/5
- [ ] Latencia, estabilidad 20 min, recuperación de corte
- [ ] Evaluar `iptv-org` curado como complemento (ver auditoría 11)

## F3 — LAN/familia
- [x] Cliente de escritorio portable probado con HLS real (mpv)
- [x] Acceso directo **Fubol** en Escritorio y Start Menu; cliente en `D:\Fubol\Client`
- [x] Acceso directo oficial **LPF Play - AFA** en Escritorio y Start Menu
- [x] Perfil AIOStreams familiar separado; credenciales/manifest solo en `.secrets/family-user.env`
- [x] Perfil CA iPhone listo y descarga LAN por `http://192.168.0.122/family-setup/Fubol-LAN-CA.mobileconfig`
- [ ] Instalar/confiar CA y probar reproducción en el iPhone real
- [ ] Probar conexión PC→TV por HDMI (sin compra); Android TV stick solo con autorización
- [ ] Tailscale (solo después de validar LAN)

## F4 — Remoto/seguridad
- [ ] Tailscale + ACL + prueba desde datos móviles
- [ ] Escaneo externo sin puertos
- [ ] Rotación de secretos y limpieza de CAs

## F5 — Estabilidad/performance
- [ ] 3 streams concurrentes 10 min
- [ ] Uptime Kuma + logs
- [ ] Pin de imágenes + backup/restore

## F6 — Docs/aceptación
- [ ] `audit/11_ACCEPTANCE.md`
- [ ] Obsidian `Efforts/Proyectos/Fubol/` + SVG
- [x] Guía familiar de una página: `docs/GUIA_FAMILIA.md`
- [x] Guía de TV: `docs/TV.md`
- [x] Guía iPhone: `docs/GUIA_IPHONE.md`
- [x] Comparación con Nuvio/TorBox: `audit/12_NUVIO_TORBOX_COMPARISON.md`
- [x] Auditoría de los addons pedidos y compatibilidad: `audit/14_ADDON_REVIEW.md`
- [x] Home en español y deportes primero (`En vivo`, `Fútbol`, `Películas`, `Series`)

## Bloqueos activos
- Clave TorBox no cargada (F1) — siguiente acción del usuario.
- La app web (`/jellyfin/web/`) no reproduce HLS; para deportes y MKV usar la app de escritorio o Android con mpv.
- La TV Samsung 2015 requiere conexión PC→HDMI o un stick (F3); el stick no se compra sin permiso.
- Falta instalar el perfil CA y probar playback en el iPhone real (F3).
- `iptv-org` no se integra aún: M3U no nativo + calidad variable (decisión diferida).
- ~~Sports Streams deja un stream informativo `💩 Unknown` (“If streams are not working”)~~: resuelto con `hideTip:true` en el manifest del addon.
- Algunos eventos del catálogo son solo agenda (partido futuro o sin fuente): el addon devuelve un aviso y la app puede mostrar `Playback failed` si se intenta. Usar `Live Now`/canales para reproducción confiable.
- `TNT Sport 1/2` no tenían fuente real en la última medición; para Libertadores/fútbol argentino dependemos de que el upstream publique el HLS.
- Sports Streams no devolvió canales argentinos al buscar Argentina/TyC/ESPN Argentina/ESPN Premium/TNT Sports/Premier League. La entrada TyC de iptv-org devolvió HLS 200, pero no se verificó audio, derechos ni relato; sigue fuera de la app.
- Sin TorBox, VOD funciona en Stremio/Nuvio por P2P (`infoHash`), pero **AIOStreams Desktop no reproduce P2P**: para VOD en Desktop hay que cargar `.secrets/torbox.key` y ejecutar `prepare`.
- “Cero delay” no se puede garantizar con HLS gratuito: el origen medido está ~25-35 s detrás y el player suma ~12 s (~35-45 s total). Si el origen es un re-stream de TV puede estar más atrasado. En esta casa no hay cable; la antena debe confirmarse en la TV. Si no está conectada o el partido no sale en TV abierta, internet mantiene delay.
- La TV Samsung UN32J4290 (Tizen 2.3) no puede instalar AIOStreams/Stremio; usar la PC por HDMI o autorizar un stick.
- El iPhone necesita confiar la CA local; MKV no es nativo en Safari y aún falta una prueba real de reproducción.

## Hecho 2026-10-27 (cold start + licencias)
- Docker Desktop estaba caído tras el reinicio; se levantó el núcleo y `aiostreams` + `caddy` quedaron healthy.
- AIOStreams: healthcheck con `start_period: 180s`. El arranque sincroniza datasets (~90 s en volumen nuevo) y antes se marcaba unhealthy; `docker compose up -d` fallaba por la dependencia de Caddy.
- Licencias corregidas: AIOStreams AGPL-3.0, Comet GPL-3.0, Torrentio Apache-2.0, Meteor sin licencia. Addons hosted sin repo verificable = `verificar`; no asumir MIT.
- `docs/OPEN_SOURCE.md`: reglas de reutilización, repos verificados y proyectos excluidos.
- Página regenerada: 17 addons, 12 OK, 0 caídos; `https://192.168.0.122/addons/` -> 200.

## Hecho 2026-10-26 (HTTPS LAN)
- HTTPS por IP arreglado: `default_sni {$SERVER_HOST}` en el bloque global del `Caddyfile`. Caddy 2.11.7 no caia al certificado por defecto cuando el cliente no mandaba SNI; buscaba la IP interna del contenedor y devolvia `no certificate available`.
- Verificado: `https://192.168.0.122/addons/` -> 200 con 17 tarjetas; `https://192.168.0.122/` -> 200; `caddy validate` -> `Valid configuration`.

## Hecho 2026-10-24 (noche, addons)
- Catálogo curado `config/addons/catalog.json` con 17 addons oficiales/open source/configurables, licencia, riesgo y nota; separa P2P de vivo oficial.
- `scripts/addons.mjs` verifica manifests en vivo y genera `public/addons/index.html` sin secretos.
- Verificación: Torrentio, Comet, MediaFusion, Meteor, AIO Metadata, Cinemeta, TMDB, OpenSubtitles PRO, SubSource, SubDL, Community Subtitles y SubSense responden 200. StremThru y Sootio no tienen URL estable y quedan fuera.
- `config/mpv/mpv.low.conf` + `scripts/mpv-latency.ps1`: perfil de 8 s con backup y verificación de hash; el estable de 18 s sigue siendo el default.
- `docs/ADDONS.md` y `audit/15_ADDONS_AND_LATENCY.md`: instalación, regla P2P, presupuesto de latencia y límites legales.
- No se integraron MeteGol, ChocoPop ni scrapers de canales de pago: solo se documentó su tecnología pública.

## Hecho 2026-10-24 (noche)
- VOD sin TorBox pasó de “0 streams” a modo P2P: película `tt0111161` devuelve 508 streams `infoHash`; serie `tt0944947:1:1` devuelve 314. Stremio/Nuvio los reproduce; AIOStreams Desktop no.
- `scripts/lib/torbox-mode.mjs` centraliza la regla: con clave, TorBox + service wrap; sin clave, sin servicio y presets P2P activos (`knaben`, `stremthruTorz`, `animetosho` quedan off porque exigen debrid).
- `scripts/aiostreams-config.mjs status` ahora informa `vod_mode=p2p|debrid`.
- Sports Streams: manifest con `hideTip:true`; el stream falso “Tip: Use an external player” desapareció y los catálogos conservaron sus IDs (`sports-streamse3b0.*`).
- mpv de bajo delay: `live_start_index=-2`, `cache-secs=18`, `demuxer-readahead-secs=15`, `cache-pause-wait=2`. Instalado en los dos clientes con backup. Prueba libmpv: arranca ~12 s antes del borde sin stalls en 20 s.
- Medición fresca del origen (Sky Sports): ventana de 8×6 s; inicio del playlist ~76 s atrás, borde ~28 s atrás. El player no puede corregir el delay propio del re-stream.
- `node scripts/aiostreams-config.mjs prepare` y `node scripts/family-profile.mjs` OK; manifest 200 con 13 catálogos.

## Hecho 2026-10-23
- Docker Desktop se detuvo solo dos veces; se levantó de nuevo y el stack volvió `healthy` sin pérdida de configuración.
- AIOStreams quedó configurado con TorBox (placeholder), 9 presets y 13 catálogos; manifest 200 con subtítulos.
- Sin TorBox, los presets VOD se desactivan: película/serie devuelven 0 streams y la app ya no ofrece clips de error de 8 s (`Your API token is invalid or expired`).
- Cinemeta + 7 catálogos de deportes: home de la app con 13 filas verificado; búsqueda de películas/series sigue funcionando.
- Se subió `MANIFEST_TIMEOUT` a 10 s porque OpenSubtitles tardaba >3 s y desaparecía del manifest.
- Deportes: HLS 1080p H.264/AAC; app de escritorio reprodujo Sky Sports Premier League con tiempo avanzando (`1:57 / 2:12`).
- Cobertura de 8 eventos: 4 con HLS real (`Bochum`, `Brisbane`, `Darmstadt`, `Faisaly`), 3 sin streams, 1 con solo enlace HTML descartado. `Live Now` tiene canales reales y eventos de agenda sin fuente.
- `TNT Sport 1/2` no tenían fuente real en la última medición; no se inventan enlaces.
- Hardware para VOD: Ryzen 5 3600 + RTX 2060 Super 8 GB + 16 GB RAM + monitor 1080p. Se prioriza 1080p REMUX/BluRay; HEVC permitido; 2160p/1440p excluidos.
- Latencia HLS medida con `EXT-X-PROGRAM-DATE-TIME`: **~75 s** al inicio del playlist y **~36 s** al borde. Es latencia inherente al HLS, no “lag” de red.
- Fixtures argentinos en el catálogo: River vs Racing (25/10 22:15 UTC) e Independiente vs Boca (25/10 20:00 UTC). Aún no tienen fuente; se prueban en vivo.
- Nuevo `scripts/check-argentine-football.mjs` para buscar partidos argentinos y medir streams/latencia en vivo.
- Nuevo `scripts/set-torbox-key.ps1` para cargar la key sin mostrarla ni pegarla en el chat.
- Home en español y deportes primero: `En vivo`, `Fútbol`, `Hoy`, luego `Películas`/`Series`.
- Guías nuevas: `docs/TV.md` (portar a la TV) y `docs/GUIA_MAMA.md` (uso simple).
- Docker Desktop arrancó; `aiostreams` y `caddy` quedaron `healthy`. Cliente Windows copiado a `D:\Fubol\Client`, accesos directos en Escritorio/Start Menu, home cargó con deportes primero.
- Perfil familiar separado creado y validado con manifest HTTP 200; TorBox sigue pendiente. El script de TorBox actualiza también este perfil cuando se cargue una key.
- Perfil de CA iOS generado, servido por Caddy en HTTP solo como bootstrap del certificado público y validado con 200 + MIME correcto.
- No hay cable de TV. Antena no comprobada físicamente. PC→TV por HDMI es la ruta sin compra; falta probarla en el living.
- La app web mostró los catálogos pero falló al reproducir HLS (`This browser cannot play this version`, error 4).
- `iptv-org`: 186 canales AR, 4/6 abrieron; 415 de deportes, 31 coincidencias; DAZN OK, DSports/ESPN inestables. Se deja como complemento futuro, no como fuente principal.
- Validador TorBox probado: clave faltante exit 2, clave inválida 403 exit 1, sin imprimir secretos.
- Error de `Gimnasia de Mendoza vs Platense` resuelto: el evento no tenía fuente real; se filtró el health JSON y ahora muestra `No streams found` en vez de un error de reproducción.
- WSL se actualizó a 3.0.3.0 / kernel 6.18.54.1; Docker volvió a `healthy` y `stage-a-check.sh` dio 10 PASS / 0 FAIL.
- Evidencia nueva: `audit/11_CLIENT_AND_IPTV.md`.

## Hecho 2026-10-22
F0 cerrado: Docker+WSL2 operativos, `.env` migrado, núcleo sano y smoke test 10/0. Se corrigieron 5 bugs del harness de verificación (ruta CA, espera de health, perfiles opcionales, Schannel/OpenSSL, CRLF del request). Evidencia en `audit/10_RUNTIME_BASELINE.md`.

## Hecho 2026-11-01 (plan de mejora completo; sin tocar fuentes ni addons)
Verificación: typecheck + lint + 174 tests + build limpio. Evidencia en `audit/22_DELAY_MEASUREMENT.md`.

### Medición honesta del delay (era el objetivo del proyecto)
- `playlist.ts`: niveles de confianza `measured` / `extrapolated` / `implausible` / `none`. Antes `Math.max(0,...)` convertía un reloj adelantado en "delay 0 s" y el ranking elegía esa fuente. Probado: 4 fuentes del mismo partido difieren hasta 33 s entre sí; el PDT lo re-estampa el re-transmisor.
- `rank.ts`: el scoring premiaba la ignorancia (fuente sin medir 70 vs fuente con 25 s medidos 67). Ahora el delay domina, el desconocido usa prior neutro de 20 s y la resolución no compra su paso.
- `Player.tsx`: se separan `origen`, `buffer` y `total`; se usa `hls.playingDate`. Se eliminó `setLatency(0)` cosmético en "Ir al vivo".
- `probe.ts`: se conserva el `height` del master al bajar a la variante (todas las fuentes reales reportaban `null`).
- `source_checks` + `/api/admin/health`: columnas `edge_trust`/`edge_raw_s` y conteo de cuántos chequeos pudieron medirse.

### Estabilidad del vivo
- `Player.tsx`: eliminado el governor manual de `playbackRate`, que con segmentos de 6 s oscilaba entre 1.0 y 1.07 **todo el partido** peleando con `maxLiveSyncPlaybackRate` de hls.js; y podía quedar clavado en 0.98. Ahora `liveSyncDuration` explícito derivado del `targetDuration` real y buffer >= 3 segmentos (antes pedía 12 s de retraso con 8 s de buffer).
- `relay.ts`: ventana de 5 s -> 20 s; **no se borra el directorio al reiniciar** y se continúa la numeración con `-start_number` (los logs mostraban ffmpeg muriendo a los 10.8 s y 38 s, y el playlist volvía de seq 63 a 0, colgando a hls.js); supervisor con reinicio automático y backoff; `RELAY_MAX_JOBS` 4 -> 6 y no se desaloja a quien pausó; se quitó `-tune zerolatency`; `bufsize` acotado.
- Ruta del relay: espera un playlist con >= 3 segmentos (ffmpeg publicaba 1) y timeout de 8 s dentro del presupuesto de hls.js (antes 20 s, fuera de su límite de 10 s).
- `FUBOL_RELAY_DIR` + tmpfs en compose: los segmentos salían del bind mount de Windows vía WSL2.

### Producto
- Agenda unificada: `fixturesFromChannels` + `mergeChannelFixtures`. TheSportsDB con key `123` devuelve **3 partidos para un domingo entero**; el catálogo tenía 20+ jugándose. Verificado: agenda de 6 -> 36 fixtures (31 en vivo), con Juventus-Napoli y Athletic-Real Sociedad recuperados del catálogo mixto y NFL/NBA/NHL/rugby excluidos.
- Hero del próximo partido con señal en el home (completa `KickoffCountdown`, que estaba a medio hacer en el working tree).
- `statusFor`: respeta el estado del feed, 150 min liga / 210 min copa, 25 min antes del kickoff, `postponed` explícito, y deja de creerle a un "NS" rancio pasados 15 min. Antes un partido postergado salía EN VIVO y una copa con penales salía FINAL jugándose.
- Vacío vs falla distinguidos en home, `/live` y la pantalla de ver; el motivo del rechazo se explica (página web / no es video / no respondió).

### Seguridad
- `FUBOL_TRUST_PROXY`: `x-forwarded-for` y `x-forwarded-host` ya no se creen por defecto (el puerto 3001 se publica directo, así que se podía forjar la IP y saltar el rate limit, y envenenar el Host daba un open redirect).
- Lockout progresivo en admin y en el PIN familiar; rate limit en `/api/live/session` (disparaba 6 probes sin límite).
- CSP; `k !== "vod"` rechazado en el sync por audio; BOM UTF-8 aceptado en playlists (se rechazaban fuentes válidas).
- `/f/CODIGO`: un link nuevo reemplaza la sesión vieja (antes quedaba en loop a `/entrar` hasta borrar cookies).

### Pendiente real
- [ ] **El delay absoluto contra el estadio sigue sin medirse.** Todo lo medible es auto-reportado por el origen. Hace falta referencia externa: OCR del reloj del partido, timestamp de gol de una API, o diferencial entre dos fuentes. Ver `audit/22_DELAY_MEASUREMENT.md` sección 6.
- [ ] El relay sigue sin delay medible: `+program_date_time` da PDT adelantado 0.4-3.2 s porque ffmpeg hereda los timestamps del input. El clasificador lo rechaza (no inventa número), pero el dato no existe.
- [ ] TheSportsDB free key sigue dando ~3 eventos/día y sin `strTVStation`. Evaluar key paga o usar el catálogo como fuente primaria de agenda.
- [ ] Sin tests de UI ni E2E en CI; `Player.tsx` (1090 líneas) no tiene cobertura directa. CI no corre el build de Docker.
- [ ] Docker Desktop se cayó durante esta sesión; la verificación final se hizo con el build standalone en :3002, no en el contenedor.
- [ ] `globals.css` sigue en 3461 líneas en un archivo.

## Hecho 2026-11-01 (tarde) — addons, VOD reproducible y evaluación de Vercel
Docker levantado. Verificación: typecheck + lint + 181 tests + build, y todo probado contra el contenedor en :3001.

### Estado real de los addons (medido, no supuesto)
- Diagnóstico nuevo en `/api/admin/addons/diagnostics`: **11 addons — 6 sirviendo, 5 necesitan configuración, 0 caídos.**
- `addons.ts`: se lee `behaviorHints.configurationRequired`, que la app ignoraba. Antes registraba addons con manifest 200 que devolvían 404 en cada recurso, y el panel los contaba como sanos.
- Subtítulos medidos uno por uno para `tt0111161`: **OpenSubtitles v3 = 200 con 37 pistas (3 ES)**. OpenSubtitles PRO = 500. SubSource, SubDL, Community Subtitles y SubSense = 404, los cuatro con `configurationRequired: true` (necesitan tu cuenta).
- Los que necesitan config ya no se consultan (solo gastaban timeout) y se muestran con link a su `/configure`.

### Torrentio y el VOD: bloqueo que no es de código
- **Torrentio: 100 streams para una película, los 100 `infoHash`, cero URLs HTTP.**
- **AIOStreams propio: 522 streams, los 522 `infoHash`, cero URLs HTTP.**
- Un `<video>` solo reproduce HTTP. Para abrir esas fuentes hace falta un servicio debrid (TorBox / Real-Debrid / AllDebrid / Premiumize) configurado en el addon. Es una suscripción paga; no se puede resolver con código.
- La UI dejó de decir "sin fuentes" y ahora explica el motivo real, con el conteo de fuentes P2P.
- `FUBOL_OPEN_FILMS=1` por defecto: es la única vía de video que reproduce sin credencial paga. Verificado end-to-end: 1 fuente MP4 + **70 pistas de subtítulos (19 ES)**.
- Sync de subtítulos validado: control contra sí misma offset 0 ms / score 1.0 / confianza 0.953; ES vs EN detecta −19.2 s real.

### Performance
- Home de 10.7 s a **0.35 s**: `getHomeRows` con stale-while-revalidate (fresco 5 min, stale 6 h, un solo refresh en background) más calentamiento en `instrumentation.ts` al arrancar (146 ms en el log). El resto de las páginas < 0.19 s.

### Vercel: `audit/23_VERCEL_FEASIBILITY.md`
- **Viable en ~80%, pierde lo prioritario.** El relay de ffmpeg (`relay.ts`) escribe segmentos y los lee en requests posteriores: en serverless cada invocación está aislada, así que no hay dónde vivir el pipeline. Se caen `AR · ESPN Premium`, `AR · DeporTV` y `AR · Fox Sports`.
- También habría que migrar SQLite (9 call sites → Turso), pasar secretos a env y quitar `output: "standalone"`.
- **Recomendación: host de contenedores always-on (Fly.io) en vez de Vercel.** La app ya está containerizada; es configuración, no reescritura, y conserva el 100% de las funciones.

### Pendiente (decisiones del usuario)
- [ ] **Clave debrid** si se quieren películas desde Torrentio/AIOStreams. Sin eso el VOD solo tiene Internet Archive.
- [ ] Manifests personales de los 4-5 addons de subtítulos que piden cuenta (tienen link a su `/configure` en el panel).
- [ ] Elegir destino del deploy: Fly.io (todo funciona) o Vercel (sin canales argentinos).
- [ ] El delay absoluto contra el estadio sigue sin medirse — ver `audit/22_DELAY_MEASUREMENT.md` sección 6.
