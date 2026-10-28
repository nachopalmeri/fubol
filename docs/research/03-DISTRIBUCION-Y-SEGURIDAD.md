# Distribución, link familiar y seguridad

## Objetivo

`https://dominio/f/CODIGO` → la familia entra desde el navegador, sin instalar,
sin cuenta, en mobile y desktop. Revocable en un clic.

## Opciones de hosting

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| VPS + Caddy + dominio | HTTPS automático, control total, baja latencia | Cuesta, hay que abrir 80/443 | Soportada |
| Cloudflare Tunnel (named) | Sin abrir puertos, HTTPS, WAF, gratis | Requiere dominio en Cloudflare | **Recomendada** |
| Cloudflare Quick Tunnel | Cero configuración, URL temporal | URL cambia al reiniciar | Modo demo |
| Tailscale Funnel | Privado, sin puertos | Requiere Tailscale en el servidor | Alternativa |
| LAN con CA interna | Ya funciona | Solo LAN, CA por dispositivo | Solo admin |

El contenedor `fubol` corre en `:3001`; Caddy lo publica en el dominio. El túnel
apunta a `fubol:3001`. El link nunca expone el puerto del stack anterior.

## Modelo de autenticación

- **Admin**: password en `FUBOL_ADMIN_PASSWORD` (o generada y guardada en
  `data/admin-password.txt`). Cookie HMAC `HttpOnly; SameSite=Lax; Secure` con
  expiración. Rate limit 10 intentos/min.
- **Familia**: código corto (8 chars base32 sin ambigüedad). Al abrir
  `/f/CODIGO` se valida en SQLite y se emite cookie firmada que incluye el código
  y su expiración. **Cada request revalida en DB**, así revocar es inmediato.
- **PIN opcional** por link (hash scrypt) para links que circulan por WhatsApp.
- **Permisos por link**: `live`, `vod`, o ambos. Un link solo-vivo no puede
  abrir películas.
- **Expiración**: nunca / 24 h / 7 d / 30 d. Se muestra `last_seen_at`.
- **Sin cuentas**: no hay registro, email ni recuperación de password familiar.

### Por qué no JWT puro
Un JWT no se puede revocar sin lista negra. Un código opaco + fila en SQLite +
cookie firmada da revocación instantánea y auditoría simple, con la misma UX.

## Proxy de streams

El navegador no puede reproducir HLS de orígenes sin CORS ni mandar `Referer`
custom. El backend expone:

- `/api/stream?t=<token>`: token = HMAC(payload `{u, r, h, e, s}`), expira 6 h.
- Reescritura de playlists: URIs relativas/absolutas, `EXT-X-KEY`, `EXT-X-MAP`,
  `EXT-X-MEDIA`, `EXT-X-I-FRAME-STREAM-INF`.
- Segmentos con `Range` y streaming passthrough.
- Límite de tamaño para manifests (2 MB) y timeouts.
- **Anti-SSRF**: solo `http/https`, se bloquean loopback, link-local, metadata
  cloud y rangos privados salvo `FUBOL_ALLOW_PRIVATE_SOURCES=1` (IPTV en LAN).
- Rate limit por IP y por link; circuit breaker por host.

El proxy no altera el contenido ni salta autenticación: solo agrega headers que
el navegador no puede enviar y resuelve CORS.

## PWA

- Manifest + iconos + `theme-color`.
- Service worker: cachea shell y última home; **nunca** cachea segmentos ni
  respuestas autenticadas.
- Instalable en Android/iOS; en iOS usa `<video>` nativo (HLS).
- `display: standalone`, `start_url: /`, fallback offline simple.

## Rendimiento y UX familiar

- Primera pantalla < 100 KB de JS crítico; hls.js se carga solo en el player.
- Imágenes de posters con `loading="lazy"` y fallback de iniciales.
- Textos grandes, un solo botón primario por tarjeta, sin menús anidados.
- Estados: cargando, sin señal configurada, fuente caída, reintentando.
- Accesibilidad: foco visible, contraste AA, subtítulos con tamaño ajustable,
  `prefers-reduced-motion`.

## Observabilidad

- Logs JSON a stdout: `ts, level, msg, route, ms, status, sourceId, linkId`.
- Tabla `source_checks` con TTFB, edad de borde, errores y timestamp.
- `/api/health` para Docker/Uptime Kuma.
- Alertas: fuente sin éxito en 3 chequeos → badge rojo en admin (no se envía
  nada externo sin configurar un webhook).

## Variables de entorno

```
FUBOL_SECRET=            # firma de cookies/tokens (64 hex)
FUBOL_ADMIN_PASSWORD=    # opcional; si falta se genera
FUBOL_BASE_URL=          # https://dominio (para links)
FUBOL_DATA_DIR=          # /data en Docker
FUBOL_ALLOW_PRIVATE_SOURCES=0
OPENSUBTITLES_API_KEY=
SUBDL_API_KEY=
SUBSYNC_URL=             # http://subsync:8000
FFMPEG_PATH=ffmpeg
```
