# Configuracion de addons para Stremio y Nuvio

## Orquestador (self-hosted, incluido en este repo)
- AIOStreams: http://<IP-LAN>:3000  (o https://<IP-LAN> con la CA interna instalada)
  - Login del panel: usuario/contraseña de `AIOSTREAMS_AUTH` en `.env` (no `admin` por defecto).
  - Manifest por usuario (copialo desde el panel al guardar):
    `https://<IP-LAN>/stremio/<uuid>/<password>/manifest.json`
  - **Estado actual:** 9 presets y 13 catálogos (6 Cinemeta + 7 deportes).

## Catalogo / metadata (instalar en ambos)
- Cinemeta: https://v3-cinemeta.strem.io/manifest.json (ya incluido como preset custom).
- OpenSubtitles v3+: configurado como preset de subtítulos, idiomas `en`, `es`, `sp`, `ea`.

## Streams de peliculas/series (torrent + debrid)
AIOStreams ya incluye Torrentio/Comet/StremThru/Knaben/MediaFusion/AnimeTosho.
Sin `.secrets/torbox.key`, esos presets de video se desactivan a propósito: la app muestra
`No streams found` en vez de clips falsos de 8 s con “Your API token is invalid or expired”.
Al cargar la clave y ejecutar `node scripts/aiostreams-config.mjs prepare`, se reactivan.
Alternativa directa: Torrentio (con TorBox): https://torrentio.strem.fun/configure

## Subtitulos VOSE (cliente, instalar en Stremio/Nuvio)
- Subtitle Sync: https://stremio-addons.net (buscar "Subtitle Sync")
  Configurar para Espanol + Ingles, sincronizacion automatica activada.
- OpenSubtitles v3 (fallback): https://opensubtitles-v3.strem.io/manifest.json

## Cliente principal
- **AIOStreams Desktop** (release `desktop`, asset `aiostreams-desktop-win-x64.zip`): portable,
  incluye mpv; reproduce HLS, MKV y subtitulos. Es el cliente probado para deportes.
- **AIOStreams web** (`http://<IP-LAN>:3000/jellyfin/web/`): login y catalogo; Chrome no
  reproduce HLS, asi que no es el reproductor principal.
- Stremio/Nuvio quedan como fallback con el manifest URL.

## Deportes en vivo
- **Sports Streams** ya esta integrado en `config/aiostreams/fubol.config.json`
  (`https://sports.highfly.dev/manifest.json`); aporta canales y eventos.
  - Catálogos: `Live Now`, `Today`, `Football`, `Basketball`, `Motor Sports`, `Fight`, `Tennis`.
  - Canales con HLS real verificados: Sky Sports Premier/F1/Golf/Tennis/News, Fox Sports 1/502,
    TSN 1/5. `TNT Sport 1/2` no tenían fuente en la última medición.
  - Evento con HLS real verificado en la app: `Atlante vs Atlético de San Luis` (3 fuentes FHD/HD).
  - Los eventos de agenda o sin fuente muestran `No streams found` o un aviso del addon;
    no se inventan enlaces. El addon puede devolver `429 Too Many Requests` si se consulta en ráfaga.
- MediaFusion: incluido en este repo en el perfil "sports" del compose
  (`docker compose --profile sports up -d`) -> https://<IP-LAN>:8443/manifest.json.
  Benchmark contra Sports Streams pendiente.
- Lista M3U real (si tenes una URL estable): usar addon generico de M3U en stremio-addons.net.
- `iptv-org/iptv`: evaluado, **no integrado**. No es fuente de eventos y la calidad es variable;
  si se retoma, usarlo curado como “TV abierta AR”. Ver `audit/11_CLIENT_AND_IPTV.md`.

## Nuvio (app)
- Instalar la app Nuvio (Android/Android TV/Fire TV): https://nuvio.tv
- Settings -> Addons -> pegar los manifest URLs de AIOStreams.
- Para plugins (scrapers JS): Settings -> Plugins.

## TorBox (debrid pago)
1. Crear cuenta en https://torbox.app
2. Obtener API key en https://torbox.app/settings
3. En este repo, ejecutar `powershell -ExecutionPolicy Bypass -File scripts\set-torbox-key.ps1`
   (pide la key sin mostrarla, la guarda en `.secrets/torbox.key`, valida y aplica `prepare`).
   No pegarla en el chat, en capturas ni en Git.

## APIs gratuitas (metadata)
- TMDB (gratis, registro): https://www.themoviedb.org/settings/api
- TheSportsDB (gratis, sin key): https://www.thesportsdb.com/api.php
