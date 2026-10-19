# Configuracion de addons para Stremio y Nuvio

## Orquestador (self-hosted, incluido en este repo)
- AIOStreams: http://<VM-IP>:3000
  (AIOStreams combina addons y debrid. Configurar TorBox en su dashboard.)

## Catalogo / metadata (instalar en ambos)
- Cinemeta: https://v3-cinemeta.strem.io/manifest.json
- OpenSubtitles v3: https://opensubtitles-v3.strem.io/manifest.json

## Streams de peliculas/series (torrent + debrid)
AIOStreams ya incluye Torrentio/Comet/MediaFusion desde su Marketplace.
Alternativa directa: Torrentio (con TorBox): https://torrentio.strem.fun/configure

## Subtitulos VOSE (cliente, instalar en Stremio/Nuvio)
- Subtitle Sync: https://stremio-addons.net (buscar "Subtitle Sync")
  Configurar para Espanol + Ingles, sincronizacion automatica activada.
- OpenSubtitles v3 (fallback): https://opensubtitles-v3.strem.io/manifest.json

## Deportes en vivo
- MediaFusion (self-hosted, despliegue separado): https://github.com/mhdzumair/MediaFusion
- Lista M3U real (si tenes una URL estable): usar addon generico de M3U en stremio-addons.net

## Nuvio (app)
- Instalar la app Nuvio (Android/Android TV/Fire TV): https://nuvio.tv
- Settings -> Addons -> pegar los manifest URLs de AIOStreams.
- Para plugins (scrapers JS): Settings -> Plugins.

## TorBox (debrid pago)
1. Crear cuenta en https://torbox.app
2. Obtener API key en https://torbox.app/settings
3. Pegarla en AIOStreams -> Services -> TorBox.

## APIs gratuitas (metadata)
- TMDB (gratis, registro): https://www.themoviedb.org/settings/api
- TheSportsDB (gratis, sin key): https://www.thesportsdb.com/api.php
'@ | Set-Content config/stremio-addons.md