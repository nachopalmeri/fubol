# Medición de delay en HLS — método, resultados y límites

Fecha: 2026-11-01. Mediciones tomadas contra partidos reales en curso (La Liga,
Serie A, Ligue 1, Bundesliga) a través del propio proxy de la app, más la ruta
argentina vía relay local.

Este documento registra **cómo se mide el delay y por qué el número que el HLS
auto-reporta no es el delay que le importa a quien mira el partido**. Es el
aporte técnico central del proyecto y también su límite más honesto.

## 1. Las tres cantidades distintas

La app antes mostraba dos números sin nombrarlos y ninguno era el que el
espectador quiere saber. Ahora se miden y se etiquetan por separado:

| Cantidad | Qué es | Dónde se mide |
| --- | --- | --- |
| `origen` | Cuánto atrás del reloj está el borde del playlist del origen | `parseHlsPlaylist` sobre `EXT-X-PROGRAM-DATE-TIME` |
| `buffer` | Cuánto atrás del borde se planta el reproductor | `hls.latency` en el navegador |
| `total` | La suma, o `hls.playingDate` cuando el PDT es confiable | `Player.tsx` |

El delay que la familia experimenta es `total`. Con segmentos de 6 s y
`liveSyncDuration` de 15 s, `buffer` solo ya aporta ~15 s.

## 2. Resultado: el PDT de una re-transmisión no es confiable

Medición de las cuatro fuentes de **un mismo partido** (Lazio vs Cagliari),
tomadas en el mismo segundo:

| fuente | `edgeAgeS` que mostraba la app | PDT real vs reloj local |
| --- | --- | --- |
| 0 | **0 s** (y ganaba el ranking) | −47.9 s |
| 1 | 17.9 s | −65.2 s |
| 2 | 18.8 s | −65.5 s |
| 3 | 34.5 s | −81.2 s |

**Hay 33 s de diferencia entre los relojes de cuatro fuentes del mismo evento.**
Es físicamente imposible que las cuatro estén bien. El PDT lo re-estampa el
re-transmisor al republicar, no el broadcaster original. Por lo tanto:

- `edgeAgeS` **no** mide "cuánto atrás del estadio estoy".
- Mide "cuánto atrás del republicado del re-transmisor estoy".
- Los valores de distintas fuentes **no son comparables entre sí**.

La fuente 0 reportaba 0 s porque `Math.max(0, ...)` convertía un reloj
adelantado en "delay cero", y el ranking la elegía por eso.

## 3. Niveles de confianza implementados

`parseHlsPlaylist` clasifica cada lectura (`src/lib/live/playlist.ts`):

| Nivel | Condición | Se muestra |
| --- | --- | --- |
| `measured` | PDT sobre el segmento más nuevo (o cerca) | sí |
| `extrapolated` | Un solo PDT arriba de la ventana; el borde se deriva sumando todas las duraciones | sí, marcado "estimado" |
| `implausible` | La cuenta da < 0.5 s: el frame más nuevo sería del presente o del futuro | **no**, se dice que el reloj es imposible |
| `none` | Sin PDT | **no**, se dice que el origen no informa |

En producción las fuentes reales caen en `extrapolated` (un solo PDT por
ventana) y los canales argentinos en `none`.

## 4. Medición segundo a segundo (Getafe vs Sevilla, La Liga)

```
canal: Getafe vs Sevilla   |  12 muestras cada 5 s
t+  0s  seq=1367 ventana=48.0s target=6s  delay_borde=20.3s
t+ 15s  seq=1370 ventana=48.0s target=6s  delay_borde=18.4s
t+ 35s  seq=1374 ventana=48.0s target=6s  delay_borde=15.8s
t+ 40s  seq=1374 ventana=48.0s target=6s  delay_borde=21.2s   <- llegó segmento
t+ 55s  seq=1377 ventana=48.0s target=6s  delay_borde=19.2s

min 15.8 s | max 21.2 s | medio 18.8 s | deriva -1.1 s en 55 s
avance: 10 segmentos en 55 s de reloj (estable, sin pérdida)
```

El diente de sierra de 6 s es el largo de segmento. La señal es estable.
El delay total al vidrio es ~18.8 s + ~15 s de buffer ≈ **34 s**, y ninguno de
esos 18.8 s es verificable contra el estadio por lo dicho en la sección 2.

## 5. La ruta argentina sigue sin delay medible

Los canales argentinos (`ESPN Premium`, `DeporTV`, `Fox Sports`) no publican
PDT: 54 chequeos en `source_checks`, todos con `edge_age_s` nulo. Pasan por el
relay local de ffmpeg, que antes tampoco emitía PDT.

Se agregó `-hls_flags +program_date_time` al relay. **No resolvió el problema**,
y vale registrarlo:

```
Ruta argentina vía relay local, 8 muestras cada 5 s
t+  0s  seq=44  segs=20  ventana=20.0s  delay_salida_relay=-0.8s
t+ 15s  seq=62  segs=20  ventana=20.0s  delay_salida_relay=-3.2s
t+ 35s  seq=80  segs=20  ventana=20.0s  delay_salida_relay=-0.4s
```

El PDT sale **adelantado** al reloj (−0.4 a −3.2 s) porque ffmpeg lo deriva de
la línea de tiempo del input, y este origen entrega su ventana en ráfagas (los
números de segmento avanzan ~1.2x el tiempo real). No es una lectura de reloj
de pared.

El clasificador de la sección 3 lo marca `implausible` y el reproductor se
niega a mostrarlo, así que el comportamiento es correcto: **la ruta argentina
informa "el origen no informa su delay" en vez de inventar un número.** Pero el
delay real de esa ruta sigue sin medirse.

Hacerlo truthful exigiría `-use_wallclock_as_timestamps 1` en el input, que
sobre un HLS en ráfagas comprime la ráfaga a tiempo real y rompe el pacing de
audio y video. Es un intercambio peor que no tener el número.

## 6. Lo único que mediría el delay real

Todo lo anterior es auto-reportado por el origen. Para el delay verdadero
contra el estadio hace falta una referencia externa:

1. **OCR del reloj del partido** sobre un frame del video, contra la hora real.
2. **Timestamp de un gol** de una API de resultados, contra el momento en que el
   gol aparece en pantalla.
3. **Diferencial entre dos fuentes independientes** del mismo partido: no da el
   absoluto, pero sí cuál va más adelante y por cuánto.

Ninguna está implementada. Es el siguiente paso natural del proyecto y el que
cerraría la pregunta del título.

## 7. Qué cambió en el ranking

El scoring viejo (`rank.ts`) daba hasta +18 por 1080p y como máximo −25 por
delay (recién a los 100 s), y solo −6 por delay desconocido. Cuentas con datos
reales:

| fuente | delay | score viejo | score nuevo |
| --- | --- | --- | --- |
| A: desconocido, 1080p, ttfb 232 ms | ? | **70 (ganaba)** | 48 |
| B: medido 25 s, 1080p, ttfb 384 ms | 25 s | 67 | 43 |
| C: medido 10 s, 720p, ttfb 400 ms | 10 s | 65 | **57 (gana)** |

El scoring viejo **premiaba la ignorancia**: una fuente que no informaba nada le
ganaba a una que admitía 25 s. Ahora el delay desconocido se puntúa con un
prior neutro (`ASSUMED_EDGE_AGE_S = 20 s`) más una penalidad chica por no
informar, así que una fuente medida mejor que lo típico gana y una medida peor
pierde. La resolución ya no puede comprar su paso por un borde lento.

Cobertura: `tests/delay-trust.test.ts` (10 casos) fija los cuatro niveles de
confianza, el caso del reloj adelantado del relay y las cinco propiedades del
ranking.
