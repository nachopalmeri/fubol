# Players y reducción de latencia

## Comparativa

| Player | Licencia | HLS | LL-HLS | DASH | Peso | Veredicto |
|---|---|---|---|---|---|---|
| **hls.js 1.7** | Apache-2.0 | Sí (MSE) | Sí (PART/HOLD-BACK) | No | ~450 KB min | **Elegido**: control fino de latencia, recuperación y ABR |
| Shaka 4.x | Apache-2.0 | Sí | Parcial | Sí | ~700 KB | Alternativa si se agrega DASH/DRM |
| Video.js 10 | Apache-2.0 | Vía VHS | Parcial | Plugin | ~1 MB+ | UI pesada; no aporta al objetivo |
| Plyr | MIT (deprecado) | No | No | No | ~120 KB | Solo skin; su repo recomienda migrar |
| Nativo (Safari) | — | Sí | Sí | No | 0 | Fallback iOS; sin métricas ni failover propio |

**Decisión:** hls.js como motor, `<video>` nativo en Safari/iOS, una capa propia
de UI y failover. Sin framework de player adicional.

## Presupuesto de latencia

La latencia total es:

```
latencia = edad_del_borde_en_origen + buffering_del_player + red
```

Medición real del stack anterior (Sky Sports, segmentos 6 s): el playlist ya
estaba 25–35 s detrás del vivo; el player sumaba ~12 s. Total 35–45 s. **Ningún
player elimina el delay del origen.** Lo que sí se puede hacer:

1. Arrancar en el borde, no en el inicio del DVR.
2. Buffer mínimo seguro (2–3 segmentos) y acelerar suavemente si se atrasa.
3. LL-HLS cuando el origen lo soporta (partes de 0.5–2 s).
4. Failover a una fuente con menor edad de borde, no solo con menos TTFB.
5. Medir y mostrar la latencia real; no prometer cero.

## Configuración hls.js (v1.7)

```ts
{
  lowLatencyMode: true,
  liveSyncDurationCount: 1,
  liveMaxLatencyDurationCount: 4,
  maxLiveSyncPlaybackRate: 1.5,
  backBufferLength: 0,
  maxBufferLength: 6,
  maxMaxBufferLength: 10,
  startFragPrefetch: true,
  testBandwidth: false,
  enableWorker: true,
  abrEwmaDefaultEstimate: 3_000_000,
  fragLoadingMaxRetry: 4,
  manifestLoadingMaxRetry: 3,
  levelLoadingMaxRetry: 4
}
```

Gobernador propio cada 2 s:

- `latency = liveEdge - currentTime`
- Si `latency > target + 6 s` → `seek(liveEdge - target)` (salto visible "Ir al vivo").
- Si `latency > target + 1.5 s` → `playbackRate = 1.08` hasta converger.
- Si `latency < 1 s` → `playbackRate = 0.97` para evitar stall.
- Al volver de background (`visibilitychange`) → re-chequear y saltar al borde.

## Detección de caídas y failover

Estados: `idle → probing → playing → degraded → switching → playing | exhausted`.

- **Probe**: GET de los primeros bytes + parseo del manifest; TTFB, target
  duration, `EXT-X-PROGRAM-DATE-TIME`, `ENDLIST`, códec, bitrate.
- **Health score**: `100 − ttfb_penalty − edge_age_penalty + quality_bonus −
  historial_de_fallas`. Se elige la mejor y se mantienen 2–3 de respaldo.
- **Runtime**: `hls.js` emite `ERROR`; los fatales de red se reintentan con
  backoff (0.5/1/2/4 s). Tras 2 fatales del mismo nivel o watchdog de 8 s sin
  `timeupdate`, se cambia de fuente conservando el borde vivo.
- **Switch transparente**: se muestra "Cambiando de fuente" y se reanuda; nunca
  pantalla negra definitiva. Si se agotan las fuentes, se ofrece reintentar.

## Normalización de entradas

| Entrada | Tratamiento |
|---|---|
| HLS `.m3u8` | hls.js; playlist proxied y reescrita |
| MPEG-TS | Se intenta HLS; si no, se rechaza con mensaje (el navegador no lo reproduce) |
| MP4 progresivo | `<video>` directo o remux |
| WebRTC | Fuera de alcance v1 (se puede sumar MediaMTX WHEP) |
| MKV/HEVC VOD | Remux HLS del lado servidor con ffmpeg (`-c copy` + audio AAC) |

## Remux bajo demanda (VOD)

El navegador no reproduce MKV/AC3/DTS. El backend ejecuta ffmpeg como proceso
externo:

```
ffmpeg -i <url> -c:v copy -c:a aac -ac 2 -b:a 192k \
  -f hls -hls_time 6 -hls_playlist_type vod \
  -hls_segment_type fmp4 -hls_flags independent_segments \
  -hls_segment_filename seg%05d.m4s index.m3u8
```

- Progreso con `-progress pipe:1`; se guarda en SQLite.
- La reproducción empieza cuando existe el primer segmento.
- Limpieza LRU a las 24 h o por límite de disco.
- Si el video es HEVC/AV1 y el cliente no lo soporta, se ofrece transcodificar a
  H.264 (más CPU, opt-in).
- ffmpeg se invoca como binario; su licencia no contamina el código.

## Presupuesto de red del proxy

- Playlists: `no-store`, timeout 6 s, reintento 1.
- Segmentos: passthrough con `Range`, keep-alive, cache corto (2 s) y
  `Content-Length` cuando existe.
- El proxy no agrega un hop extra si la fuente permite CORS; el modo directo es
  preferido y el proxy es fallback firmado.
