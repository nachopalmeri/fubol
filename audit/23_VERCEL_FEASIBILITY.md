# ¿Se puede subir Fubol a Vercel para no depender de la PC encendida?

Fecha: 2026-11-01. Evaluación hecha sobre el código real, no sobre supuestos.

**Respuesta corta: parcialmente, y se pierde justo la función prioritaria del
proyecto.** Vercel puede correr el front y ~80% del back. No puede correr el
relay de ffmpeg, que es lo que hace reproducibles los canales argentinos.

Para el objetivo real —que la web funcione sin tu computadora encendida— la
opción correcta no es Vercel sino un host de contenedores always-on, porque la
app ya está containerizada y ahí funciona el 100% sin reescribir nada.

## 1. Qué corre bien en Vercel

Verificado: las 21 rutas de API declaran `runtime = "nodejs"`, así que ninguna
depende del edge runtime.

| Función | Estado en Vercel | Por qué |
| --- | --- | --- |
| Front completo (páginas, player, PWA) | ✅ | Next.js 16, es el caso de uso nativo de Vercel |
| Catálogo, búsqueda, metadata (Cinemeta, TMDB, AIO) | ✅ | Solo HTTP a addons externos |
| Subtítulos: listado, proxy y conversión a WebVTT | ✅ | Solo HTTP + transformación en memoria |
| Sync de subtítulos por referencia | ✅ | JS puro; validado offset 0 ms / score 1.0 en el control |
| Sync por audio | ✅ si se hostea el sidecar | `audioSync` llama a `SUBSYNC_URL` por HTTP, no a ffmpeg local |
| Agenda y fixtures | ✅ | HTTP + lógica pura |
| Vivo **passthrough** (`/api/stream`) | ✅ con reservas | Cada segmento HLS es un request corto e independiente |
| VOD vía Internet Archive | ✅ | MP4 por HTTP con Range |

## 2. Qué NO corre en Vercel

### Bloqueo duro: el relay de ffmpeg

`src/lib/live/relay.ts` hace tres cosas incompatibles con serverless:

1. `spawn()` de un proceso ffmpeg de larga vida.
2. Escribe segmentos HLS a disco una vez por segundo.
3. **Los lee de vuelta en requests posteriores y distintos.**

El punto 3 es el insalvable. Cada invocación de una función serverless es
aislada y sin estado: el segmento que escribe una invocación no existe para la
siguiente. No es un problema de límites de tiempo ni de permisos, es que el
modelo de ejecución no tiene dónde vivir un pipeline de transcodificación.

**Qué se pierde concretamente:** los canales marcados `relay: true`, que son
`AR · ESPN Premium`, `AR · DeporTV` y `AR · Fox Sports`. O sea, el objetivo
declarado "fútbol argentino sin delay" queda afuera. Los partidos del addon de
deportes (HLS directo, sin relay) sí seguirían funcionando.

### Bloqueo medio: la base de datos

`src/lib/db.ts` usa `node:sqlite` con un archivo en `dataDir`. En Vercel el
filesystem es de solo lectura salvo `/tmp`, y `/tmp` es efímero y por
instancia. Se perderían, en cada deploy y cada cold start: links familiares,
fuentes de vivo, addons registrados, caché y el historial de `source_checks`.

`src/lib/env.ts` además escribe `secret.key` y `admin-password.txt` a disco:
efímeros también, así que las sesiones se invalidarían solas.

Migración necesaria: **Turso (libSQL)** es el camino más corto porque el SQL es
SQLite plano y solo hay **9 archivos** que importan `db.ts`. Neon/Postgres
exigiría reescribir las consultas. `FUBOL_SECRET` y `FUBOL_ADMIN_PASSWORD`
pasarían a variables de entorno (ya están soportadas, ganan sobre el archivo).

`src/lib/subs/service.ts` también cachea los `.vtt` en disco; habría que pasarlo
a la caché de la DB o aceptar perderlo.

### Reservas sobre el vivo passthrough

Aunque técnicamente funcione, hay dos costos:

- **Ancho de banda:** el video pasa por las funciones de Vercel y cuenta como
  egress. Un partido a ~3 Mbps son ~2 GB. El plan Hobby trae 100 GB/mes, así
  que entran ~50 partidos, pero es una cuota que hoy no existe.
- **Duración de función:** Hobby limita a 10 s por invocación (60 s máximo,
  300 s en Pro). Un segmento de 6 s entra holgado; el proxy del playlist
  también. Pero `/api/stream` sirviendo un MP4 largo de VOD con Range sí puede
  chocar con el límite en conexiones lentas.

### Cambio obligatorio de build

`next.config.ts` tiene `output: "standalone"`, que es para Docker. Hay que
quitarlo para Vercel. El `postbuild` que limpia `.next/standalone/data` también
quedaría sin sentido.

## 3. Trabajo estimado por opción

### Opción A — Vercel (pierde los canales argentinos)

| Tarea | Esfuerzo |
| --- | --- |
| Migrar `db.ts` a Turso (9 call sites) | medio |
| Mover secretos a variables de entorno | bajo |
| Quitar `output: "standalone"` y el `postbuild` | bajo |
| Caché de subtítulos a la DB | bajo |
| Degradar con mensaje claro los canales que necesitan relay | bajo |
| **Resultado** | Front + VOD + subs + agenda + vivo directo. **Sin canales argentinos.** |

### Opción B — Host de contenedores always-on (recomendada)

La app ya tiene `web/Dockerfile` funcionando y `compose.web.yml`. Un host que
corra contenedores con volumen persistente da el 100% de las funciones,
incluido ffmpeg, sin tocar una línea de código.

| Host | Encaje | Nota |
| --- | --- | --- |
| **Fly.io** | muy bueno | Docker nativo, volumen persistente, región cercana (gru/eze), ~5 USD/mes en la escala más chica |
| **Railway** | bueno | Deploy desde el Dockerfile, volumen persistente, muy simple |
| **Render** | bueno | Igual; el plan gratis duerme el servicio, así que haría falta el pago |

| Tarea | Esfuerzo |
| --- | --- |
| `fly.toml` + volumen para `/data` | bajo |
| Secretos como secrets del host | bajo |
| tmpfs o volumen para `FUBOL_RELAY_DIR` | bajo |
| Apuntar un dominio y poner `FUBOL_BASE_URL` + `FUBOL_TRUST_PROXY=1` | bajo |
| **Resultado** | **Todas las funciones, sin la PC encendida.** |

### Opción C — Híbrida

Front y VOD en Vercel, y solo el relay en una máquina chica. Dos deploys, dos
dominios, CORS y tokens cruzados. Más piezas móviles que la opción B por la
misma plata. No la recomiendo.

## 4. Recomendación

**Opción B.** El pedido real es "que no dependa de mi computadora", no "que esté
en Vercel". La app ya está containerizada y probada en Docker; subirla a Fly.io
es configuración, no reescritura, y conserva el relay —que es la única razón por
la que los canales argentinos se pueden ver en un navegador.

Si igual se quiere Vercel, es viable, pero hay que aceptar explícitamente que
los canales que pasan por relay dejan de funcionar y que la DB se migra a Turso.

## 5. Nota sobre el acceso

Es un despliegue privado para mostrar a un profesor. En cualquiera de las dos
opciones el acceso sigue siendo el que ya tiene la app: password de admin y
links `/f/CODIGO` con PIN y vencimiento. Con un dominio público conviene además:

- `FUBOL_TRUST_PROXY=1` (el host termina TLS y es la única entrada).
- `FUBOL_BASE_URL` fijo, para que los links familiares se armen bien.
- `FUBOL_ADMIN_PASSWORD` y `FUBOL_SECRET` como secrets, no autogenerados.

El lockout progresivo y el rate limit que se agregaron el 2026-11-01 están
pensados justo para este escenario: con el puerto expuesto al mundo, un límite
plano de 10 intentos por minuto permitía ~14.400 pruebas de password por día.

---

## 6. Actualizacion 2026-11-10: despliegue real en Vercel (hecho, no proyectado)

La evaluacion de arriba quedo desactualizada en tres puntos. Esto es lo que paso
cuando se publico de verdad, con evidencia del despliegue en produccion.

### 6.1 El estado se resolvio sin Turso ni click legal

La base de datos no migro a Turso. El estado paso a ser **un solo documento JSON**
(`web/src/lib/state/`): links, fuentes, addons y ajustes en una fila. Hay dos
backends:

- `db.ts` (SQLite) para Docker y local, con migracion automatica desde las
  tablas viejas.
- `blob.ts` (Vercel Blob privado) para Vercel, con escritura CAS por ETag.

Motivo: Turso/Neon/Supabase en el Marketplace de Vercel piden una aceptacion de
terminos en el navegador, que solo puede hacer el usuario. Blob es nativo de
Vercel, no pide click, y el store privado ya traia `BLOB_READ_WRITE_TOKEN`.

Un detalle que costó un bug real: `get()` devuelve el ETag **debil**
(`W/"…"`), y `put()` con `ifMatch` solo acepta el ETag fuerte. Con el debil,
toda escritura despues del seed fallaba con 412 y la app devolvia 500 al crear
un link familiar. Se normaliza en `state/blob.ts` (`strongEtag`).

### 6.2 El relay no hace falta para el addon de Sports Streams

La conclusion anterior ("se pierden los canales argentinos") era incorrecta para
este proveedor: los canales de Sports Streams son HLS directo, no piden relay.
El relay solo se usa para fuentes marcadas `relay: true` en su configuracion.

### 6.3 El detalle que si hacia falta: el token atado a la IP

El manifest personal de Sports Streams entrega URLs con un JWT que **incluye la
IP de quien lo pidió**:

    payload = { slug: "now-sky-sports-premewweew", ip: "152.171.21.212.236", exp: … }

El origen responde `403 Stream already active on another device` si la misma URL
se pide desde otra direccion. Vercel cambia de IP de salida entre invocaciones,
así que el proxy se quedaba con una URL muerta y ningun canal abria.

La correccion esta en `web/src/app/api/stream/route.ts`: el token firmado que
lleva la app ahora incluye la referencia del addon (`a: { i, t, s }`), y el
proxy **vuelve a preguntarle al addon** en cada request, de modo que la URL se
emite y se consume desde la misma invocacion. Los segmentos del proveedor van
por otro host con su propia firma y no tienen ese problema.

Verificado en produccion: Sky Sports Premier League y TNT Sport 2 devuelven
playlist 200 y segmentos reales de 3-6 MB; en el navegador, 1920x1080 con el
delay del origen medido y mostrado.

### 6.4 Lo que quedo sin resolver (y no es codigo)

- **Los addons que piden cuenta** (SubSource, SubDL, Community Subtitles,
  SubSense, OpenSubtitles PRO) siguen necesitando que el usuario inicie sesion
  en el proveedor y pegue su manifest personal. Antes no habia forma de
  reemplazar la URL de un addon: solo existia borrar y volver a agregar, y para
  las fuentes el `PATCH` ni siquiera aceptaba la `url`. Ahora ambos aceptan el
  manifest nuevo, lo validan antes de guardarlo y el panel muestra el boton
  "Configurar" con el link del proveedor.
- **VOD con Torrentio/AIOStreams** necesita un token de debrid: sin el, el
  addon devuelve `infoHash` y el navegador no lo puede abrir. El manifest
  personal de AIOStreams que hay en `.secrets/` apunta a la IP de la LAN
  (`192.168.0.122`), que no es alcanzable desde Vercel.

### 6.5 Addons, catalogo y como queda la reproduccion

Estado medido en el deploy el 2026-11-10 (no proyectado):

- **14 addons instalados**: 4 de metadata, 6 de subtitulos, 4 de streams
  (Torrentio, Comet, MediaFusion, Meteor). Es todo lo del catalogo del repo que
  se puede instalar sin credenciales.
- **186 canales vivos** en 14 categorias (Live Now, Today, Football, Basketball,
  American Football, Hockey, Baseball, Motorsport, Fight, Tennis, Rugby, Golf,
  Billiards, AFL, Cricket, Other): los 17 catalogos del addon de deportes
  importados como fuentes. Antes solo se usaban 2 catalogos (43 canales).
- **Catalogo VOD completo**: los cuatro addons de streams responden, y el
  filtro de disponibilidad dejo de borrar los titulos que solo existen como
  torrent. Ahora se listan con el conteo real de fuentes. The Matrix: 1372
  fuentes P2P; la pagina del titulo explica que hacen falta para abrirlas.
- **Reproduccion**: los cuatro addons de streams devuelven 0 URLs HTTP y solo
  `infoHash`. Un navegador no abre un torrent, asi que hace falta una de estas
  dos piezas, ambas resueltas desde el panel sin tocar codigo:
  1. **Token de debrid**: el panel arma el manifest configurado de Torrentio
     (`https://torrentio.strem.fun/<proveedor>=<token>/manifest.json`), lo
     prueba contra un titulo real y informa si devolvio links directos.
  2. **Stremio server** (resolver de torrents): la URL se guarda en el estado
     y la app proxya el trafico. Es el mecanismo que usan Stremio y Nuvio; el
     contrato queda fijado en `web/tests/torrent-resolver.test.ts`.
- **Lo que no se puede resolver desde Vercel**: el resolver es un proceso de
  larga vida con conexion al enjambre, asi que no puede vivir dentro de una
  funcion. Va en un contenedor propio (la red de casa o un host con IP fija) y
  la app lo llama por HTTP.
