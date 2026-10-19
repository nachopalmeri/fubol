# Centro de Streaming Privado - Stremio/Nuvio + TorBox + AIOStreams

Stack self-hosted, on-demand, sin descargas locales masivas, sin anuncios. Cubre peliculas, series, deportes en vivo y subtitulos VOSE (ES/EN) sincronizados. Para ti y 2-3 familiares.

## Arquitectura

```
Cliente (Stremio / Nuvio)
        |
        v  manifest URL del servidor (sin API key expuesta)
AIOStreams (self-hosted, :3000)  -->  TorBox (debrid, plan pago)
        |  (API key de TorBox queda en el servidor, cifrada en SQLite)
        |
        v
Streams directos (cached / uncached)  -->  Reproductor final
        +
Subtitle Sync (cliente) --> OpenSubtitles / SubDL / SubSource (ES/EN, sincronizado)
        +
Deportes: MediaFusion (incluido) o lista M3U IPTV premium (Via B)
        +
Proxy de streams: MediaFlow Proxy (:8888) para reducir latencia y evitar bloqueos de IP
        +
Privacidad: Pi-hole + Unbound (DNS recursivo)
        +
HTTPS: Caddy (:443) para compartir fuera de la LAN
```

Principios:
- NUNCA se descarga el archivo completo en el servidor local. TorBox streamea directo.
- La API key de TorBox queda en el servidor (AIOStreams). Los familiares solo reciben un manifest URL.
- Todo el trafico de TorBox sale de una sola IP: la tuya.

## Componentes usados (solo reales y verificables)

| Componente | Imagen / Fuente | Rol |
|---|---|---|
| AIOStreams | ghcr.io/viren070/aiostreams:latest | Orquestador + proxy de comparticion + gestion de usuarios |
| MediaFlow Proxy | mhdzumair/mediaflow-proxy:latest | Proxy de streams (reduce latencia, evita bloqueos de IP) |
| Caddy | caddy:latest | Reverse proxy HTTPS |
| Pi-hole | pihole/pihole:latest | Bloqueo de anuncios a nivel DNS |
| Unbound | mvance/unbound:latest | DNS recursivo |
| MediaFusion | mhdzumair/mediafusion:6.1.6 | Deportes en vivo (incluido, requiere PostgreSQL + Redis + Prowlarr + TRAWL) |
| PostgreSQL | postgres:18-alpine | Base de datos de MediaFusion |
| Redis | redis:latest | Cache de MediaFusion |
| Prowlarr | ghcr.io/hotio/prowlarr:latest | Gestor de indexers para MediaFusion |
| TRAWL | ghcr.io/germondai/trawl:latest | Bypass Cloudflare para indexers publicos |
| Subtitle Sync | addon de Stremio (cliente) | Subtitulos VOSE ES/EN sincronizados |
| TorBox | servicio externo (API key) | Motor de debrid |

No incluido (por diseño): Sonarr, Radarr, Lidarr, qBittorrent, Jellyfin, ni scrapers inventados.

## Inicio rapido

### Opcion A: VM con Vagrant

Requisitos en el host: VirtualBox + Vagrant.

```bash
cd vm
vagrant up          # crea la VM Ubuntu, instala Docker, levanta el stack (5-10 min)
```

Al terminar:

| Servicio | URL |
|---|---|
| AIOStreams (dashboard) | http://192.168.56.10:3000 |
| MediaFusion (deportes) | http://192.168.56.10:8000 |
| Prowlarr | http://192.168.56.10:9696 |
| MediaFlow Proxy | http://192.168.56.10:8888 |
| Pi-hole | http://192.168.56.10:8053/admin |
| Caddy (HTTPS) | https://192.168.56.10 |

### Opcion B: Sin VM (Docker en el host)

```bash
bash setup.sh          # genera .env con secretos, crea directorios, valida
# editar .env: BASE_URL con tu IP/dominio
docker compose up -d   # levanta todo
```

---

## GUÍA PASO A PASO

### Paso 1 - Obtener la API key de TorBox (MANUAL)

1. Crear cuenta en https://torbox.app y contratar un plan.
   - Essential: 3 descargas concurrentes (suficiente para 1-2 personas).
   - Pro: hasta 10 streams concurrentes (recomendado para 3+ familiares).
2. Ir a https://torbox.app/settings -> copiar la API Key.
3. Anotarla: la usarás en el Paso 3. No la compartas con nadie.

TorBox solo ve la IP del servidor (la tuya). Los familiares nunca la conocen.

### Paso 2 - Levantar el stack

```bash
vagrant up   # o: docker compose up -d
```

### Paso 3 - Configurar AIOStreams con TorBox

1. Abrir http://192.168.56.10:3000 (o http://localhost:3000).
2. Crear el primer usuario (admin): username + password fuerte. Guardar el UUID y password (no se pueden recuperar).
3. Ir a Services -> agregar TorBox -> pegar la API key del Paso 1.
4. Ir a Addons -> Marketplace -> instalar los addons que quieras (Torrentio, Comet, MediaFusion, etc.). AIOStreams les inyecta la credencial de TorBox automáticamente.
5. Configurar filtros (resolución, idioma, cached/uncached) según preferencia.
6. Ir a Save & Install -> "Create user" / "Update user".
7. Copiar el manifest URL que aparece (termina en /manifest.json).

AIOStreams guarda las credenciales cifradas en SQLite (./data/aiostreams). No se exponen en el manifest URL.

### Paso 3b - Configurar MediaFlow Proxy (reduccion de latencia)

MediaFlow Proxy (mhdzumair/mediaflow-proxy) es un proxy de streams que reduce la latencia y evita bloqueos de IP al enrutar los streams a traves de tu servidor.

1. Acceder a http://<IP>:8888/docs (documentacion interactiva).
2. En AIOStreams -> Proxy -> seleccionar "MediaFlow Proxy" -> ingresar URL: http://mediaflow-proxy:8888 y API password (del .env: MEDIAFLOW_API_PASSWORD).
3. AIOStreams enrutará los streams a través del proxy automáticamente.

MediaFlow Proxy no puede arreglar una fuente que se cae. Solo reduce latencia y evita restricciones de IP.

### Paso 4 - Compartir con familiares (manifest URL)

AIOStreams v2 incluye gestión de usuarios. Para cada familiar:

1. En el dashboard de AIOStreams, crear un nuevo usuario (o reutilizar una configuración exportada).
2. Copiar su manifest URL único: http://<IP>:3000/stremio/<TOKEN>/manifest.json
3. Enviárselo. El familiar no necesita API key ni configuración técnica.

Instrucciones para el familiar (copiar y enviar):

1. Instalá Stremio (https://www.stremio.com) o Nuvio (https://nuvio.tv) en tu dispositivo.
2. Abrí la app -> Addons -> "Install via URL".
3. Pegá este enlace: http://<IP-SERVIDOR>:3000/stremio/<TOKEN>/manifest.json
4. Listo. Ya podés ver películas y series. Los subtítulos se configuran aparte (Paso 5).

Si el servidor está fuera de la LAN, usar HTTPS (Caddy) o Cloudflare Tunnel. Stremio acepta HTTP solo en localhost.

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

Aviso importante: PelotaLibre fue bloqueado/descontinuado en 2026. No existe un scraper estable self-hosted para PelotaLibre.

#### Via A - Gratuita (MediaFusion, NO garantiza cero caidas)
- MediaFusion ya esta integrado en el docker-compose.yml (PostgreSQL + Redis + Prowlarr + TRAWL).
- Acceso: http://<IP>:8000 (dashboard) y http://<IP>:8000/manifest.json (addon para Stremio).
- Configurar en: http://<IP>:8000/configure -> activar deportes.
- Fuentes: DaddyLiveHD y otros. DaddyLiveHD fue bloqueado en agosto de 2026. El scraping puede seguir funcionando parcialmente pero es inestable: puede caerse en eventos masivos, tener delay de 30-60s, y depender de CDNs que cambian. MediaFusion tiene circuit breakers y fallback, pero no puede garantizar "cero caidas".
- Prowlarr: http://<IP>:9696 para gestionar indexers.

#### Via B - Paga (recomendada para maxima fiabilidad y baja latencia)
- Contratar una suscripcion IPTV premium (proveedores que ofrezcan Xtream Codes o lista M3U).
- Integrar la lista M3U en Stremio usando un addon generico de M3U (buscar "IPTV" en stremio-addons.net).
- O integrar Xtream Codes en AIOStreams (si soporta el addon de Xtream).
- Esta es la unica via que puede garantizar "cero caidas" y baja latencia, porque usa servidores dedicados con SLA.

#### Comparacion honesta

| Criterio | Via A (MediaFusion) | Via B (IPTV pago) |
|---|---|---|
| Costo | Gratis | Suscripcion mensual |
| Fiabilidad | Media-baja (scrapers de terceros) | Alta (servidores dedicados) |
| Latencia | 30-90s de delay tipico | 5-15s de delay tipico |
| Eventos masivos | Puede caerse | Estable |
| Legalidad | Zona gris (scraping de terceros) | Depende del proveedor y jurisdiccion |
| Mantenimiento | Requiere ajustes cuando cambian las fuentes | Minimo |

### Paso 7 - Privacidad (sin filtracion de datos)

1. Configurar el DNS de los dispositivos de la LAN a la IP del servidor (Pi-hole).
2. Pi-hole -> Settings -> DNS -> Upstream: unbound#5335 (DNS recursivo, sin filtracion a Google/Cloudflare).
3. Agregar blocklists en Pi-hole (ver privacy/README.md).
4. Activar uBlock Origin en el navegador.

### Paso 8 - HTTPS para compartir fuera de la LAN

Stremio acepta HTTP solo en localhost. Para que familiares fuera de casa accedan:

1. Configurar Caddy con un dominio (editar config/Caddyfile).
2. O usar Cloudflare Tunnel (descomentar cloudflared en docker-compose y poner TUNNEL_TOKEN).
3. Actualizar BASE_URL en .env.

---

## Limitaciones Reales

1. TorBox cache: Si un stream no esta cacheado, la reproduccion tarda (TorBox lo descarga primero). AIOStreams filtra por cached/uncached.
2. Streams concurrentes: TorBox limita streams simultaneos segun el plan. Plan Pro recomendado para 3+ personas.
3. Riesgo de compartir cuenta: TorBox puede suspender la cuenta si detecta uso compartido masivo. Mitigacion: una sola IP visible (proxy en el servidor), no pasar la API key a nadie.
4. Subtitle Sync: depende de que el stream este reproduciendose; puede fallar con streams uncached o codecs raros.
5. Deportes en vivo: dependen de scrapers de terceros (MediaFusion) o listas M3U; pueden caerse. No hay garantia de estabilidad con la Via A. Solo la Via B (IPTV pago) puede garantizar cero caidas.
6. MediaFlow Proxy: reduce latencia y evita bloqueos de IP, pero no puede arreglar una fuente que se cae.
7. Sin descargas locales: este stack NO descarga archivos completos.
8. HTTPS: necesario para acceso remoto.

---

## Checklist de Verificacion

- [ ] Peli cacheada: Buscar pelicula popular -> stream "cached" -> reproduccion instantanea.
- [ ] Peli no cacheada: Buscar pelicula nueva -> stream "uncached" -> TorBox la procesa -> reproduccion inicia.
- [ ] Serie: Abrir una serie -> episodios listados -> reproducir -> subtitulos ES/EN aparecen y sincronizados.
- [ ] Subtitulos VOSE: Activar Subtitle Sync -> verificar que el offset se ajusta automaticamente.
- [ ] Partido en vivo (Via A): Abrir MediaFusion -> seleccionar un partido -> reproduccion (puede tener delay).
- [ ] Partido en vivo (Via B): Abrir addon IPTV -> seleccionar canal -> reproduccion estable y baja latencia.
- [ ] MediaFlow Proxy: Verificar que los streams se enrutan a traves del proxy (logs de mediaflow-proxy).
- [ ] Pi-hole: Verificar que el DNS de los dispositivos apunta al servidor y que los anuncios estan bloqueados.
- [ ] Usuario familiar: Instalar manifest URL en un dispositivo externo -> debe funcionar sin API key.

---

## Limitaciones de automatizacion (pasos manuales)

- Crear cuenta TorBox y contratar plan: manual (requiere pago).
- Obtener API key de TorBox: manual (dashboard web).
- Crear usuarios en AIOStreams y copiar manifest URLs: manual (dashboard web).
- Configurar Subtitle Sync en el cliente: manual (UI de Stremio).
- Configurar MediaFusion: manual (http://<IP>:8000/configure -> activar deportes).
- Configurar Prowlarr: manual (http://<IP>:9696 -> agregar indexers).
- Conectar Pi-hole a Unbound: manual (dashboard Pi-hole).
- Configurar HTTPS/Caddy o Cloudflare Tunnel: manual.
- Contratar IPTV premium (Via B): manual (pago externo).

Todo lo demas (Docker, provisionado) es automatico.

---

## Comandos utiles

```bash
# Ver logs
docker compose logs -f aiostreams

# Reiniciar un servicio
docker compose restart mediaflow-proxy

# Actualizar imagenes
docker compose pull && docker compose up -d

# Backup de datos
tar czf backup-$(date +%F).tar.gz data/
```

## Analisis tecnico detallado

Ver `docs/COMO_FUNCIONAN.md` para un analisis profundo de como funcionan por detras los sitios de streaming deportivo gratuito (Futbol Libre, Pelota Libre, Rojadirecta, Angulismo): arquitectura, captura de senales, ofuscacion, anti-hotlinking, tokens expirables, y por que no pueden garantizar estabilidad.

## Legal

Este stack es para uso personal. MediaFusion y listas M3U redirigen a streams de terceros. El uso es responsabilidad del usuario. MediaFlow Proxy es un proxy de streams, no modifica el contenido.

TorBox es un servicio de debrid de pago. El uso debe cumplir con sus Terminos de Servicio.

AIOStreams, Caddy, Pi-hole, Unbound, MediaFlow Proxy y MediaFusion son software libre.