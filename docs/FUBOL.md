# Fubol — app web familiar

Fecha de esta etapa: 2026-10-28. La app vive en `web/` y no reemplaza el stack
AIOStreams/Caddy que ya existía en el repo: es una capa nueva, autocontenida, para
entrar desde el navegador con un link.

## Qué resuelve

- **Vivo multi-fuente:** HLS directo, listas M3U, Xtream Codes y addons Stremio de
  vivo. Varias fuentes por canal, probe en paralelo, ranking y failover automático.
- **VOD:** catálogo, búsqueda, metadata y streams vía protocolo Stremio. Cinemeta
  se siembra como metadata pública; el operador decide qué addons de streams carga.
- **VOSE:** subtítulos ES/EN desde addons u OpenSubtitles, normalizados a WebVTT,
  offset manual y sync por correlación de envolventes. El sync por audio usa
  ffsubsync como sidecar opcional.
- **Link familiar:** `/f/CODIGO` con cookie firmada, revocable al instante, PIN
  opcional, permisos separados de vivo/VOD. Sin cuentas ni instalación.
- **Agenda:** TheSportsDB + calendarios ICS, hora argentina, estado “en vivo”
  derivado del horario (no se inventan goles ni relato).
- **Admin:** fuentes, addons, links, salud y métricas por fuente.

## Arranque local

Requisitos: Node.js 24+ (probado con Node 26), npm 11+.

```bash
cd web
npm ci
npm run dev
```

Abrir `http://localhost:3001`. En el primer arranque se crean:

- `web/data/secret.key` — HMAC de sesiones (o `FUBOL_SECRET`).
- `web/data/admin-password.txt` — password de administración (o
  `FUBOL_ADMIN_PASSWORD`).
- `web/data/fubol.sqlite` — links, fuentes, addons, métricas y preferencias.

El panel se abre en `/entrar?admin=1` (o desde el link **Administración** del pie
de página). Se puede usar aunque ya haya una sesión de link familiar: al entrar
con la password, la cookie pasa a rol admin.

Leer la password generada sin imprimirla en un chat:

```bash
# Linux/macOS
cat web/data/admin-password.txt

# PowerShell
Get-Content web\data\admin-password.txt
```

Entrar a `/admin/login`, configurar una fuente y crear un link. El link se abre
como `http://localhost:3001/f/CODIGO`.

Demo mínima con una señal pública de prueba (no es fútbol, solo valida el player):

1. Admin → Fuentes → agregar HLS con
   `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`.
2. Ir a `/live`, abrir el canal y comprobar que el video avanza.
3. Crear un link en Admin → Links y abrirlo en una ventana privada.

## Docker

El servicio `fubol` está en el `docker-compose.yml` raíz:

```bash
docker compose up -d --build fubol
docker compose logs -f fubol
```

- Puerto: `3001`.
- Datos: volumen `./data/fubol` → `/data`.
- Imagen multi-stage `web/Dockerfile` (Next standalone + ffmpeg).
- Healthcheck: `GET /api/health`.

El build nunca debe incluir `data/` (SQLite y secretos). `npm run build` ejecuta
`postbuild` y borra `.next/standalone/data` si Turbopack lo copió; además
`.dockerignore` excluye `data/` del contexto de la imagen.

No hace falta levantar AIOStreams ni Caddy para usar Fubol. Si ya están
corriendo, el compose los deja intactos.

### Variables de entorno

| Variable | Default | Para qué |
|---|---|---|
| `FUBOL_DATA_DIR` | `./data` | SQLite, secretos y archivos mutables |
| `FUBOL_ADMIN_PASSWORD` | generada | Password del panel |
| `FUBOL_SECRET` | generado | HMAC de cookies y tokens (mín. 32 chars) |
| `FUBOL_BASE_URL` | request | URL pública usada al armar links (`https://fubol.example.com`) |
| `FUBOL_ALLOW_PRIVATE_SOURCES` | `0` | Permitir HLS/M3U en IP privada (LAN/IPTV propia) |
| `FUBOL_INSECURE_COOKIES` | `0` | Cookies sin `Secure`; solo para HTTP en LAN confiable |
| `FUBOL_INCLUDE_INTERNATIONAL` | `1` | Incluir ligas internacionales en la agenda |
| `FUBOL_ICS_URLS` | vacío | Calendarios ICS separados por coma |
| `FUBOL_NO_DEFAULT_ADDONS` | `0` | No sembrar Cinemeta |
| `FUBOL_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `SPORTSDB_KEY` | `123` | API key de TheSportsDB (la pública tiene límite) |
| `OPENSUBTITLES_API_KEY` | vacío | Búsqueda de subtítulos |
| `SUBSYNC_URL` | vacío | Sidecar ffsubsync (`POST /sync`) |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe` | Binarios para audio sync |
| `TZ` | `America/Argentina/Buenos_Aires` | Agenda y horarios |

## Arquitectura

```
Navegador (mobile/desktop/PWA)
   │  cookie HMAC (link o admin)
   ▼
Next.js 16 (App Router, TS estricto)  ── SQLite (node:sqlite)
   │
   ├─ /api/live/session   → probe paralelo + ranking + failover
   ├─ /api/stream         → proxy HLS firmado, anti-SSRF, reescritura
   ├─ /api/vod/*          → addons Stremio (catalog/meta/stream/subtitles)
   ├─ /api/subtitles/*    → VTT, offset y sync
   └─ /api/admin/*        → fuentes, addons, links, salud
```

Decisiones:

- **Sin sesión no hay playback.** El link se revalida contra SQLite en cada
  request; revocar el link corta el acceso aunque la cookie siga existiendo.
- **Tokens de stream de vida corta.** El proxy firma URL y headers; no se aceptan
  URLs arbitrarias del cliente.
- **Anti-SSRF.** Se resuelven DNS y se bloquean rangos privados/loopback salvo
  `FUBOL_ALLOW_PRIVATE_SOURCES=1`.
- **Cache stale.** Si un origen tarda o falla, se sirve la última lista válida y
  se refresca en segundo plano.
- **Logs JSON.** Una línea por evento, sin secretos. `/api/health` para Docker.

## Vivo: latencia y failover

1. Se obtienen candidatos del canal (varias fuentes si el origen las provee).
2. Se prueban en paralelo: TTFB, edad del borde, altura, tipo y estado.
3. `scoreProbe` prioriza baja latencia y borde fresco; una fuente muerta puntúa 0.
4. El player recibe la lista ordenada y puede cambiar de fuente sin recargar la
   página. Los errores fatales de hls.js disparan failover; los recuperables se
   reintentan.
5. El gobernador de latencia ajusta `playbackRate` (1.07 / 0.98) para acercarse
   al vivo sin saltos visibles. “Ir al vivo” salta al borde.
6. HLS baja: `lowLatencyMode`, `liveSyncDurationCount: 1`, buffer corto,
   `backBufferLength: 0` en vivo. Si el origen es LL-HLS, hls.js lo aprovecha.

Límite honesto: si el origen es un re-stream de TV, el delay del origen no se
puede eliminar. La app elige lo más cercano y muestra la latencia estimada.

## VOD y subtítulos

- El cliente implementa el protocolo público de addons Stremio: `manifest.json`,
  `/catalog`, `/meta`, `/stream`, `/subtitles`.
- Cinemeta se usa solo para metadata pública; no trae streams.
- Los addons de streams son configurables. Fubol no incluye addons de piratería
  por defecto ni scrapea señales premium.
- Formatos de subtítulos: SRT, ASS/SSA, WebVTT. Se normalizan a WebVTT y se
  sirven por el proxy firmado.
- Sync:
  - **Offset manual** persistido por título en el navegador.
  - **Referencia:** correlación de envolventes entre dos pistas.
  - **Audio:** `SUBSYNC_URL` apunta a un sidecar ffsubsync; si no está, la UI
    muestra la opción como no disponible.
- Forzados: se respeta el flag del addon cuando existe.

### “Sin fuentes para este título”

Es el estado esperado cuando hay metadata pero ningún addon de **streams**:

1. Entrar al panel con el pie de página **Administración** (o abrir
   `/entrar?admin=1`; funciona incluso si ya hay una sesión de link familiar).
2. Ir a **Addons VOD** → **Agregar addon**.
3. Pegar el `manifest.json` de un addon de tipo `vod` que el operador tenga
   derecho a usar. Cinemeta es `meta`: solo carátulas y sinopsis, nunca fuentes.
4. Volver al título: la búsqueda de fuentes es automática.

Si quien mira es un link familiar, el estado vacío explica el paso a seguir; si
la sesión es de administrador, muestra el botón **Configurar addons VOD** que
abre el panel en la pestaña correcta (`/admin?tab=addons`).

## Deploy público con Cloudflare Tunnel

1. Crear el túnel y la DNS (una vez, en la máquina servidor):

```bash
cloudflared tunnel create fubol
cloudflared tunnel route dns fubol fubol.example.com
```

2. `~/.cloudflared/config.yml`:

```yaml
tunnel: <UUID-del-tunel>
credentials-file: /home/usuario/.cloudflared/<UUID>.json
ingress:
  - hostname: fubol.example.com
    service: http://localhost:3001
  - service: http_status:404
```

3. Definir `FUBOL_BASE_URL=https://fubol.example.com` en `.env` y levantar:

```bash
docker compose up -d fubol
cloudflared tunnel run fubol
```

Cloudflare envía `X-Forwarded-Proto: https`; la app marca las cookies como
`Secure`. No hace falta abrir el puerto 3001 al mundo: el túnel es la única
entrada. El archivo de credenciales del túnel no se versiona.

### LAN sin túnel

Si la familia entra por `http://192.168.x.x:3001`, poner
`FUBOL_INSECURE_COOKIES=1` o terminar HTTPS en un reverse proxy propio. Sin eso,
el navegador descarta la cookie `Secure` y el login no persiste. Para IPTV en la
LAN, agregar `FUBOL_ALLOW_PRIVATE_SOURCES=1` solo si el origen es tuyo.

## Seguridad

- Cookies `httpOnly`, `sameSite=lax`, `Secure` cuando el request es HTTPS.
- Link opaco + revalidación en cada request + revocación inmediata.
- PIN opcional con scrypt.
- Rate limit en login y endpoints sensibles.
- Proxy con allowlist de esquemas, DNS resuelto y bloqueo de rangos privados.
- Secretos por env o archivos con permisos `0600`; nunca hardcodeados.
- No hay login de usuarios finales: el link es la credencial. Tratarlo como
  password y rotarlo si se filtra.

## API

| Ruta | Uso |
|---|---|
| `GET /api/health` | Salud y uptime |
| `POST /api/auth/admin` | Login admin |
| `POST /api/auth/link` | Validar link / PIN y crear sesión |
| `GET /api/live/channels` | Canales configurados |
| `GET /api/live/session?channel=…` | Sesión de un canal con fuentes rankeadas |
| `GET /api/stream?t=…` | Proxy HLS firmado |
| `GET /api/live/events` | Agenda |
| `GET /api/vod/search?q=…` | Búsqueda |
| `GET /api/vod/streams?type=…&id=…` | Streams/subtítulos de un título |
| `POST /api/subtitles/sync` | Offset o audio sync |
| `GET/POST /api/admin/sources` | Fuentes de vivo |
| `GET/POST /api/admin/addons` | Addons VOD |
| `GET/POST /api/admin/links` | Links familiares |
| `GET /api/admin/health` | Estado de fuentes |

## Operación

```bash
# Desarrollo
cd web && npm run check        # typecheck + lint + test
npm run build                  # build standalone

# Producción
docker compose up -d --build fubol
curl -fsS http://localhost:3001/api/health
docker compose logs -f fubol

# Backup (detener no es obligatorio con SQLite en modo WAL,
# pero es más prolijo)
tar czf fubol-backup-$(date +%F).tar.gz data/fubol .env
```

Rotar el link: Admin → Links → revocar y crear uno nuevo. Rotar secretos:
cambiar `FUBOL_SECRET` invalida todas las sesiones; los links siguen en SQLite y
se pueden volver a abrir.

## Límites conocidos

- No se incluyen scrapers de señales premium, bypass de captchas ni listas IPTV
  sin autorización. El operador carga sus fuentes legales.
- No hay DRM (Widevine/PlayReady). Un stream DRM no se reproduce.
- MKV/AVI directo no se reproduce en Chrome; el camino VOD es HLS/MP4 o remux
  con ffmpeg (siguiente fase).
- El VOD depende de los addons configurados. Sin addon de streams, el catálogo
  se ve pero no hay fuentes.
- La agenda es factual: no se inventan goles, relato ni canales.
- El delay del origen HLS no se puede eliminar; se elige y se muestra.

## Verificación de esta etapa

```bash
cd web
npm run typecheck
npm run lint
npm test
npm run build
```

Resultado esperado: todo en verde. La demo local se validó con home, admin,
link `/f/CODE`, canales y reproducción HLS a través del proxy.
