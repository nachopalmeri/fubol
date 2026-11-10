# Resolver de torrents: reproducir P2P sin debrid

Los addons de streams (Torrentio, Comet, MediaFusion, Meteor) no devuelven
archivos: devuelven `infoHash`. Un navegador no abre un torrent, así que sin un
resolver la app no tiene nada que mostrar para una película popular.

Este documento explica el camino **gratis**: el servidor de streaming de
Stremio (`stremio/server`), que es el mismo mecanismo que usan Stremio y Nuvio
con estos mismos addons.

## Qué hace

1. La app pide las fuentes al addon y recibe `infoHash` + `fileIdx` + nombre de
   archivo.
2. La app pide ese hash al resolver, que se une al enjambre BitTorrent y
   re-sirve el archivo por HTTP con soporte de Range.
3. Si el release es MKV/HEVC (que ningún navegador decodifica), la app pide la
   variante HLS del resolver: el servidor lo remuxea a MP4 fragmentado sobre la
   marcha. Eso es lo que convierte "esta película no tiene fuente" en "esta
   película se ve".

Sin resolver configurado, los releases que el navegador no puede leer se
descartan (no tiene sentido enlistarlos) y los que sí (MP4/H.264) se ofrecen
tal cual.

## Puesta en marcha (Windows, con Docker)

```powershell
# 1. Descargar cloudflared (túnel público sin cuenta)
New-Item -ItemType Directory -Force tools | Out-Null
Invoke-WebRequest https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe -OutFile tools\cloudflared.exe

# 2. Levantar el resolver, publicarlo y avisarle a la app
$env:FUBOL_ADMIN_PASSWORD = "la del panel"
node scripts\torrent-resolver.mjs --admin https://fubol-five.vercel.app --detach
```

El script:

- levanta el contenedor `fubol-torrserver` (imagen `stremio/server:v4.22.5`) con
  `config/torrserver/config.json` (Torrentio como fuente);
- publica el resolver con un túnel de Cloudflare **sin cuenta**;
- guarda la dirección pública y la dirección interna en el estado de la app
  (`POST /api/admin/torrent-server`), que es donde la lee en cada request.

También se puede hacer a mano desde el panel: **Addons VOD → Resolver de
torrents**.

## El túnel es efímero

El túnel rápido de Cloudflare no tiene garantía de uptime y **cambia de URL en
cada reinicio**. Si la URL muere, la app queda apuntando a un resolver
inaccesible y los títulos P2P vuelven a "sin fuente". La forma de arreglarlo es
volver a correr el script (imprime la URL nueva y la publica).

Para una dirección fija hace falta un túnel con cuenta de Cloudflare (o
Tailscale) apuntando al mismo `127.0.0.1:11470`.

## Qué necesita la máquina

- Docker con el contenedor del resolver.
- El túnel: por eso **la PC tiene que estar encendida** mientras se mira VOD.
  El fútbol en vivo, el catálogo, los subtítulos y el resto de la app no
  dependen de esto: viven en Vercel.

## La alternativa: un debrid

Con un token de un servicio de descarga (TorBox, Real-Debrid, Premiumize,
AllDebrid) los propios addons devuelven links HTTP y no hace falta ni la PC
ni el resolver. Se pega en el panel, en **Resolver P2P con tu cuenta**, y la
app arma el manifest configurado sola. Con eso el VOD funciona aunque la PC
esté apagada.

La cuenta de TorBox se crea en <https://torbox.app> (el plan gratuito no pide
tarjeta). El alta pide pasar el captcha de Cloudflare en un navegador de
escritorio: con un navegador automatizado el proveedor lo rechaza.
