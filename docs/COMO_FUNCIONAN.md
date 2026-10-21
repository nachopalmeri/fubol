# Como funcionan por detras los sitios de streaming deportivo gratuito

## 1. Concepto fundamental: son AGREGADORES, no hosts

Sitios como **Futbol Libre, Pelota Libre, Rojadirecta, Angulismo (Al Angulo TV)** NO producen ni alojan contenido de video. Son **directorios/agregadores** que recopilan enlaces a streams alojados en servidores de terceros.

- No poseen licencias de transmision.
- No tienen servidores de video propios (o tienen muy pocos).
- Su "contenido" es una lista de enlaces a streams externos.
- Cuando un dominio es bloqueado, aparecen mirrors con nombres similares.

Fuentes:
- Rojadirecta: "does not host any copyrighted material but indexes HTTP links to sports streams that can be found on the Internet" (EDRI, 2011).
- Rojadirecta: "The platform itself does not host video content. It aggregates and organizes links to streams hosted elsewhere" (ThreatFabric, 2024).
- Futbol Libre: "Instead of hosting video content directly, the main domain aggregates third-party embed links gathered from across the web" (PraviCeler, 2026).
- Pelota Libre: "appears to be a Spanish-language sports streaming website focused on live football matches" (PCrisk scanner).

---

## 2. Cadena tecnica completa (de captura a reproduccion)

```
[Señal satelital / broadcast oficial]
        |
        v
[HDMI capture / screen recording / feed intercept]
        |
        v
[Encoder: FFmpeg -> HLS (m3u8 + segmentos .ts de ~10s)]
        |
        v
[Servidor CDN de terceros (la18hd.su, la20hd.com, streamtp, fubo18, etc.)]
        |  - Anti-hotlinking: Origin/Referer checks
        |  - Tokens expirables por sesion (~minutos)
        |  - Extensiones falsas (.webp, .ico, .css) para evadir bots de copyright
        |
        v
[Pagina embed del proveedor (iframe)]
        |  - JavaScript ofuscado que genera la URL del m3u8
        |  - playbackURL = "..." o array base64 con clave k
        |  - Cloudflare/JS challenge en algunos casos
        |
        v
[Sitio agregador (Futbol Libre, Rojadirecta, etc.)]
        |  - HTML simple con agenda del dia
        |  - Enlaces r=base64 o iframes a los proveedores
        |  - Multiples enlaces por partido (backup)
        |
        v
[Navegador del usuario]
        |  - Player HLS (hls.js / ExoPlayer)
        |  - Fetch de m3u8 -> segmentos .ts
        |  - Referer/Origin headers requeridos
        |
        v
[Reproduccion]
```

---

## 3. Como se captura el contenido (la "granja")

Segun Le Parisien (2018) y otras fuentes:

- **Un solo abono a un difusor oficial** + un decodificador con cable HDMI piratado.
- El signal se envia a un ordenador que lo comprime en directo (FFmpeg).
- Se difunde a cientos de plataformas.
- "Fermes en Asie du sud-est" (granjas en el sudeste asiatico): miles de instancias duplicadas.
- El web mundial se inunda de flujos en todos los idiomas con calidad cercana a los estandares de TV paga.
- Monetizacion: publicidad masiva (a veces maliciosa) + apuestas ilegales.

---

## 4. Tecnicas de ofuscacion y proteccion (anti-bot, anti-descarga)

### 4.1 Extensiones falsas
Los segmentos de video (.ts) se renombran con extensiones de imagen/estilo:
- `seg-2611-v1-a1.webp`
- `seg-2614-v1-a1.ico`
- `seg-2618-v1-a1.css`

Son datos binarios de video disfrazados. Los bots de copyright escanean CDNs buscando `.ts` y `.m3u8`; al renombrarlos, pasan desapercibidos.

Fuente: LinkedIn post de Pranav Chikte (2026) sobre ingenieria inversa de un sitio de streaming ilegal.

### 4.2 Tokens expirables
Cada URL de segmento tiene un token unico por sesion que expira en minutos. Copiar una URL y reusarla 15 minutos despues resulta en "dead link". Esto es la proteccion principal contra descargas.

### 4.3 Anti-hotlinking (Origin/Referer)
Los CDNs (ej. Xoilac) validan los headers `Origin` y `Referer`. Si no coinciden con el dominio del embed, devuelven 403 Forbidden.

Ejemplo real (xoilac):
```
Origin: https://xoilac.realtimegamepushz.com  -> 200 OK
Origin: https://xoilackt.tv                   -> 403 Forbidden
```

Fuente: TECHNICAL.md de xoilac-iptv (GitHub).

### 4.4 Ofuscacion JavaScript
La pagina del proveedor (ej. la18hd.su/vivo/canal.php) contiene JavaScript ofuscado que genera la URL del m3u8:

Formato 1 (simple):
```
var playbackURL = "https://...m3u8";
```

Formato 2 (ofuscado):
```
playbackURL="";
kv=[[0,"base64"],[1,"base64"],...];
var k=fnA()+fnB();  // k = 76333 + 666404
// cada base64 decodifica a digitos, menos k = charCode
```

Fuente: Metegol addon (lib/extractor.js).

### 4.5 Deteccion de DevTools
Algunos sitios detectan DevTools abierto y redirigen a un video de YouTube aleatorio para evitar ingenieria inversa.

Fuente: LinkedIn post de Pranav Chikte (2026).

### 4.6 Cloudflare / JS Challenge
Algunos proveedores usan Cloudflare para bloquear requests automaticos. Se necesita TRAWL (FlareSolverr-compatible) o similar para resolver el challenge.

---

## 5. Flujo de extraccion (como lo implementan los scrapers reales)

### 5.1 Metegol (Geber-Dev0/Metegol) - addon de Stremio

1. Fetch agenda de alangulotv.si/agenda.php (HTML).
2. Parsear `<li class="...">` de eventos con streams (subitems con `r=base64`).
3. Decodificar base64 -> URL del endpoint de terceros (la18hd.su/vivo/canal.php?stream=espn).
4. Fetch de la pagina del proveedor con headers (User-Agent, Referer).
5. Extraer playbackURL del HTML (regex o ofuscacion base64).
6. Servir el m3u8 a Stremio con proxy HLS (lib/proxy.js) que:
   - Descarga m3u8 y segmentos desde IP residencial.
   - Reescribe las URLs de segmentos.
   - Doble via: URL tokenizada directa + re-extraccion fresca si falla.

### 5.2 doms/iptv (scraper de M3U8)

1. Fetch de agenda (alangulotv, futbollibre, agenda18, pelotalibre).
2. Playwright para fuentes que requieren JS (buzz, cdnlivetv, playfast, sportspass, watchfooty).
3. httpx para fuentes estaticas (fawa, futbolx, mainportal, ovogoal, pelotalibre, streamcenter, etc.).
4. Para pelotalibre: fetch de `la20hd.com/eventos/json/agenda123.json` -> cada evento tiene title, language, link. El link es `la20hd.com/vivo/...` que contiene `var playbackURL = "..."`.
5. Genera M3U8 combinado con todos los eventos.

### 5.3 live-sport-plugin (rajhodedara) - addon de Nuvio/Stremio

1. Agrega 8+ fuentes (Streamed.pk, StreamFree, WatchFooty, SportyHunter, TimStreams, StreamSports99, Streamic, CDNLiveTV).
2. Proxy HLS con coalescing (manifestInFlight) para evitar fetches duplicados.
3. WASM decryption (stream-lock.wasm, gasm.wasm) para desbloquear endpoints protegidos.
4. Circuit breakers (Opossum) para aislar fuentes que fallan.
5. Negative caching (15s) para fuentes muertas.
6. Image proxy con LRU cache y SVG fallback.

---

## 6. Fuentes de datos y sus estados (2026)

| Fuente | Estado | Tipo | Notas |
|---|---|---|---|
| Pelota Libre (pelotalibre.la) | Bloqueado/descontinuado (2026) | Agregador | Multiples mirrors rotan. Backend: la20hd.com |
| Al Angulo TV (alangulotv) | Creador arrestado (2025, Argentina) | Agregador | 14 mirror domains. Backend: la18hd.su |
| Futbol Libre (futbollibre.mx) | Activo con mirrors | Agregador | Backend: agenda18.com |
| Rojadirecta | Activo con mirrors | Agregador | Indice de enlaces, no hostea video |
| la18hd.su | Activo | CDN de streams | Extrae de ESPN, Fox, TNT, etc. Anti-hotlinking por Origin/Referer |
| la20hd.com | Activo | CDN de streams | Backend de Pelota Libre. API: /eventos/json/agenda123.json |
| streamtp-golden1.click | Activo | CDN de streams | Proveedor de streams HLS |
| fubo18.com | Activo | CDN de streams | Proveedor de streams HLS |
| Streamed.pk | Activo | Agregador | Fuente del live-sport-plugin |
| DaddyLiveHD | Bloqueado (ago 2026) | Agregador | Usado por MediaFusion. Inestable |

---

## 7. Por que es inestable (y por que no puede garantizar "cero caidas")

1. **Dependencia de terceros**: Los streams vienen de CDNs que pueden caerse, cambiar de dominio o bloquear IPs.
2. **Rotacion de dominios**: Los agregadores rotan dominios constantemente (14 mirrors en Al Angulo). Un scraper que apunta a un dominio muerto deja de funcionar.
3. **Anti-bot evolutivo**: Cloudflare, JS challenges, deteccion de DevTools, extensiones falsas. Lo que funcionaba ayer puede no funcionar manana.
4. **Tokens expirables**: Las URLs de segmentos expiran en minutos. Un proxy debe re-extraer la playlist fresca constantemente.
5. **Legal**: Takedowns activos (arresto del creador de Al Angulo, bloqueo de Pelota Libre, bloqueo de DaddyLiveHD en 2026).
6. **Publicidad maliciosa**: Los sitios gratuitos monetizan con ads que pueden contener malware.

---

## 8. Integracion real (lo que si funciona y es verificable)

### Para VOD (peliculas/series): TorBox + AIOStreams
- TorBox streamea directo desde su cache. Si el contenido esta cacheado, reproduccion instantanea.
- Si no esta cacheado, TorBox lo descarga en sus servidores y lo sirve.
- AIOStreams filtra por cached/uncached y maneja el proxy de comparticion.
- **Esto es estable y on-demand.** No depende de scrapers.

### Para deportes en vivo: opciones reales

**Opcion A - MediaFusion (self-hosted, pesado)**
- Repo: https://github.com/mhdzumair/MediaFusion
- Imagen: mhdzumair/mediafusion:6.1.6
- Requiere: PostgreSQL, Redis, Prowlarr, TRAWL (mkcert para HTTPS).
- Fuentes: DaddyLiveHD (bloqueado 2026), SportVideo, y otros.
- Veredicto: Funciona parcialmente. Inestable en eventos masivos. No garantiza cero caidas.

**Opcion B - Lista M3U IPTV (paga)**
- Contratar suscripcion IPTV con Xtream Codes o lista M3U.
- Integrar en Stremio con addon generico de M3U (stremio-addons.net).
- Veredicto: Unica opcion que garantiza estabilidad y baja latencia. Depende del proveedor.

**Opcion C - Addons publicos de Stremio**
- live-sport-plugin (rajhodedara): multi-fuente, proxy HLS, WASM decryption. Real y verificable.
- MediaFusion (ElfHosted): instancia publica en https://mediafusion.elfhosted.com
- Stremio-addons.net: catalogo de addons de deportes.

### Lo que NO existe como solucion estable
- Scraper de PelotaLibre self-hosted: NO existe. Pelota Libre fue bloqueado en 2026.
- Addon "Metegol" estable: existe en GitHub (Geber-Dev0/Metegol) pero depende de dominios que rotan y pueden morir.
- "Agenda18" como servicio independiente: es un backend de futbollibre, no un servicio self-hosted.

---

## 9. Como extraer streams (para referencia tecnica)

Si alguien quiere implementar un scraper (bajo su propia responsabilidad), el flujo es:

1. **Fetch agenda**: GET al endpoint de agenda (HTML o JSON).
   - alangulotv.si/agenda.php (HTML, parsear `<li>`)
   - la20hd.com/eventos/json/agenda123.json (JSON)
   - agenda18.com/agenda.json (JSON)

2. **Decodificar enlaces**: Los enlaces suelen estar en base64 en un parametro `r=`.
   - `decodeStreamUrl(r)` -> URL del endpoint de terceros.

3. **Fetch pagina del proveedor**: Con headers User-Agent + Referer. Puede requerir Cloudflare bypass (TRAWL/FlareSolverr).

4. **Extraer playbackURL**:
   - Regex simple: `/playbackURL\s*=\s*"([^"]+)"/`
   - Ofuscacion: array de pares [idx, base64] + clave k = fnA() + fnB(). Cada base64 decodifica a digitos, menos k = charCode.
   - Fallback: buscar primera URL .m3u8 en el HTML.

5. **Proxy HLS**: Servir el m3u8 y segmentos a traves de un proxy que:
   - Añade headers Referer/Origin correctos.
   - Reescribe URLs de segmentos.
   - Maneja tokens expirables (re-extraer playlist fresca si falla).

6. **Servir a Stremio/Nuvio**: Manifest con catalog + stream resources. El stream URL apunta al proxy.

---

## 10. Estado actual del streaming deportivo gratuito (Octubre 2026)

A partir de los reportes de usuarios (Twitter/X, Reddit, foros), el panorama actual es:

### Sitios que siguen activos (con limitaciones)
| Sitio | Estado | Notas |
|---|---|---|
| lacancha.tv | Activo | Mencionado por usuarios como alternativa estable. Sin verificacion de estabilidad en eventos masivos. |
| fctv33 | Activo | Mencionado como opcion para futbol. Sin verificacion de estabilidad. |
| PirloTV | Activo | Agregador clasico. Calidad variable, pop-ups agresivos. |
| Elitegol | Activo (con advertencias) | Usuarios advierten NO entrar (posible malware/phishing). |
| Sportzx | Activo | Requiere VPN segun usuarios. Posible malware. |
| deporte libre | Activo | Mencionado como alternativa. Sin verificacion. |
| RBTV+ | Activo | Mencionado por usuarios. Sin verificacion. |
| Fawanews | Activo | Mencionado como "top". Sin verificacion. |
| Tiroalpalo | Activo | Mencionado por usuarios. Sin verificacion. |
| Jeinzmacias | Activo | Mencionado por usuarios. Sin verificacion. |
| Cometa (app) | Activo (iOS) | App de App Store. Requiere busqueda manual. |
| G Sports | Activo (Android TV) | App para Android TV. Calidad variable. |
| Acestream | Activo (P2P) | Protocolo P2P. Requiere cliente Acestream. Latencia variable. |

### Sitios bloqueados/descontinuados
| Sitio | Estado |
|---|---|
| Pelota Libre (pelotalibre.la) | Bloqueado (2026) |
| Futbol Libre (futbollibre.mx) | Bloqueado/descontinuado (2026) |
| Rojadirecta (dominios .com/.org) | Bloqueado en multiples paises |
| Al Angulo TV (alangulotv) | Creador arrestado (2025, Argentina) |
| DaddyLiveHD | Bloqueado (ago 2026) |
| Elitegol | Advertencia de malware por usuarios |

### Conclusion
TODOS los sitios gratuitos son agregadores con las mismas limitaciones:
- Dependen de scrapers de terceros que pueden caerse.
- Dominios rotan constantemente.
- Publicidad maliciosa (phishing, malware).
- No garantizan "cero caidas" ni baja latencia.

La unica via que garantiza fiabilidad es **IPTV premium (Via B)** con servidores dedicados.

## 11. Conclusion para el usuario

- **Peliculas/series**: TorBox + AIOStreams es la solucion correcta. Estable, on-demand, sin descargas locales.
- **Deportes en vivo**: No existe una solucion gratuita y estable. Las opciones son:
  - MediaFusion (Via A): funciona parcialmente, puede fallar, delay de 30-90s.
  - IPTV premium (Via B): unica opcion con garantia de estabilidad y baja latencia.
  - Addons publicos de Stremio (live-sport-plugin, MediaFusion en ElfHosted): gratuitos pero dependientes de scrapers.
- **Subtitulos VOSE**: Subtitle Sync (client-side) con OpenSubtitles/SubDL/SubSource. Funciona mejor con streams cacheados.
- **Privacidad**: Pi-hole + Unbound + MediaFlow Proxy. Sin filtracion DNS ni IP.
- **HTTPS**: Caddy o Cloudflare Tunnel para compartir fuera de la LAN.

El stack en este repositorio (docker-compose.yml) implementa la arquitectura correcta para VOD + privacidad. Para deportes, se documentan las opciones reales con sus limitaciones honestas.
'@ | Set-Content docs/COMO_FUNCIONAN.md