# 11 — Clientes, HLS y evaluación de iptv-org

Fecha: 2026-10-23
Alcance: cliente web AIOStreams, cliente de escritorio, deportes en vivo y decisión sobre `iptv-org/iptv`.
Estado: evidencia de cliente y deportes; VOD sigue bloqueado por la clave TorBox.

## 1. Cliente web (`/jellyfin/web/`)

- `POST /jellyfin/Users/AuthenticateByName` con UUID + password: **HTTP 200**, token presente.
- `/jellyfin/Users/<id>/Views`: 17 vistas; incluye `Live Now`, `Today` y `Football`.
- `/jellyfin/Items?ParentId=<Live Now>`: devuelve canales y eventos reales, por ejemplo
  `(FHD) : SKY SPORTS PREMIER LEAGUE` y `Flamengo vs Estudiantes de La Plata`.
- `POST /jellyfin/Items/<id>/PlaybackInfo`: **HTTP 200**; `SupportsDirectPlay=true`,
  `Protocol=Http`, `Container=ts`, `IsInfiniteStream=true`.
- La URL de playback es un HLS `.m3u8` firmado. No se guarda ni se documenta.

Prueba de reproducción en Chrome (Playwright, 1440x900):

1. Login correcto y home con filas de deportes.
2. `Play` → selector de versiones → `🚀 FHD`.
3. La app navega a `#/play/...`, crea un `<video>` y muestra:
   `This browser cannot play this version. Nothing is converted on the server, so try another version, an external player or the desktop app.`
4. Estado del `<video>`: `error.code=4`, `readyState=0`, `networkState=3`, `currentTime=0`.

Conclusión: la web sirve para **configurar y explorar**, no para HLS en Chrome. Para deportes en vivo y
MKV la familia necesita la app de escritorio o Android con mpv.

## 2. Cliente de escritorio

- Release oficial: tag `desktop`, asset `aiostreams-desktop-win-x64.zip`.
- Tamaño: 58.490.567 bytes.
- SHA256: `e0e3062090581dcbdb970f45e84a3743966728e8180c8b1cf8f75cde2ea05e34`.
- Versión: **0.19.0** (`sq.version`), win-x64.
- Es portable: marcador `.portable`, sin instalador; incluye `libmpv-2.dll`, FFmpeg y Vulkan.
- Se ejecutó con perfil temporal y `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`
  solo para automatizar la prueba. No se instaló nada en el sistema.

Flujo verificado con Playwright sobre WebView2 + captura real de la ventana:

- Servidor: `http://127.0.0.1:3000` → login con UUID/password → home con filas de deportes.
- `More info` → `Play` → versión `🚀 FHD` → `#/play/...`.
- El reproductor muestra `1:46 / 2:00` y, 12 s después, `1:58 / 2:12`; el tiempo avanza y la
  ventana muestra video real de Sky Sports Premier League con audio y controles.
- Captura de evidencia: `D:\Dev\temp\opencode\f1\desktop-window.png`.
- La captura del WebView sale blanca porque mpv dibuja en una capa nativa; la captura de pantalla
  de Windows sí muestra el video. Esto es una limitación del método de captura, no del player.

Conclusión histórica: la app de escritorio es el cliente válido para HLS y para el player que la web no puede usar.
La instalación familiar Windows y el perfil independiente quedaron completados en la verificación
del 2026-10-24; iPhone y conexión física a TV siguen pendientes en el teléfono/TV reales.

### Verificación de instalación familiar en Windows (2026-10-24)

- La copia local actual es **0.20.0** (`D:\Fubol\Client`, portable). Acceso directo **Fubol** en
  Escritorio y Start Menu.
- Se creó una segunda instalación limpia **Fubol Mama** en `D:\Fubol\MamaClient`, con datos de
  WebView separados y login mediante el perfil familiar independiente (no usa el login dueño).
- Tras cerrar y volver a abrir, el perfil familiar conservó la sesión y cargó `En vivo`, `Fútbol`,
  `Hoy`, deportes adicionales y catálogos en español.
- Prueba HLS con la versión instalada: Sky Sports Premier League → `🚀 FHD`; el player llegó a
  `0:43 / 0:59`, buffer `100%`, sin error, después se volvió al home.
- Esto demuestra apertura HLS en el PC; **no** demuestra cero delay ni VOD, y no es una prueba de
  estabilidad de 20 minutos. La clave TorBox sigue sin cargarse.
- Acceso directo **Fubol** abre el perfil dueño en esta PC; **Fubol Mama** abre el perfil familiar.

## 3. Deportes en vivo

- Catálogos integrados: `sports_live`, `sports_today`, `sports_football`, `sports_basketball`,
  `sports_motor_sports`, `sports_fight`, `sports_tennis` (7 en el manifest).
- HLS directo probado con ffprobe: 1920x1080, H.264, 50 fps, AAC.
- ffmpeg grabó 15 s en 1,8 s; muestra de 12.539.976 bytes, 6.687.987 bps.
- La app de escritorio reprodujo el mismo canal de forma sostenida durante la prueba.
- La app de escritorio reprodujo un **evento** con 3 fuentes reales:
  `Atlante vs Atlético de San Luis` (item `b26607dd9392422d96f43f38c6b29b95`), con tiempo
  avanzando `0:37 / 0:55` y 110% de buffer. Captura: `desktop-atlante-playing.png`.
- Home reordenado para prioridad familiar: `Fútbol`, `En vivo internacional`, `Hoy` y categorías
  primero; después Cinemeta (Películas/Series). La instalación familiar Windows se verificó con
  ese orden el 2026-10-24.
- Nombres de catálogos en español: `En vivo`, `Fútbol`, `Hoy`, `Básquet`, `Motor`, `Peleas`,
  `Tenis`, `Películas`, `Series`, `Películas nuevas`, `Series nuevas`, etc. Manifest 200 con
  13 catálogos.
- Cobertura de 8 eventos del 23/10: 4 con HLS real (`Bochum`, `Brisbane`, `Darmstadt`,
  `Faisaly`), 3 sin streams, 1 solo con enlace HTML descartado. Es una foto del momento:
  los eventos y canales cambian.
- Canales verificados en `sports_live` (HTTP 200 `application/vnd.apple.mpegurl`):
  Sky Sports Premier/F1/Golf/Tennis/News, Fox Sports 1/502, TSN 1/5. `TNT Sport 1/2`
  no tenían fuente real en la última medición.
- El addon puede responder `429 - Too Many Requests` si se consulta en ráfaga; no es una
  fuente de video. No se debe interpretar como evento disponible.
- Queda pendiente el benchmark formal Sports Streams vs MediaFusion y la ventana de 20 min.

### Prioridad de relato argentino (2026-10-24)

- Se consultó el catálogo `sports_live`: 70 elementos, con 15 canales lineales identificables.
  Los nombres de canal fueron Sky Sports (UK), Fox Sports (US/AU), TSN (Canadá) y TNT Sport (UK);
  no se encontró TyC/ESPN Argentina/DSports en ese catálogo.
- Búsqueda de Sports Streams para `Argentina`, `TyC Sports`, `ESPN Argentina`, `ESPN Premium`,
  `TNT Sports` y `Premier League`: 0 metas por término. No hay base para llamar a un stream
  “relato argentino” ni “Bambino”. Sky Sports Premier League es feed internacional en inglés.
- El catálogo `Fútbol` devolvió los fixtures River–Racing e Independiente–Boca, pero el chequeo
  actualizado del 24/10 devolvió `streams=0` para ambos antes del inicio. El script ahora filtra
  por una lista explícita de clubes argentinos para no confundir Racing Club con Racing de Santander.
- `iptv-org/countries/ar.m3u` contiene una entrada TyC Sports que respondió HTTP 200 con MIME HLS,
  además de candidatos DeporTV/Showsport. Solo se validó la respuesta inicial: no se verificó
  reproducción sostenida, derechos de retransmisión, audio español ni comentarios de Bambino.
  Por eso no se integró ni se pone arriba del home como canal garantizado.
- Home actual ordenado `Fútbol` primero y `En vivo internacional` segundo. Para tener canales
  argentinos reales dentro de la app hace falta una fuente/integación adicional autorizada; no
  inventar una fila argentina con un catálogo global.

### 3b. Latencia real del HLS

Medición sobre `(FHD) : SKY SPORTS PREMIER LEAGUE` con `EXT-X-PROGRAM-DATE-TIME`:

- Playlist: `#EXT-X-TARGETDURATION:6`, 6 s por segmento.
- `EXT-X-PROGRAM-DATE-TIME` del primer segmento: **02:50:21.473Z**.
- Hora de la consulta: **02:51:36.705Z**.
- Diferencia: **75,2 s** al inicio del playlist.
- El playlist contiene ~6 segmentos (36 s); aun empezando en el borde, la latencia ronda
  **36-40 s**. No es “cero delay”.
- El buffer del player puede sumar unos segundos. La etiqueta “small delay” del addon no
  significa baja latencia.

Conclusión: para fútbol argentino, “sin delay” no se logra con este HLS gratuito. Las opciones
reales son antena/TV abierta (sin el buffer HLS para partidos emitidos en TV abierta),
o IPTV de pago (aún con 5-30 s). El lag/stutter se puede reducir con Ethernet, hardware decode
y buffer, pero la latencia de origen no se elimina. Se probarán River vs Racing (25/10 22:15 UTC)
e Independiente vs Boca (25/10 20:00 UTC) en vivo.

## 4. `iptv-org/iptv`

Fuente: `https://iptv-org.github.io/iptv/` (CC0; no aloja video, solo enlaces públicos).

Mediciones del 2026-10-23:

- Playlist Argentina (`countries/ar.m3u`): **186 canales**.
- Muestra de 5 canales: **4 abrieron** con ffprobe (5tv, 24/7 Canal de Noticias, A24, ABTV Bariloche);
  Adult Swim Latin America falló.
- Playlist de deportes (`categories/sports.m3u`): **415 canales**; 31 nombres coincidían con
  DSports/ESPN/DAZN/TyC/etc.
- Prueba puntual:
  - `DSports (1080p)`: ffprobe exit 1, sin video.
  - `ESPN 2 Latin America (1080p)`: OK, H.264 1280x720 + AAC.
  - `DAZN Combat (684p)`: OK, H.264 640x360 + AAC (el label no coincide con la resolución real).
  - `TyC Sports`: no está en la lista.
  - `DAZN Combat` y otros pueden ser rebroadcasts no oficiales; la responsabilidad legal es del usuario.

Decisión: **no integrarlo ahora**. No reemplaza a Sports Streams porque no está atado a eventos
(Argentino, Libertadores, Champions) y la calidad/geo-bloqueo es variable. Además, AIOStreams/Stremio
no consume M3U nativamente: haría falta un addon de IPTV o Jellyfin Live TV/Threadfin, otra pieza
para la familia. Si se retoma, hacerlo como “TV abierta AR” curada, con prueba de 7 días y una
lista blanca de canales; no como fuente principal de fútbol.

## 5. Recuperación de error: evento sin fuente

Caso real reportado en la app: `Gimnasia y Esgrima de Mendoza vs Platense`
(item `b28fdf1b0cf2ec0b36d4bcac66bb4a76`).

Antes del ajuste, `PlaybackInfo` devolvía:

- `sports.highfly.to/health` → `application/json` (health-check), no video.
- `/static/no_matching_file.mp4` → MP4 de relleno.
- La app intentaba reproducir el JSON y mostraba
  `Playback failed: the link returned something other than a video`.

Ajustes aplicados en `config/aiostreams/fubol.config.json`:

- `excludedKeywords`: `Web Link`, `Scrape Summary`, `Channels May Be Down`,
  `If Streams Are Not Working`, `Streams Temporarily Unavailable`,
  `Match Not Found Or Has Ended`, `Try Again Shortly`.
- `statistics.enabled=false` y `showFilterStatsOnNoStreams=false` para no agregar
  pseudo-streams de diagnóstico al manifest familiar.
- El filtro `Match Not Found Or Has Ended` limpió el aviso de `Aston Villa vs Manchester City`
  (partido futuro): el endpoint del evento pasó de 1 stream informativo a **0 streams**.
  La app ya no intenta reproducir ese aviso.

Después del ajuste, el mismo evento devuelve `No streams found` (placeholder estático):
no hay un JSON de salud disfrazado de video. El canal real
`(FHD) : SKY SPORTS PREMIER LEAGUE` sigue devolviendo primero su HLS:
`application/vnd.apple.mpegurl`, `#EXTM3U`, HTTP 200.

Limitación conocida: el addon agrega un stream informativo `💩 Unknown` con el texto
“If streams are not working...” que AIOStreams no filtra. Es cosmético y está segundo cuando
hay HLS real; el primer stream real sigue siendo el que se reproduce.
No se modifica el core de AIOStreams para ocultarlo.

## 5b. VOD sin TorBox: desactivación intencional

Sin `.secrets/torbox.key`, Comet/Torrentio respondían HTTP 200 `video/mp4` pero el archivo era
un clip de **8 segundos** con “Your API token is invalid or expired.” Eso parece un stream real
y confunde a la familia.

Cambio en `scripts/aiostreams-config.mjs` (`loadConfig`): si no hay clave, se desactivan los
presets de video que dependen de TorBox (`torrentio`, `comet`, `stremthruTorz`, `knaben`,
`mediafusion`, `animetosho`). Cinemeta y subtítulos siguen activos. Con clave, el template
mantiene los presets habilitados y `prepare` los reactiva.

Verificación posterior:

- `GET /stream/movie/tt0111161.json` → **0 streams**.
- `GET /stream/series/tt0944947:1:1.json` → **0 streams**.
- `GET /subtitles/movie/tt0111161.json` → **167** subtítulos (45 ES / 122 EN).
- Manifest: 4 recursos, tipos `movie,series,subtitles,sport`, **13 catálogos**.
- `torbox_configured=false`; `presets=9` (6 de video deshabilitados en la config activa).

## 6. Cambio operativo

- `MANIFEST_TIMEOUT=10000` en `docker-compose.yml`: OpenSubtitles V3+ tardaba más de 3 s y el
  manifest lo descartaba en silencio. Después del cambio, el manifest volvió a incluir `subtitles`
  y 4 recursos. No se tocó la clave ni la configuración de TorBox.
- Durante la prueba, Docker Desktop quedó en `engine error` porque WSL estaba terminando una
  actualización (`WSL update required`). Se reinició WSL/Docker; quedó WSL **3.0.3.0**,
  kernel **6.18.54.1**, engine **29.9.1**. El stack volvió `healthy`.
- Docker Desktop también se cerró por completo en otra sesión (sin error de WSL): el pipe
  `dockerDesktopLinuxEngine` no existía. Se cerró la app de escritorio de prueba, se liberó
  memoria y se volvió a iniciar Docker; `compose up -d` dejó `aiostreams` + `caddy` healthy.
  La memoria libre del host quedó baja (~1,2 GB de 16 GB) con Docker y otras apps abiertas;
  no se mataron apps del usuario.
- Verificación posterior: `scripts/stage-a-check.sh` → **10 PASS / 0 FAIL**.

## 7. Rollback

- Cliente de escritorio: cerrar el proceso y borrar `D:\Dev\temp\opencode\aiostreams-desktop`
  y `...\aiostreams-desktop-profile`; no hay instalación ni registro que deshacer.
- Web: no se modificó nada del cliente; el fallo HLS es una limitación, no un cambio.
- `iptv-org`: no se agregó ninguna fuente ni addon; no hay rollback necesario.
- `MANIFEST_TIMEOUT`: quitar la variable de `docker-compose.yml` y recrear `aiostreams` si se
  necesita volver al default de 3 s.
