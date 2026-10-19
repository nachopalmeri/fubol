# Arquitectura

## Flujo de datos

```
Cliente (Stremio / Nuvio)
        |
        v  manifest URL del servidor (sin API key expuesta)
AIOStreams (self-hosted, :3000)  -->  TorBox (debrid, plan pago)
        |  (API key de TorBox queda en el servidor, cifrada en SQLite)
        |
        v
Streams directos (cached / uncached)  -->  MediaFlow Proxy (:8888)  -->  Reproductor final
        |  (MediaFlow reduce latencia y evita bloqueos de IP)
        +
Subtitle Sync (cliente) --> OpenSubtitles / SubDL / SubSource (ES/EN, sincronizado)
        +
Deportes: MediaFusion (incluido, :8000) con PostgreSQL + Redis + Prowlarr + TRAWL
          o lista M3U IPTV premium (Via B)
        +
Privacidad: Pi-hole (:53) + Unbound (:5335) (DNS recursivo, sin filtracion)
        +
HTTPS: Caddy (:443) para compartir fuera de la LAN
```

## Componentes

1. AIOStreams (ghcr.io/viren070/aiostreams:latest): orquestador, proxy de comparticion y gestion de usuarios. Usa SQLite interno. Configuracion via /stremio/configure. Soporta TorBox como debrid.
2. MediaFlow Proxy (mhdzumair/mediaflow-proxy:latest): proxy de streams. Reduce latencia y evita bloqueos de IP. Configurado en AIOStreams -> Proxy.
3. Caddy (caddy:latest): reverse proxy HTTPS local. Necesario para compartir con familiares fuera de la LAN.
4. Pi-hole (pihole/pihole:latest): bloqueo de anuncios y trackers a nivel DNS.
5. Unbound (mvance/unbound:latest): DNS recursivo, upstream de Pi-hole. Evita filtracion de consultas DNS a terceros.
6. MediaFusion (mhdzumair/mediafusion:6.0.0): deportes en vivo. Requiere PostgreSQL + Redis + Prowlarr + TRAWL. Incluido en el compose.
7. PostgreSQL (postgres:18-alpine): base de datos de MediaFusion.
8. Redis (redis:latest): cache de MediaFusion.
9. Prowlarr (ghcr.io/hotio/prowlarr:latest): gestor de indexers para MediaFusion.
10. TRAWL (ghcr.io/germondai/trawl:latest): bypass Cloudflare para indexers publicos.
11. Subtitle Sync: addon de Stremio (client-side). No es un contenedor. Busca subtitulos ES/EN y sincroniza usando la pista del stream de TorBox.
12. TorBox: servicio externo de debrid. API key configurada en AIOStreams.

## Seguridad

- La API key de TorBox nunca sale del servidor. Los familiares reciben solo un manifest URL con token de usuario.
- Todo el trafico de TorBox sale de una sola IP: la del servidor.
- MediaFlow Proxy enruta streams para evitar bloqueos de IP y reducir latencia.
- Caddy provee HTTPS para acceso remoto.
- Pi-hole + Unbound evitan filtracion DNS.
- Riesgo: compartir cuenta TorBox puede violar TOS. Mitigacion: una sola IP visible.
- Riesgo: MediaFusion (Via A) usa scrapers de terceros que pueden ser inestables o tener problemas legales. Via B (IPTV pago) es mas estable pero depende del proveedor.

## Limitaciones del proxy

MediaFlow Proxy reduce latencia y evita bloqueos de IP, pero NO puede arreglar una fuente que se cae. Si MediaFusion (Via A) deja de funcionar, el proxy no lo resuelve.
'@ | Set-Content docs/ARCHITECTURE.md