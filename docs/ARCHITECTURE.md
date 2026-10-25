# Arquitectura

## Flujo de datos (Etapa A)

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
Deportes (perfil "sports"): MediaFusion (:8443 via Caddy) con PostgreSQL + Redis + Prowlarr + TRAWL
          o lista M3U IPTV premium (Via B)
        +
Privacidad (perfil "dns"): Pi-hole (:53) + Unbound (upstream; reenvia a Cloudflare)
        +
HTTPS: Caddy (:443 panel/manifests, :8443 MediaFusion) con CA interna
```

## Componentes

1. AIOStreams (ghcr.io/viren070/aiostreams:latest): orquestador, proxy de comparticion y gestion de usuarios (nucleo). Usa SQLite interno. Manifest por usuario: `/stremio/<uuid>/<password>/manifest.json`. Soporta TorBox como debrid.
2. Caddy (caddy:latest): HTTPS en la LAN con CA interna (nucleo). Sitios: `https://SERVER_HOST` (AIOStreams) y `https://SERVER_HOST:8443` (MediaFusion, perfil sports).
3. Pi-hole (pihole/pihole:latest): bloqueo de anuncios y trackers a nivel DNS (perfil `dns`).
4. Unbound (mvance/unbound:latest): resolver upstream de Pi-hole via `unbound#53` (red interna de Docker). Reenvia a Cloudflare por defecto; para recursion pura ver `config/unbound/forward-records.conf` (perfil `dns`).
5. MediaFusion (mhdzumair/mediafusion:6.0.0): deportes en vivo (perfil `sports`). Requiere PostgreSQL + Redis + Prowlarr + TRAWL.
6. PostgreSQL (postgres:18-alpine): base de datos de MediaFusion (perfil `sports`).
7. Redis (redis:latest): cache de MediaFusion/MediaFlow (perfil `sports`).
8. Prowlarr (ghcr.io/hotio/prowlarr:latest): gestor de indexers (perfil `sports`, escucha solo en 127.0.0.1).
9. TRAWL (ghcr.io/germondai/trawl:latest): bypass Cloudflare para indexers publicos (perfil `sports`).
10. MediaFlow Proxy (mhdzumair/mediaflow-proxy:latest): proxy de streams (perfil `sports`, escucha solo en 127.0.0.1 en Etapa A).
11. Subtitle Sync: addon de Stremio (client-side). No es un contenedor.
12. TorBox: servicio externo de debrid. API key configurada en AIOStreams. Sin clave, AIOStreams
    queda en modo P2P: devuelve `infoHash` (Torrentio/Comet/MediaFusion) para Stremio/Nuvio; no
    hay URLs directas para AIOStreams Desktop.

## Red y puertos (Etapa A)

- La VM usa red bridged: toma una IP del router y es alcanzable por la TV y demas dispositivos.
- `SERVER_HOST` (en `.env`) es la unica fuente de las URLs publicas: BASE_URL de AIOStreams y HOST_URL de MediaFusion se derivan de ahi.
- Publicados en la LAN: 3000 (panel, con login), 80/443/8443 (Caddy). Con perfil dns: 53 y 8053.
- Solo locales: Prowlarr (9696), MediaFlow (8888), Unbound (5335). Postgres/Redis/TRAWL no se publican.

## Seguridad

- La API key de TorBox nunca sale del servidor. Los familiares reciben solo un manifest URL con uuid+password de su usuario.
- La API key de TorBox vive en el servidor; los streams los sirve TorBox directo a cada dispositivo (TorBox permite multi-IP).
- El panel de AIOStreams exige login (AIOSTREAMS_AUTH) incluso en la LAN.
- `setup.sh` genera todos los secretos; no hay valores por defecto.
- Caddy provee HTTPS en la LAN con CA interna (instalable en los dispositivos).
- Riesgo: abuso de ancho de banda (descargas excesivas). TorBox permite compartir cuenta/API key; mitigacion: uso razonable y no publicar la key.
- Riesgo: MediaFusion (Via A) usa scrapers de terceros que pueden ser inestables o tener problemas legales. Via B (IPTV pago) es mas estable pero depende del proveedor.

## Limitaciones del proxy

MediaFlow Proxy reduce latencia y evita bloqueos de IP, pero NO puede arreglar una fuente que se cae. Si MediaFusion (Via A) deja de funcionar, el proxy no lo resuelve.
