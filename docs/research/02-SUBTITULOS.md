# Subtítulos VOSE y sincronización

## Proveedores

| Proveedor | Acceso | Costo | Cobertura ES | Nota |
|---|---|---|---|---|
| Addons de subtítulos Stremio (OpenSubtitles v3, SubSource, SubDL, Community) | HTTP JSON, sin key | Gratis | Alta | Se consumen si el operador los agrega; no se copia su código |
| OpenSubtitles REST | API key + User-Agent | Free tier limitado | Muy alta | `OPENSUBTITLES_API_KEY`; descarga con cuota |
| SubDL | API key | Free tier | Alta | `SUBDL_API_KEY` |
| Archivos propios | Upload | — | — | `.srt`, `.vtt`, `.ass` |

No se scrapean sitios de subtítulos con captcha ni se evaden cuotas.

## Formato y entrega

- Se normaliza todo a **WebVTT** porque es el único formato de `<track>` en
  navegadores.
- Conversión SRT→VTT: cabecera, `,`→`.` en timestamps, limpieza de índices.
- Conversión ASS→VTT: se descartan estilos; se conservan tiempos, texto,
  `{\anX}` → alineación básica, `\N` → salto de línea.
- Detección de charset: BOM UTF-8/UTF-16, luego intento UTF-8 estricto y fallback
  Windows-1252 (subtítulos viejos en español).
- Se sirve por un proxy firmado para evitar CORS y poder cachear. Los archivos se
  guardan en `data/subtitles` con hash de URL + offset aplicado.

## VOSE por defecto

1. Idioma preferido: español; fallback inglés.
2. Se eligen pistas cuya release coincida con el stream (mismo grupo/qualifier)
   y se prioriza `forced` solo si el usuario lo pide.
3. El audio original no se toca; "VOSE" = audio original + subtítulo ES.
4. Selector ES/EN/sin subtítulos siempre visible en el player.
5. El offset se guarda por `tipo:id:idioma` en `localStorage` y se reaplica.

## Sincronización

### 1. Offset manual
±0.1 s, ±1 s, ±5 s, reset. Atajos `[` y `]`. Persistente.

### 2. Sync por referencia (implementación propia)
Dos subtítulos del mismo título suelen compartir la misma estructura de tiempos
aunque estén en idiomas distintos. Se construye una señal binaria de "hay
diálogo" cada 100 ms para cada pista y se busca el desfase que maximiza la
correlación cruzada normalizada en un rango de ±120 s.

- Complejidad O(n·lags) con lags discretizados a 100 ms; para 2 h son ~72k
  muestras × 2400 lags → demasiado. Se optimiza con sumas prefijas y búsqueda
  gruesa (1 s) + refinamiento fino (100 ms) alrededor del máximo.
- Devuelve `offset`, `confidence` (0–1) y `overlap`.
- Si la confianza < 0.35 no se aplica automáticamente.

### 3. Sync por audio (opcional, ffsubsync)
Sidecar Python con ffmpeg + [ffsubsync](https://github.com/smacke/ffsubsync)
(MIT). Extrae 10–20 min de audio del stream, detecta voz y alinea la pista.
Se activa con `SUBSYNC_URL`. Si no está disponible, la UI lo explica y ofrece
offset manual/referencia. No se usa para contenido sin derechos.

### 4. Subtítulos forzados
Se detecta `forced` en el título/nombre del archivo o en flags del addon. Se
activan automáticamente solo cuando el usuario elige "Forzados" o cuando el
audio no coincide con el idioma de la pista.

## Riesgos

- Un subtítulo descargado puede tener otra edición (extendida/cine): el sync por
  referencia no corrige cambios de escenas, solo offset constante.
- El sync por audio consume CPU y ancho de banda del servidor; límites por
  usuario y timeout de 180 s.
- La cuota de OpenSubtitles es del operador; se cachea y se limita.
