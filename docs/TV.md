# Portar Fubol a la TV

## La TV actual

Samsung **UN32J4290** (2015):

- 32", **1366x768** (720p), 60 Hz.
- 2 entradas HDMI (algunas variantes listan 4), 1 USB, Ethernet, Wi-Fi.
- Tizen de 2015. AIOStreams/Stremio no tiene cliente directo para este modelo. Nuvio anuncia
  Samsung Tizen en su web oficial, pero no publica allí un mínimo que confirme compatibilidad con
  Tizen 2.3; hay que buscarlo en Samsung Apps desde la TV antes de comprar un stick.
- El navegador de la TV no reproduce HLS/MKV de forma confiable.

Conclusión: no se puede instalar la app directamente en la TV. Hay que sumar un dispositivo
externo por HDMI o usar una laptop.

## Orden sin compras

1. Probar en Samsung Apps si **Nuvio** está disponible para este modelo/firmware. No asumir que
   el anuncio general de Tizen cubre Tizen 2.3.
2. Si no está, conectar la PC por HDMI y abrir **Fubol Mama**.
3. Solo si HDMI no sirve y se autoriza una compra, usar Android TV stick/box.

## Opción de compra, solo si se autoriza: Android TV stick/box

Cualquiera de estos sirve; no hace falta 4K para esta TV:

- Fire TV Stick (HD/4K) o Fire TV Cube.
- Google TV / Chromecast con Google TV.
- Xiaomi Mi Box / Mi TV Stick.
- Onn 4K (si se consigue).

Requisitos mínimos: Android TV/Google TV, 2 GB de RAM recomendado, Wi-Fi 5 GHz o adaptador
Ethernet, y soporte HEVC para VOD 1080p.

### Instalación

1. Conectar el stick al HDMI de la TV y a la corriente.
2. Conectar por Ethernet si es posible; si no, Wi-Fi 5 GHz.
3. Instalar **AIOStreams Android** o **Stremio** desde la tienda del stick.
4. Instalar la CA interna de Caddy si se usa HTTPS interno (Ajustes -> Seguridad -> Certificados).
5. Agregar el manifest del perfil familiar:
   `https://<IP-LAN>/stremio/<uuid>/<password>/manifest.json`
6. Abrir la app, elegir `En vivo`/`Fútbol` o `Películas`/`Series`.
7. Opcional: instalar un launcher simple y dejar `Fubol` como primer ícono.

La TV es 720p: un stick 4K no mejora la imagen, pero un modelo 4K suele tener mejor CPU/RAM y
va más fluido. No comprar sin autorización.

## Alternativa sin compra: laptop/PC por HDMI

- Conectar la laptop a la TV con HDMI.
- Usar AIOStreams Desktop (mpv) en la laptop; la TV queda como monitor.
- Para deportes, usar Ethernet y hardware decode.
- Es la opción más barata si ya hay laptop, pero menos cómoda para la familia.

## Deportes: latencia

El HLS de Sports Streams está **~25-35 s detrás del vivo en el origen**; con el arranque en el
borde (`live_start_index=-2`) el player suma ~12 s. Total típico **~35-45 s**; el stick no la
elimina. Si el origen es un re-stream de TV puede estar más atrasado y el player no lo corrige.
Para fútbol argentino sin delay:

- **Antena/TV abierta**: si el partido se emite por TV Pública/Telefe, la TV lo recibe por aire
  sin el delay del HLS. La Samsung tiene sintonizador; hay que confirmar que haya antena conectada
  y que el partido salga por un canal abierto.
- En esta casa **no hay TV por cable**. Si el partido va solo por TyC/ESPN/TNT, la alternativa
  actual es internet y tendrá delay; no dar por disponible un decodificador.
- **IPTV de pago**: reduce a segundos, pero no garantiza cero.
- El stick Android sirve para VOD y para canales, pero no convierte un HLS de 35-45 s en cero delay.

## Fuentes

- Nuvio oficial: <https://nuvio.tv/> (anuncia cliente para Samsung Tizen; no confirma Tizen 2.3).

## Rollback

- Desconectar el stick y la TV vuelve a su funcionamiento normal; no se modifica firmware.
- La laptop por HDMI no cambia nada en la TV.
- No se compra hardware sin autorización.
