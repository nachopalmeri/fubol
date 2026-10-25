# Fubol — estado de ejecución

Actualizado: 2026-10-24

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
