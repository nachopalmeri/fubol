# Addons, catalogo y latencia

Este documento separa tres cosas que suelen mezclarse:

1. **Addons oficiales o open source** que se pueden instalar y mantener.
2. **Scrapers P2P** cuyo codigo es abierto pero que indexan contenido que puede no estar licenciado.
3. **Fuentes de vivo oficiales**, que son las unicas que Fubol puede recomendar como fuente.

Fubol no aloja, scrapea ni reemite streams. No integra MeteGol, ChocoPop ni sitios similares.

## Comandos

```bash
node scripts/addons.mjs status   # verifica manifests/configs en vivo
node scripts/addons.mjs page     # genera public/addons/index.html
node scripts/addons.mjs json     # imprime el catalogo
```

El catalogo vive en `config/addons/catalog.json`. La pagina generada no contiene secretos.

## Instalar en Stremio o Nuvio

1. Abrir el addon en modo **Configurar** (no instalar el manifest base si es configurable).
2. Elegir idioma, filtros y, si corresponde, **no cargar API key de debrid**.
3. Copiar el manifest resultante.
4. En Nuvio: *Settings → Addons → Add Addon* y pegar la URL.
5. En Stremio: *Addons → Install from URL* y pegar la URL.

Orden recomendado en Nuvio: primero metadata (AIO Metadata, Cinemeta o TMDB), despues streams y por ultimo subtitulos.

## Regla P2P para el debrid nativo

Nuvio puede resolver TorBox o Premiumize por su cuenta. Para eso:

- El scraper (AIOStreams, Comet, Torrentio, Meteor) debe estar **sin API key** y en modo **P2P**.
- El addon tiene que devolver `infoHash`, no una URL ya resuelta.
- Si el addon resuelve debrid, Nuvio nunca ve el hash y su resolvedor queda bypassado.

En Fubol, `node scripts/aiostreams-config.mjs status` muestra `vod_mode=p2p` cuando no hay key y `vod_mode=debrid` cuando hay TorBox.

## Categorias

### Streams y scrapers

| Addon | Rol | Riesgo |
|---|---|---|
| AIOStreams | Agregador principal, self-hosted | P2P |
| Torrentio | Scraper P2P clasico | P2P |
| Comet | Scraper P2P con filtros | P2P |
| MediaFusion | Scraper + catalogos | P2P |
| Meteor | Scraper P2P liviano | P2P |

Los cinco devuelven torrents/hashes. Su licencia de codigo no otorga derechos sobre el contenido.

### Metadata y posters

| Addon | Rol |
|---|---|
| AIO Metadata | TMDB/TVDB/TVMaze/MAL/IMDB, configurable |
| Cinemeta v3 | Metadata base de Stremio |
| TMDB Addon | Metadata directa de TMDB |
| RPDB | Badges de rating sobre posters (requiere key) |

### Subtitulos

| Addon | Rol |
|---|---|
| OpenSubtitles PRO | Cobertura ES/EN, el mas completo |
| SubSource | Respaldo ES |
| SubDL | Catalogo amplio |
| Stremio Community Subtitles | Sin configuracion |
| SubSense | Tercer respaldo |

### Vivo oficial

| Fuente | Nota |
|---|---|
| LPF Play | AFA; cuenta y disponibilidad por region |
| FIFA+ | Gratis y legal; no cubre ligas locales |
| UEFA.tv | Archivo y juveniles; disponibilidad por pais |

Los derechos cambian por pais y temporada. Verificar antes de prometer un partido.

## Latencia

El player no puede corregir el delay que ya trae la fuente. Presupuesto tipico:

| Etapa | Delay |
|---|---|
| Origen / re-stream | 20–35 s |
| Playlist HLS | 6–12 s |
| Buffer del player | 8–18 s |
| **Total** | **35–45 s** |

Para bajar el total:

- Usar una fuente legal con **LL-HLS** o **DASH low-latency** (3–8 s).
- Bajar el buffer del player, aceptando mas riesgo de corte.

### Perfiles de mpv

| Perfil | Archivo | Cache | Uso |
|---|---|---|---|
| Estable | `config/mpv/mpv.conf` | 18 s | Uso diario |
| Bajo delay | `config/mpv/mpv.low.conf` | 8 s | Fuente estable, querer el borde |

```powershell
powershell -File scripts/mpv-latency.ps1 -Mode low
powershell -File scripts/mpv-latency.ps1 -Mode stable
```

El script hace backup y verifica el hash en `D:\Fubol\Client` y `D:\Fubol\MamaClient`.

## Limites

- Sin una fuente legal de baja latencia, el piso practico sigue siendo ~35 s.
- Los eventos de Sports Streams pueden devolver 0 streams; es disponibilidad de la fuente.
- AIOStreams Desktop no reproduce P2P: para VOD ahi hace falta TorBox.
- No se agregan addons que requieran scrapear o reemitir canales de pago sin autorizacion.
