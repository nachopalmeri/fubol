# Centro de Streaming Privado - Stremio/Nuvio + TorBox + AIOStreams

Stack self-hosted, on-demand, sin descargas locales masivas, sin anuncios. Cubre peliculas, series, deportes en vivo y subtitulos VOSE (ES/EN) sincronizados. Para ti y 2-3 familiares.

> **Estado: runtime local + 13 catalogos + deportes; VOD en Stremio por P2P, VOD en Desktop pendiente de TorBox.**
> El nucleo (`aiostreams` + `caddy`) arranca desde la raiz del repo, es accesible por HTTPS
> en la LAN y los dashboards estan protegidos. La app web sirve para configurar/explorar,
> pero **no reproduce HLS**; para deportes y MKV se usa la app de escritorio o Android con mpv.
> Sin `.secrets/torbox.key`, AIOStreams queda en modo P2P: Torrentio/Comet/MediaFusion devuelven
> streams `infoHash` que Stremio/Nuvio reproducen, pero AIOStreams Desktop no (solo abre URLs
> directas). Para peliculas/series dentro de Desktop hay que cargar la clave TorBox; al hacerlo y
> ejecutar `node scripts/aiostreams-config.mjs prepare`, vuelven los streams debrid y el service wrap.
> Deportes (Sports Streams + perfil opcional MediaFusion) y DNS propio (Pi-hole/Unbound) no
> bloquean el nucleo. El acceso remoto familiar se define en la Etapa B.
> Evidencia: `audit/10_RUNTIME_BASELINE.md` y `audit/11_CLIENT_AND_IPTV.md`.
> Guías: `docs/WIRING.md` (instalación), `docs/TV.md` (portar a la TV) y
> `docs/GUIA_FAMILIA.md` (uso simple), `docs/GUIA_IPHONE.md` (iPhone).
> Addons y latencia: `docs/ADDONS.md`; catálogo verificable con `node scripts/addons.mjs status`.
> Revisión de addons/fuentes: `audit/14_ADDON_REVIEW.md`, `audit/15_ADDONS_AND_LATENCY.md` y `audit/13_SPORTS_SOURCES_AND_TRIAL.md`.

## Arquitectura (Etapa A)

```
Cliente (Stremio / Nuvio / navegador)
        |
        v  HTTPS en la LAN (Caddy, CA interna) + manifest URL por usuario (sin API key)
AIOStreams (self-hosted, :3000)  -->  TorBox (debrid, plan pago)
        |  (API key de TorBox queda en el servidor, cifrada en SQLite)
        |
        v
Streams directos (cached / uncached)  -->  Reproductor final
        +
Subtitle Sync (cliente) --> OpenSubtitles / SubDL / SubSource (ES/EN, sincronizado)
        +
Deportes: Sports Streams (integrado, principal) + MediaFusion opcional
          (perfil "sports": PostgreSQL + Redis + Prowlarr + TRAWL) o lista M3U IPTV premium (Via B)
        +
DNS (perfil opcional "dns"): Pi-hole + Unbound (reenvia a Cloudflare; ver privacy/)
        +
HTTPS: Caddy (:443 panel/manifests, :8443 MediaFusion) con CA interna de Caddy
```

Principios:
- NUNCA se descarga el archivo completo en el servidor local. TorBox streamea directo.
- La API key de TorBox queda en el servidor (AIOStreams). Los familiares solo reciben un manifest URL.
- TorBox permite multi-IP y compartir cuenta/API key; el riesgo real a cuidar es el abuso de ancho de banda, no la IP.

## Clientes

| Cliente | Uso | Estado |
|---|---|---|
| **AIOStreams Desktop** (Windows/macOS/Linux) | Cliente principal en PC: HLS/MKV y subtítulos/offset con mpv | 0.20.0 instalado; HLS en vivo con mpv; VOD necesita TorBox (no reproduce P2P) |
| **AIOStreams web** (`/jellyfin/web/`) | Login, catalogo, busqueda y configuracion | Funciona para explorar; **no reproduce HLS en Chrome** |
| **Safari iPhone** | Catálogo y HLS compatible dentro de la LAN | CA preparada para instalar; playback VOD/MKV requiere prueba en el teléfono |
| **TV Samsung** | Deportes por antena si están en abierto; VOD por PC HDMI | Sin cable; la TV no instala el cliente. Android TV stick requiere autorización/compra |
| **Stremio / Nuvio** | Fallback con el manifest URL | Sigue disponible; no es el camino principal |

La app de escritorio se descarga del release oficial `desktop` del repositorio de AIOStreams.
El asset `aiostreams-desktop-win-x64.zip` es portable (no requiere instalador); se puede probar
sin tocar el sistema. En esta PC quedó en `D:\Fubol\Client` con acceso directo **Fubol** en el
Escritorio. La web solo se usa para administrar y buscar, no para ver deportes.

PC relevada: Ryzen 5 3600, RTX 2060 Super 8 GB, 16 GB RAM, monitor 1080p. Para VOD se prioriza
**1080p REMUX/BluRay**; HEVC esta permitido (la GPU lo decodifica) y 2160p/1440p quedan excluidos.
En un monitor 1080p el 4K no agrega detalle visible y consume mas ancho de banda; 1080p de alta
tasa es la mejor relacion calidad/fluidez. La TV Samsung es 720p, asi que para TV alcanza 720p/1080p.

## Componentes usados (solo reales y verificables)

| Componente | Imagen / Fuente | Rol |
|---|---|---|
| AIOStreams | ghcr.io/viren070/aiostreams:latest | Orquestador + proxy de comparticion + gestion de usuarios (nucleo) |
| Caddy | caddy:latest | HTTPS en la LAN con CA interna (nucleo) |
| Pi-hole | pihole/pihole:latest | Bloqueo de anuncios a nivel DNS (perfil `dns`) |
| Unbound | mvance/unbound:latest | Resolver de Pi-hole; reenvia a Cloudflare por defecto (perfil `dns`) |
| MediaFusion | mhdzumair/mediafusion:6.0.0 | Deportes en vivo (perfil `sports`) |
| PostgreSQL | postgres:18-alpine | Base de datos de MediaFusion (perfil `sports`) |
| Redis | redis:latest | Cache de MediaFusion/MediaFlow (perfil `sports`) |
| Prowlarr | ghcr.io/hotio/prowlarr:latest | Gestor de indexers para MediaFusion (perfil `sports`, solo local) |
| TRAWL | ghcr.io/germondai/trawl:latest | Bypass Cloudflare para indexers publicos (perfil `sports`) |
| MediaFlow Proxy | mhdzumair/mediaflow-proxy:latest | Proxy de streams (perfil `sports`, solo local en Etapa A) |
| Subtitle Sync | addon de Stremio (cliente) | Subtitulos VOSE ES/EN sincronizados |
| TorBox | servicio externo (API key) | Motor de debrid |

No incluido (por diseño): Sonarr, Radarr, Lidarr, qBittorrent, Jellyfin, ni scrapers inventados.

## Inicio rapido

### Requisito previo: `setup.sh`

Genera `.env` con secretos aleatorios, detecta `SERVER_HOST` (la IP LAN con la que tus
dispositivos llegan al servidor) y crea `config/mediafusion.env`. No imprime secretos.

- **Opción A (VM):** no lo corras en el host: `vagrant up` lo ejecuta dentro de la VM
  (ahí detecta la IP correcta). Si `SERVER_HOST` no coincide con la VM, el provision te avisa.
- **Opción B (Docker en el host):**

```bash
bash setup.sh
```

Si tu IP LAN cambia, volvé a correrlo donde corre Docker (o editá `SERVER_HOST` en `.env`).
Hace backup de `.env` en `.env.bak.*` antes de tocarlo.

### Opcion A: VM con Vagrant (recomendada)

Requisitos en el host: VirtualBox + Vagrant.

```bash
cd vm
vagrant up          # crea la VM Ubuntu, instala Docker y levanta el nucleo (la primera vez: varios minutos)
```

`vagrant up` pregunta que interfaz del host puentear: elegi tu Wi-Fi/Ethernet activa
(red bridged, para que la TV y demas dispositivos alcancen la VM).

Al terminar (reemplaza `<IP-LAN>` por la IP que muestra el provision):

| Servicio | URL |
|---|---|
| AIOStreams (panel) | http://<IP-LAN>:3000 |
| HTTPS panel + manifests | https://<IP-LAN> (requiere instalar la CA interna) |
| MediaFusion (perfil sports) | https://<IP-LAN>:8443 |
| Prowlarr (perfil sports) | solo desde el servidor: http://127.0.0.1:9696 |
| MediaFlow (perfil sports) | solo desde el servidor: http://127.0.0.1:8888 |
| Pi-hole (perfil dns) | http://<IP-LAN>:8053/admin |

Nota: el panel funciona por `http://<IP-LAN>:3000` sin instalar nada (útil para probar),
pero con la CA instalada usá `https://<IP-LAN>`: la cookie de sesión viaja cifrada.

### Opcion B: sin VM (Docker en el host)

```bash
bash setup.sh          # genera .env, detecta IP, valida compose
docker compose up -d   # levanta el nucleo
```

### Perfiles opcionales (no bloquean el nucleo)

```bash
docker compose --profile sports up -d   # deportes: MediaFusion + PostgreSQL + Redis + Prowlarr + TRAWL + MediaFlow
docker compose --profile dns up -d      # DNS propio: Pi-hole + Unbound (necesita puerto 53 libre)
```

---

## GUÍA PASO A PASO

### Paso 1 - Obtener la API key de TorBox (MANUAL)

1. Crear cuenta en https://torbox.app y contratar un plan.
   - Essential: 3 descargas activas concurrentes (suficiente para 1-2 personas).
   - Pro: hasta 10 descargas activas concurrentes (recomendado para 3+ familiares).
   Los titulos ya cacheados en TorBox no consumen slot de descarga.
2. Ir a https://torbox.app/settings -> copiar la API Key.
3. Anotarla: la usarás en el Paso 3. No la compartas con nadie.

La API key queda en el servidor (AIOStreams); los streams los sirve TorBox directo a cada dispositivo. Los familiares nunca ven la key.

### Paso 2 - Levantar el stack

```bash
vagrant up   # o: docker compose up -d
```

### Paso 3 - Configurar AIOStreams con TorBox

**Camino recomendado (script, sin pegar la clave en la UI):**

1. Guardar la key sin mostrarla (PowerShell, desde la raíz del repo):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\set-torbox-key.ps1
```

El script pide la key de forma oculta, la guarda en `.secrets/torbox.key`, la valida y ejecuta
`prepare`. Alternativa manual: crear `.secrets/torbox.key` con la API key en **una sola linea**
(sin comillas ni espacios).

2. Validar sin imprimirla:

```bash
node scripts/torbox-validate.mjs
# esperado: http=200, authorized=true, plan=...
```

3. Crear/actualizar el usuario y la configuracion:

```bash
node scripts/aiostreams-config.mjs prepare --require-key
node scripts/aiostreams-config.mjs status
# esperado: stored=true, manifest_http=200, torbox_configured=true, vod_mode=debrid
```

El script lee la clave desde `.secrets/torbox.key`, crea el usuario si no existe y guarda
las credenciales del perfil en `.secrets/aiostreams-user.env` (nunca las imprime).
El manifest queda en ese archivo; no se comparte la API key.

**Alternativa manual (panel):**

1. Abrir http://<IP-LAN>:3000 (o https://<IP-LAN> si ya instalaste la CA interna).
2. El panel pide login: usuario `admin` y la password que esta en `.env`
   (`AIOSTREAMS_AUTH`). Para verla en tu propia terminal: `grep AIOSTREAMS_AUTH .env`.
3. Ir a Services -> agregar TorBox -> pegar la API key del Paso 1.
4. Ir a Addons -> Marketplace -> instalar los addons que quieras (Torrentio, Comet, MediaFusion, etc.). AIOStreams les inyecta la credencial de TorBox automáticamente.
5. Configurar filtros (resolución, idioma, cached/uncached) según preferencia.
6. Guardar (Save & Install) y crear/actualizar el usuario desde el panel.
7. Copiar el manifest URL que aparece (formato del Paso 4).

AIOStreams guarda las credenciales cifradas en SQLite (./data/aiostreams). No se exponen en el manifest URL.
El panel tiene `AIOSTREAMS_AUTH_REQUIRED=true`: `/stremio/configure` y la escritura de
configuraciones exigen sesion, incluso en la LAN.

### Paso 3b - Configurar MediaFlow Proxy (perfil sports, opcional)

MediaFlow Proxy (mhdzumair/mediaflow-proxy) es un proxy de streams que reduce la latencia y evita bloqueos de IP al enrutar los streams a traves de tu servidor.

1. El servicio solo escucha en `127.0.0.1:8888` (Etapa A): es infraestructura interna.
   desde el propio servidor: `http://127.0.0.1:8888/docs`.
2. En AIOStreams -> Proxy -> seleccionar "MediaFlow Proxy" -> ingresar URL `http://mediaflow-proxy:8888` (nombre interno de Docker) y la API password (de `.env`: `MEDIAFLOW_API_PASSWORD`).
3. AIOStreams enrutará los streams a través del proxy automáticamente.

MediaFlow Proxy no puede arreglar una fuente que se cae. Solo reduce latencia y evita restricciones de IP.

### Paso 4 - Compartir con familiares (manifest URL)

AIOStreams v2 incluye gestión de usuarios. Para cada familiar:

1. En el dashboard de AIOStreams, crear un nuevo usuario (o reutilizar una configuración exportada).
2. Copiar su manifest URL único (formato real de AIOStreams v2):
   `https://<IP-LAN>/stremio/<uuid>/<password>/manifest.json`
3. Enviárselo. El familiar no necesita API key ni configuración técnica.

Instrucciones para el familiar (copiar y enviar):

1. Instalá Stremio (https://www.stremio.com) en tu dispositivo.
2. Instalá primero el certificado del servidor (CA interna; ver sección HTTPS).
3. En Stremio: Addons -> "Install via URL" -> pegá el manifest.
4. Listo. Ya podés ver películas y series. Los subtítulos se configuran aparte (Paso 5).

Stremio exige HTTPS para instalar addons que no sean localhost, por eso el manifest va
por `https://<IP-LAN>`. Si el certificado interno no esta instalado, la instalación falla.

### Paso 5 - Subtitulos VOSE (ES/EN) con Subtitle Sync

Subtitle Sync es un addon de Stremio que busca subtítulos en OpenSubtitles/SubDL/SubSource/Titlovi y los sincroniza usando el stream como referencia de tiempo. Se instala en el cliente, no en el servidor.

1. Abrir Stremio -> Addons -> buscar "Subtitle Sync" (o instalar desde https://stremio-addons.net).
2. Configurar en el addon:
   - Idiomas: Español + Inglés (VOSE).
   - Fuentes: OpenSubtitles, SubDL, SubSource.
   - Sincronización automática: activada (usa el stream de TorBox como referencia).
3. En Stremio -> Settings -> Subtitles -> seleccionar "Subtitle Sync" como proveedor.

Para que la sincronización funcione, el stream debe estar reproduciéndose. Funciona mejor con streams cacheados en TorBox.

Alternativa: si Subtitle Sync no sincroniza bien, usar "OpenSubtitles v3" (https://opensubtitles-v3.strem.io/manifest.json) + ajuste manual de offset.

### Paso 6 - Deportes en vivo (DOS VÍAS)

**Sports Streams ya está integrado** en AIOStreams (7 catálogos, sin perfil extra). Para chequear
los partidos argentinos y medir latencia:

```bash
node scripts/check-argentine-football.mjs
```

Orden actual del home: **Fútbol → En vivo internacional → Hoy → otros deportes**. En la última
consulta de `Sports Streams`, sus canales fueron Sky/TNT UK, Fox US/AU y TSN Canadá; no apareció
un canal argentino ni se verificó relato en español/Bambino. No se va a etiquetar Sky como relato
argentino. Los partidos River–Racing e Independiente–Boca están en el catálogo pero ahora devuelven
0 fuentes.

El HLS medido esta ~25-35 s detras del vivo en el origen; con el arranque en el borde
(`live_start_index=-2`) el player suma ~12 s. Total tipico ~35-45 s; no es cero. Si el origen
es un re-stream de TV, puede estar mas atrasado y el player no lo puede corregir. Para cero delay
real hace falta antena/TV abierta. En esta casa no hay cable de TV.
`docker compose --profile sports up -d` solo hace falta si se quiere probar MediaFusion como alternativa.

Como fuente oficial adicional, quedó un acceso directo **LPF Play - AFA** en Escritorio y Start
Menu. Revisar la agenda oficial: es una fuente para las competencias que la AFA emite ahí, no una
garantía de que transmita la Primera División.

Aviso importante: PelotaLibre fue bloqueado/descontinuado en 2026. No existe un scraper estable self-hosted para PelotaLibre.

#### Via A - Gratuita (Sports Streams / MediaFusion, NO garantiza cero caidas)
- MediaFusion corre en el perfil `sports` (PostgreSQL + Redis + Prowlarr + TRAWL).
- Acceso (con la CA interna instalada): https://<IP-LAN>:8443/configure -> activar deportes.
- Addon para Stremio: https://<IP-LAN>:8443/manifest.json
- Fuentes: DaddyLiveHD y otros. DaddyLiveHD fue bloqueado en agosto de 2026. El scraping puede seguir funcionando parcialmente pero es inestable: puede caerse en eventos masivos, tener delay de 30-90s, y depender de CDNs que cambian. MediaFusion tiene circuit breakers y fallback, pero no puede garantizar "cero caidas".
- Prowlarr (solo desde el servidor): http://127.0.0.1:9696 -> agregar indexers.
  Antes de usarlo, activa autenticacion (Settings -> General -> Security -> Authentication: Forms).

#### Via B - Paga (recomendada para maxima fiabilidad y baja latencia)
- Contratar una suscripcion IPTV premium (proveedores que ofrezcan Xtream Codes o lista M3U).
- Integrar la lista M3U en Stremio usando un addon generico de M3U (buscar "IPTV" en stremio-addons.net).
- O integrar Xtream Codes en AIOStreams (si soporta el addon de Xtream).
- Esta es la unica via que puede garantizar "cero caidas" y baja latencia, porque usa servidores dedicados con SLA.

#### iptv-org (evaluado, no integrado)

`iptv-org/iptv` es una colección de enlaces públicos, no un addon de eventos. Una reconsulta el
2026-10-24 encontró una entrada TyC Sports con respuesta HLS 200, además de DeporTV/Showsport; esto
solo prueba que respondió una playlist. No prueba derechos de retransmisión, reproducción completa,
audio español ni relato de Bambino. AIOStreams no consume M3U nativamente; no se integra ni se
presenta como canal garantizado hasta revisar una integración adecuada y autorización.

#### Comparacion honesta

| Criterio | Via A (MediaFusion) | Via B (IPTV pago) |
|---|---|---|
| Costo | Gratis | Suscripcion mensual |
| Fiabilidad | Media-baja (scrapers de terceros) | Alta (servidores dedicados) |
| Latencia | 30-90s de delay tipico | 5-15s de delay tipico |
| Eventos masivos | Puede caerse | Estable |
| Legalidad | Zona gris (scraping de terceros) | Depende del proveedor y jurisdiccion |
| Mantenimiento | Requiere ajustes cuando cambian las fuentes | Minimo |

### Paso 7 - Privacidad (bloqueo DNS, opcional)

```bash
docker compose --profile dns up -d   # Pi-hole + Unbound (necesita puerto 53 libre)
```

1. Configurar el DNS de los dispositivos de la LAN a la IP del servidor (Pi-hole).
2. Pi-hole ya viene con upstream `unbound#53` configurado (nombre interno de Docker;
   el `5335` del compose es solo un puerto local de depuracion, no lo uses como upstream).
3. Agregar blocklists en Pi-hole (ver privacy/README.md).
4. Activar uBlock Origin en el navegador.

Honestidad: Unbound reenvia las consultas a Cloudflare por defecto (config/unbound/forward-records.conf).
No es recursivo de fabrica. Para recursion pura, mira los comentarios de ese archivo.

### Paso 8 - HTTPS en la LAN y acceso remoto

**LAN (Etapa A, ya funciona):** Caddy emite certificados con su CA interna para `SERVER_HOST`.
El panel y los manifests salen por `https://<IP-LAN>`.

Para que un dispositivo confie en el certificado hay que instalar la CA interna:

- Archivo: `data/caddy/caddy/pki/authorities/local/root.crt` (copialo del servidor).
- Windows (PC): doble clic -> Instalar certificado -> "Usuario actual" (o "Equipo local"
  si sos admin) -> Almacen "Autoridades de certificacion raiz de confianza".
- Android / Android TV / Fire TV: Ajustes -> Seguridad -> Cifrado y credenciales ->
  Instalar certificado -> "Certificado de CA".
- iOS/iPadOS: abrir el .crt -> Perfil descargado -> Instalar -> y en
  Ajustes -> General -> Informacion -> Ajuste de confianza de certificados -> activarlo.
- Algunos televisores (Samsung/LG) no permiten instalar CAs de usuario: para esos
  casos el addon no se puede instalar hasta contar con un certificado publico (Etapa B).

**Fuera de la LAN (Etapa B, pendiente):** la decision entre Cloudflare Tunnel, Tailscale o
VPS queda para la etapa de acceso remoto, cuando el funcionamiento local este comprobado.

---

## Seguridad y rotacion de credenciales (Etapa A)

- El panel de AIOStreams exige login (`AIOSTREAMS_AUTH` en `.env`), tambien en la LAN.
- No hay contraseñas por defecto: `setup.sh` genera secretos aleatorios y falla si no puede.
- Puertos expuestos por defecto: `3000` (panel con login), `80/443/8443` (Caddy HTTPS).
  Prowlarr y MediaFlow solo escuchan en `127.0.0.1`; Postgres/Redis/TRAWL no se publican.
- `.env` y `config/mediafusion.env` estan en `.gitignore` y se crean con permisos restrictivos
  (en Linux; en carpetas sincronizadas de Windows los permisos los maneja Windows).

Para rotar una credencial (ejemplo: la password del panel):

1. Editar `.env` y borrar el valor viejo (dejar `AIOSTREAMS_AUTH=`).
2. `bash setup.sh` -> genera uno nuevo sin imprimirlo y actualiza `config/mediafusion.env`.
3. `docker compose up -d` -> recrea los contenedores con el valor nuevo.
4. Datos guardados (importante):
   - Al rotar `SECRET_KEY` (AIOStreams), las credenciales cifradas viejas dejan de leerse:
     volve a entrar al panel y carga de nuevo la API key de TorBox.
   - Al rotar `SECRET_KEY_MF`/`API_PASSWORD` (MediaFusion), no hace falta borrar datos;
     los usuarios del panel vuelven a iniciar sesion.
   - `MEDIAFUSION_DB_PASSWORD` es especial: Postgres solo la aplica al inicializar el
     volumen. Si ya existe `data/postgres/`, cambiala tambien dentro:
     `docker exec -it postgres psql -U mediafusion -c "ALTER USER mediafusion PASSWORD '<nueva>';"`
5. Nunca pegues el valor en issues, chats o logs.

## Limitaciones Reales

1. TorBox cache: Si un stream no esta cacheado, la reproduccion tarda (TorBox lo descarga primero). AIOStreams filtra por cached/uncached.
2. Descargas concurrentes: TorBox limita descargas activas simultaneas segun el plan; los titulos ya cacheados no consumen slot. Plan Pro recomendado para 3+ personas.
3. Uso compartido: TorBox permite compartir cuenta y API key (no limita dispositivos). El riesgo real es el abuso de ancho de banda: mantener un uso razonable y no publicar la API key.
4. Subtitle Sync: depende de que el stream este reproduciendose; puede fallar con streams uncached o codecs raros.
5. Deportes en vivo: dependen de Sports Streams/MediaFusion o listas M3U; pueden caerse. No hay garantia de estabilidad con la Via A. Solo la Via B (IPTV pago) puede garantizar cero caidas. Sports Streams puede devolver un evento sin fuente: la app muestra `No streams found` o un aviso del addon; algunos eventos son solo agenda. El stream informativo `💩 Unknown` (“If streams are not working”) ya no aparece: el manifest de Sports Streams se genera con `hideTip:true`. `TNT Sport 1/2` no tenian fuente en la ultima medicion.
6. MediaFlow Proxy: reduce latencia y evita bloqueos de IP, pero no puede arreglar una fuente que se cae.
7. Sin descargas locales: este stack NO descarga archivos completos.
8. HTTPS con CA interna: funciona en PC, celulares y la mayoria de Android TV, pero algunos
   televisores no permiten instalar CAs de usuario. Para esos casos hace falta un
   certificado publico (Etapa B).
9. La app web (`/jellyfin/web/`) no reproduce HLS en Chrome; para deportes/MKV usar la app
   de escritorio o Android con mpv. La web queda para administrar y explorar.
10. Sin `.secrets/torbox.key`, AIOStreams queda en modo P2P: peliculas/series aparecen en
    Stremio/Nuvio con streams `infoHash` (Torrentio/Comet/MediaFusion), pero AIOStreams Desktop
    no reproduce P2P. Para VOD dentro de Desktop hay que cargar la clave TorBox y ejecutar
    `node scripts/aiostreams-config.mjs prepare`; `status` debe mostrar `vod_mode=debrid`.
11. Deportes: el HLS medido esta **~25-35 s detras del vivo en el origen** (segmentos de 6 s);
    con `live_start_index=-2` el player arranca ~12 s antes del borde. Total tipico **~35-45 s**.
    No es cero delay. Si el origen es un re-stream de TV puede estar mas atrasado y el player no
    lo corrige. Para futbol argentino sin delay hace falta antena/TV abierta; el IPTV de pago
    tambien tiene buffer. El lag se reduce con Ethernet y hardware decode, no se elimina.
12. TV Samsung UN32J4290: Tizen 2.3 no instala AIOStreams/Stremio. Necesita un Android TV
    stick/box por HDMI (comprar solo con autorizacion) o una laptop por HDMI.
13. Link para una persona no tecnica: un link web solo no alcanza porque Chrome no reproduce
    HLS/MKV. En PC se usa un acceso directo `Fubol` a la app de escritorio; en Android/TV, el
    icono de la app con su manifest. Definir el dispositivo antes de armar el acceso.

---

## Checklist de Verificacion (Etapa A)

- [ ] `bash setup.sh` sin errores; `.env` sin `changeme`.
- [ ] `docker compose up -d` deja `aiostreams` y `caddy` en `healthy` (`docker compose ps`).
- [ ] `bash scripts/stage-a-check.sh` sin FAIL.
- [ ] Panel en http://<IP-LAN>:3000: el dashboard pide login; la pagina de configuracion de Stremio (/stremio/configure) puede ser publica segun version: revisala en runtime.
- [ ] https://<IP-LAN> responde con el certificado de la CA instalada en el dispositivo.
- [ ] Peli cacheada: Buscar pelicula popular -> stream "cached" -> reproduccion instantanea.
- [ ] Serie: Abrir una serie -> episodios listados -> reproducir -> subtitulos ES/EN aparecen y sincronizados.
- [ ] Partido en vivo (Via A, perfil sports): MediaFusion -> partido -> reproduccion (puede tener delay).
- [ ] Partido en vivo (Via B): addon IPTV -> canal -> reproduccion estable y baja latencia.
- [ ] Usuario familiar: instalar CA + manifest URL en un dispositivo externo -> funciona sin API key.

---

## Limitaciones de automatizacion (pasos manuales)

- Crear cuenta TorBox y contratar plan: manual (requiere pago).
- Obtener API key de TorBox: manual (dashboard web).
- Crear usuarios en AIOStreams y copiar manifest URLs: manual (dashboard web).
- Instalar la CA interna en cada dispositivo: manual (ver Paso 8).
- Configurar Subtitle Sync en el cliente: manual (UI de Stremio).
- Configurar MediaFusion: manual (https://<IP-LAN>:8443/configure con perfil sports).
- Configurar Prowlarr: manual (http://127.0.0.1:9696 en el servidor -> indexers + auth).
- Contratar IPTV premium (Via B): manual (pago externo).

Todo lo demas (Docker, provisionado) es automatico.

---

## Comandos utiles

```bash
# Estado y salud
docker compose ps
bash scripts/stage-a-check.sh

# Logs
docker compose logs -f aiostreams
docker compose logs -f caddy

# Reiniciar un servicio
docker compose restart aiostreams

# Perfiles opcionales
docker compose --profile sports up -d
docker compose --profile dns up -d

# Actualizar imagenes
docker compose pull && docker compose up -d

# CA interna de Caddy (para instalar en dispositivos)
ls data/caddy/caddy/pki/authorities/local/root.crt

# Backup de datos
tar czf backup-$(date +%F).tar.gz data/ .env
```

## Analisis tecnico detallado

Ver `docs/COMO_FUNCIONAN.md` para un analisis profundo de como funcionan por detras los sitios de streaming deportivo gratuito (Futbol Libre, Pelota Libre, Rojadirecta, Angulismo): arquitectura, captura de senales, ofuscacion, anti-hotlinking, tokens expirables, y por que no pueden garantizar estabilidad.

## Legal

Este stack es para uso personal. MediaFusion y listas M3U redirigen a streams de terceros. El uso es responsabilidad del usuario. MediaFlow Proxy es un proxy de streams, no modifica el contenido.

TorBox es un servicio de debrid de pago. El uso debe cumplir con sus Terminos de Servicio.

AIOStreams, Caddy, Pi-hole, Unbound, MediaFlow Proxy y MediaFusion son software libre.
