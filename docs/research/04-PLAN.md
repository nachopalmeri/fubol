# Plan por fases hasta el objetivo final

## Norte

1. Vivo con la menor latencia y fricción posible, prioridad fútbol argentino.
2. VOD con VOSE y sync.
3. Un link web para la familia, sin instalar.

Restricción permanente: **fuentes que el operador tiene derecho a usar**. Fubol
no distribuye scrapers de señales premium ni listas IPTV sin autorización. La
velocidad se logra con mejor ingeniería, no copiando contenido.

## Fase 0 — Investigación (esta iteración)

- [x] Mapa de repos, licencias verificadas y decisiones de reutilización.
- [x] Comparativa de players, latencia, subtítulos y distribución.
- [x] Límite legal documentado.

## Fase 1 — App web + vivo multi-fuente (esta iteración)

**Entregable:** `web/` (Next.js 16, TS estricto) con:

- Auth por link familiar revocable + admin.
- Motor de fuentes: HLS directo, M3U, Xtream, addon Stremio (vivo).
- Probe en paralelo, ranking por TTFB/edad de borde/calidad/historial, failover.
- Proxy HLS con reescritura de playlists y tokens firmados (anti-SSRF).
- Player hls.js low-latency, gobernador de latencia, "Ir al vivo", PiP,
  recuperación y cambio de fuente sin pantalla rota.
- Fixtures: TheSportsDB + ICS, hora argentina, detección de "en curso",
  matching de canales por equipo.
- UI familiar: Inicio con "Ahora", "Hoy", búsqueda; responsive; PWA.
- Admin: fuentes, addons, links, salud, métricas.
- Tests de parsers/scoring/tokens + CI.
- Docker + Caddy + Cloudflare Tunnel.
- Docs: `docs/FUBOL.md`, `docs/REUTILIZACION.md`.

**Demo:** `npm run dev` en `web/` → `http://localhost:3001/f/DEMO1234`.

## Fase 2 — VOD completo + subtítulos (siguiente)

- Agregación de catálogos/search/meta/stream de addons.
- Ranking de streams y failover VOD.
- Remux HLS bajo demanda con ffmpeg (MKV/AC3 → fMP4/AAC) y progreso.
- Subtítulos: addons + OpenSubtitles/SubDL, SRT/ASS→VTT, ES/EN, forzados.
- Sync: offset persistente, correlación de envolventes, sidecar ffsubsync.
- [x] Tests de integración de manifest + streams contra un addon fixture local
  (sin contenido real).
- Remux HLS bajo demanda con ffmpeg (MKV/AC3 → fMP4/AAC) y progreso sigue pendiente.

## Fase 3 — Calidad de producción

- Métricas por fuente y alertas; panel de latencia histórica.
- Pin de imágenes, backups, migraciones, retención de datos.
- Accesibilidad AA, i18n ES/EN, PWA offline real.
- Pruebas en iPhone/Safari, Android/Chrome, TV por HDMI.
- Hardening: CSP, rate limits distribuidos, auditoría de SSRF.

## Fase 4 — Escala y extras

- WebRTC/WHEP para fuentes propias (MediaMTX) y LL-HLS real.
- Multi-tenant opcional (varios hogares) sin compartir credenciales.
- Recomendaciones, continue-watching, perfiles.
- Guía de despliegue en VPS y túnel nombrado.

## Criterios de aceptación

| Área | Criterio |
|---|---|
| Vivo | Cambio de fuente automático < 10 s; nunca queda pantalla negra sin acción |
| Latencia | Se muestra la latencia estimada; "Ir al vivo" funciona; LL-HLS si el origen lo soporta |
| VOD | Cualquier URL directa reproducible en Chrome/Safari; subtítulos ES/EN |
| Familia | Link `/f/CODE` abre en mobile y desktop sin cuenta; revocación inmediata |
| Calidad | `typecheck`, `lint`, `test`, `build` en verde; CI en `main` |
| Legal | Sin scrapers de contenido premium; licencias citadas en `docs/REUTILIZACION.md` |
