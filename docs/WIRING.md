# Configuración post-install (Etapa A)

Pasos manuales después de `docker compose up -d`. Reemplazá `<IP-LAN>` por `SERVER_HOST` de `.env`.

## 0. CA interna

- Archivo: `data/caddy/caddy/pki/authorities/local/root.crt`.
- Instalarla como CA de confianza en cada dispositivo (README, Paso 8).
- Sin la CA, Stremio/AIOStreams no aceptan el HTTPS interno.

## 1. Panel AIOStreams

- Abrir `http://<IP-LAN>:3000` o `https://<IP-LAN>/`.
- Login: usuario/contraseña de `AIOSTREAMS_AUTH` en `.env` (no hay `admin` por defecto).
- Estado actual: 9 presets y 13 catálogos (6 Cinemeta + 7 deportes). Sin TorBox, los presets que
  exigen debrid (`knaben`, `stremthruTorz`, `animetosho`) quedan desactivados; Torrentio/Comet/
  MediaFusion siguen en P2P para Stremio/Nuvio.
- TorBox: **no pegarla en el panel** si usás el script. Crear `.secrets/torbox.key` con la API key
  en una línea y ejecutar:

```bash
node scripts/torbox-validate.mjs
node scripts/aiostreams-config.mjs prepare
```

El manifest queda en `.secrets/aiostreams-user.env`; no se comparte la API key.

## 2. Cliente principal

- **AIOStreams Desktop**: release `desktop`, asset `aiostreams-desktop-win-x64.zip`; portable,
  incluye mpv. Reproduce HLS, MKV y subtítulos. Es el cliente recomendado para PC.
- **AIOStreams web** (`/jellyfin/web/`): login, catálogo y configuración. Chrome **no reproduce
  HLS/MKV**; no es el reproductor familiar.
- **Stremio/Nuvio**: fallback con el manifest URL.

## 3. Deportes

- **Sports Streams** ya está integrado; aporta `Live Now`, `Today`, `Football` y categorías.
- Canales HLS reales verificados: Sky Sports Premier/F1/Golf/Tennis/News, Fox Sports 1/502,
  TSN 1/5. `TNT Sport 1/2` no tenían fuente en la última medición.
- Eventos de agenda sin fuente muestran `No streams found` o un aviso; no se inventan enlaces.
- El HLS está **~25-35 s detrás del vivo en el origen**; el player arranca ~12 s antes del borde
  con `live_start_index=-2`. Total típico **~35-45 s**; no es cero delay. Para fútbol argentino sin
  delay: antena/TV abierta (si el partido va por TV abierta). En esta casa no hay cable de TV;
  IPTV de pago reduce pero no elimina el buffer.
- MediaFusion (opcional):

```bash
docker compose --profile sports up -d
```

  Panel: `https://<IP-LAN>:8443/configure`; addon: `https://<IP-LAN>:8443/manifest.json`.
  Benchmark contra Sports Streams pendiente.

## 4. Perfil DNS (opcional)

```bash
docker compose --profile dns up -d
```

- Pi-hole: `http://<IP-LAN>:8053/admin` (password `PIHOLE_WEBPASSWORD`).
- Upstream: `unbound#53` (nombre interno de Docker; `5335` es solo local).

## 5. Subtítulos VOSE

- El preset `OpenSubtitles V3+` ya está activo con `en`, `es`, `sp`, `ea`.
- En el player de escritorio: elegir subtítulo ES/EN y ajustar offset manual si hace falta.
- La sincronización real solo se puede validar con un stream VOD real (TorBox).

## 6. TV

La Samsung UN32J4290 es **Tizen 2.3**: no instala AIOStreams/Stremio y su navegador no reproduce
HLS/MKV. Opciones:

1. **Android TV stick/box por HDMI** (recomendado): Fire TV Stick, Google TV, Xiaomi Mi Box.
   Instalar AIOStreams Android/Stremio, agregar el manifest y usar el control remoto.
   Comprar solo con autorización.
2. **Laptop/PC por HDMI**: usar AIOStreams Desktop; sin compra, pero menos cómodo.
3. **Cast/mirror**: no recomendado para HLS/MKV y deportes; puede sumar latencia.
4. La TV es 720p; para deportes alcanza 720p/1080p. Un stick 4K no mejora la resolución de esta TV.

## 7. Acceso simple para mamá

Un link web solo no alcanza: Chrome no reproduce HLS/MKV. La opción simple depende del dispositivo:

- **PC/notebook con Windows**: instalar AIOStreams Desktop y crear un acceso directo llamado
  `Fubol` (un doble clic). Dejar el manifest de su perfil ya cargado.
- **Celular/tablet/Android TV**: instalar la app AIOStreams/Stremio y agregar su manifest una vez;
  después es un ícono.
- **TV Samsung**: requiere el stick/box del punto 6; la app queda como ícono en la pantalla de inicio.
- Si se quiere un link real en el navegador, hace falta un servidor con transcodificación
  (Jellyfin/otro), que hoy no está en el alcance.

Pendiente: definir el dispositivo de mamá y crear su perfil/manifest separado (sin compartir el
del dueño).
