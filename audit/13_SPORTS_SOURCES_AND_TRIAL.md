# Fuentes deportivas y prueba de TorBox

Revisado: 2026-10-24. Objetivo del usuario: fútbol argentino o Premier League con relato en
español/argentino (idealmente Bambino Pons), sin comprar antes de probar Fubol.

## Lo que sí está verificado

- El catálogo `sports_live` del addon actual contiene canales internacionales: Sky/TNT UK, Fox
  US/Australia y TSN Canadá. No apareció TyC/ESPN Argentina/ESPN Premium en esa fuente.
- Las búsquedas de `Argentina`, `TyC Sports`, `ESPN Argentina`, `ESPN Premium`, `TNT Sports` y
  `Premier League` en ese catálogo devolvieron 0 resultados. Un stream de Sky Sports Premier League
  se reprodujo en el PC, pero es un feed internacional: no se debe describir como relato de
  Bambino.
- El catálogo de fútbol detecta River–Racing e Independiente–Boca, pero la comprobación del 24/10
  devolvió cero fuentes para ambos. `scripts/check-argentine-football.mjs` filtra por clubes
  argentinos y evita falsos positivos como Racing de Santander.
- La lista pública `iptv-org/countries/ar.m3u` incluye una entrada llamada TyC Sports que respondió
  HTTP 200 con MIME HLS. Eso solo verifica que respondió una playlist: no demuestra derechos,
  reproducción sostenida, audio español ni relato de Bambino. No está integrada en Fubol.

## Fuentes oficiales y límites

- **Primera División argentina:** TNT Sports publicó la extensión de sus derechos con AFA hasta
  2031 (<https://tntsports.com.ar/>). La programación 2026 de ESPN Argentina identifica ESPN
  Premium/TNT Sports para la Liga Profesional; TV Pública no figura como señal de la Primera
  División (<https://www.espn.com.ar/>). En casa no hay cable, por lo que el acceso legal online
  requiere el servicio oficial correspondiente. La antena sirve únicamente cuando un partido se
  transmite en abierto.
- **Premier League y Bambino Pons:** la agenda oficial de ESPN Argentina incluye partidos de
  Premier League en ESPN/Disney+ Plan Premium; publicaciones de ESPN identifican a Bambino Pons en
  partidos seleccionados. No implica que relate todos los partidos. Agenda: <https://www.espn.com.ar/television/>.
- **LPF Play:** la plataforma oficial <https://www.lpfplay.com/> publica su agenda de eventos AFA.
  El anuncio oficial de AFA lista Primera Nacional, Primera B/C, Proyección, fútbol femenino y
  futsal; revisar la agenda concreta y no asumir que incluye la Primera División masculina.
- **Acceso preparado:** se crearon accesos directos `LPF Play - AFA` en Escritorio y Start Menu, y
  un enlace a LPF Play en la página familiar de instalación. No requiere integrar una fuente M3U.
- **MeteGol:** su repo público (<https://github.com/Geber-Dev0/Metegol>) dice explícitamente que
  obtiene streams de Al Ángulo, Fútbol Libre, Agenda18 y Deporflix, redirige streams de terceros no
  autorizados y usa extracción/proxy HLS/túnel. No se va a copiar su scraper, proxy ni bypass; que
  un repo sea visible no concede permiso para robarlo ni convierte esas retransmisiones en
  autorizadas. El README del repo no presenta una licencia que permita reutilizarlo.
- El documento local `docs/LEGAL.md` ya advierte que MediaFusion y listas M3U pueden redirigir a
  retransmisiones no autorizadas. No sumar una M3U/addon de terceros ni afirmar derechos sin revisar
  su licencia y fuente.

## Cambios hechos en Fubol

- Home deportivo ordenado `Fútbol → En vivo internacional → Hoy → otros deportes`; canales no
  verificados como argentinos quedan claramente detrás.
- No se creó una fila falsa “Bambino”/“TyC”. El siguiente paso para incorporar una fuente extra es
  elegir un proveedor oficial o autorizar explícitamente la revisión de una M3U/addon externo,
  aceptando que un enlace HTTP 200 no valida derechos ni idioma.

## Medición de latencia y arreglos (2026-10-24 noche)

- Origen medido (Sky Sports Premier League, host `papacito.cfd`): playlist HLS con
  `#EXT-X-TARGETDURATION:6` y 8 segmentos (48 s). El `#EXT-X-PROGRAM-DATE-TIME` del primer
  segmento estaba ~76 s detrás de ahora; el borde vivo (inicio + 48 s) ~28 s detrás. El origen
  publica con ~25-35 s de retraso; no es cero-delay.
- El player por defecto arrancaba dentro de la ventana (posición ~30 s de 37-48 s). Con
  `demuxer-lavf-o=live_start_index=-2` arranca ~12 s antes del borde; con `cache-secs=18` no se
  observaron stalls en 20 s. `live_start_index=-1` arranca más cerca (~4 s) pero se corta con más
  frecuencia cuando el origen publica tarde; se eligió `-2`.
- Delay total esperado: **~35-45 s** (origen + arranque). Si el origen es un re-stream de TV,
  puede estar minutos atrás; mpv no puede corregir eso. Cero delay solo con antena/TV abierta o
  feed oficial.
- `config/mpv/mpv.conf` + `scripts/install-mpv-config.ps1`; instalado en `D:\Fubol\Client` y
  `D:\Fubol\MamaClient` con backups.
- Sports Streams: el manifest configurado con `{"hideTip":true}` (base64url
  `eyJoaWRlVGlwIjp0cnVlfQ`) elimina el stream informativo; el ID del addon y los catálogos no
  cambian.
- VOD sin TorBox: modo P2P. `tt0111161` devuelve 508 streams `infoHash`; `tt0944947:1:1` 314.
  Stremio/Nuvio los reproduce; AIOStreams Desktop no soporta P2P y necesita TorBox.

## ¿Sirve el plan gratis de TorBox?

La página oficial (<https://torbox.app/pricing>) lista el plan Free: 1 slot concurrente, espera de
24 h, 10 descargas al mes, máximo 10 GB por archivo, 250 Mbps, prioridad reducida, API Access y
3rd Party Apps. La documentación oficial de API (<https://api-docs.torbox.app/>) indica que el
token se obtiene en Account Settings → API key. Es un plan gratuito mensual, no una prueba de 24 h;
el formulario pide aceptar Terms/Privacy. No se envió ni aceptó nada en nombre del usuario.

- **Sí, como smoke test:** activar un VOD compatible menor de 10 GB y probar ES/EN, play, seek y
  resume antes de pagar.
- **No, para aceptar todo el objetivo:** no prueba REMUX/BluRay mayor de 10 GB, concurrencia de
  2–3 familiares ni estabilidad con prioridad reducida. TorBox tampoco aporta canales deportivos.
- La captura de East of Eden (“0 versions”) es el resultado esperado mientras falta la clave; no es
  una falla del cliente. No se activa ningún scraper con credenciales falsas.
