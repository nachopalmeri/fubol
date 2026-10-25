# Revisión de addons solicitados

Revisado: 2026-10-24. Alcance: revisar duplicados, procedencia, compatibilidad con AIOStreams y
señales obvias de riesgo. Un manifest HTTPS no garantiza que el proveedor sea seguro, autorizado o
estable. No se ejecutó código de terceros en Windows.

## Ya presentes en Fubol (no duplicar)

| Addon solicitado | Estado actual | Resultado |
|---|---|---|
| Torrentio | Preset nativo de AIOStreams | Ya está en el perfil. Sin TorBox devuelve P2P `infoHash` (Stremio/Nuvio); con TorBox devuelve streams debrid para Desktop. |
| AIOStreams | Es el servidor/agregador actual | No se instala dentro de sí mismo. |
| Comet | Preset nativo de AIOStreams | Ya está en el perfil; no duplicar como custom addon. |
| MediaFusion | Preset del perfil AIOStreams; contenedores opcionales en Compose | No se levantó el perfil pesado `sports`; sin TorBox queda en modo P2P/cached-only y no aporta VOD jugable en Desktop. |
| Cinemeta | Addon custom activo | Catálogos de películas/series ya incluidos. |
| OpenSubtitles | Preset `opensubtitles-v3-plus` activo | ES/EN ya verificado; no instalar una segunda instancia. |
| Sports Streams | Addon custom activo | Ya entrega el catálogo de eventos/canales internacionales. No contiene canales argentinos verificados. |

## Candidatos no añadidos

| Addon | Revisión | Decisión |
|---|---|---|
| Public Domain Movies | Manifest oficial `https://publicdomain.strem.io/manifest.json` respondió 200 y el repo `https://github.com/Stremio/stremio-public-domain` declara MIT y mantiene una lista de exclusión de títulos protegidos. Sus streams son torrent/infoHash; una prueba de AIOStreams devolvió 400 porque el manifest no incluye `catalogs[].name`, campo que AIOStreams exige. | No quedó instalado en Fubol. Se revirtió el intento y se restauró la configuración válida. Puede añadirse directamente en un cliente Stremio/Nuvio compatible, pero no se afirma que el reproductor actual resuelva torrents sin TorBox/servicio. |
| Latino Movies | El nombre no identifica un único addon: el directorio muestra múltiples opciones con nombres y operadores distintos (LAT-ADD, Primer Latino, Latinobrid, etc.). No se validó un manifest/código/licencia exactos. | No instalar a ciegas. |
| Xperience | `https://xperience-app.com` es un configurador de Nuvio, no un addon Stremio concreto. No se le entregó la URL-manifest familiar ni credenciales. | No instalar ni vincular cuentas. |
| MDBList | Existe una integración oficial Beta en `https://mdblist.com/apps`; necesita una cuenta/API key del usuario. | Pendiente de clave. No se creó cuenta ni se pidió la API key en el chat. |
| TMDB addons | El término es ambiguo; la personalización TMDB del perfil sigue deshabilitada por decisión previa y no hay API key. | No añadir un endpoint no identificado ni pedir/guardar claves sin decisión del usuario. |
| Argentina TV | El registro de la comunidad identifica el manifest `https://848b3516657c-argentinatv.baby-beamup.club/manifest.json` y figura archivado/read-only desde 2025; la comprobación de red falló y no se encontró una auditoría actual de las señales. | No instalar: servicio archivado/no verificable. |
| Canales Deportivos | El directorio lo describe como wrapper de enlaces externos en vivo; no se identificó código fuente/licencia ni se verificó la autorización de las señales. | No instalar sin una fuente transparente/autorizada. |
| MeteGol | Repo público `https://github.com/Geber-Dev0/Metegol`. Su README declara que toma fuentes de Al Ángulo/Fútbol Libre/Agenda18/Deporflix, redirige retransmisiones no autorizadas y requiere extracción/proxy HLS/túnel. No se encontró archivo de licencia en el root del repo. | No copiar ni desplegar scraper, proxy, túnel o bypass; visibilidad pública no equivale a permiso. |

## Alternativa a evaluar para TV en vivo

`https://github.com/mrcanelas/aiolivetv` es un proyecto público bajo AGPL-3.0 para agregar M3U,
XMLTV, TVHeadend y addons de TV en una guía Stremio. No incluye por sí mismo canales ni derechos:
requiere una lista/proveedor. Es un servicio adicional y no se instaló. Solo conviene evaluarlo si
el usuario aporta/autoriza una fuente legítima y acepta el consumo operativo de otro servicio.

## Cambios de configuración

- El home ya prioriza `Fútbol` → `En vivo internacional` → `Hoy`.
- Los 9 presets originales/13 catálogos se restauraron después de que Public Domain Movies fuera
  rechazado por la validación de AIOStreams. `prepare` y `status` volvieron a HTTP 200; no se dejó
  un preset inválido ni se perdió el perfil familiar.
- Sin clave TorBox el perfil quedó en modo P2P: `tt0111161` devuelve 508 streams `infoHash` y
  `tt0944947:1:1` 314. Stremio/Nuvio los reproduce; AIOStreams Desktop necesita TorBox para VOD.
  No se activa ningún scraper con credenciales falsas.
