# Bloqueo de anuncios y trackers (local, sin filtracion de datos)

## Pi-hole (perfil `dns` del docker-compose)
- Arranque: `docker compose --profile dns up -d` (necesita el puerto 53 libre en el host).
- Web: http://<IP-LAN>:8053/admin (password: `PIHOLE_WEBPASSWORD` en `.env`).
- Configurar los dispositivos de la LAN para usar <IP-LAN> como DNS.
- Listas recomendadas (agregar en Pi-hole -> Adlists):
  https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
  https://adaway.org/hosts.txt
  https://v.firebog.net/hosts/Easylist.txt
  https://v.firebog.net/hosts/Prigent-Ads.txt

## Navegador (Brave/Firefox + uBlock Origin)
- Instalar uBlock Origin (no Lite) y activar todas las listas por defecto.
- Desactivar telemetria del navegador.

## Stremio/Nuvio
- No usar cuentas cloud si no quieres historial remoto; Stremio permite uso anonimo.
- Desactivar "Analytics" en ajustes de Stremio.

## VPN (opcional, para P2P sin debrid)
- Si usas Torrentio sin debrid (P2P directo), usar VPN (WireGuard/Mullvad).
- Con TorBox/Real-Debrid no hace falta VPN para streaming (el debrid descarga por ti).

## DNS: Pi-hole -> Unbound (como viene configurado)
El compose ya configura el upstream de Pi-hole como `unbound#53` (nombre interno de
Docker; el `5335` del compose es solo un puerto local de depuracion, NO se usa como upstream).

Honestidad sobre "sin filtracion": Unbound reenvia las consultas a Cloudflare por defecto
(`config/unbound/forward-records.conf`). Si queres recursion pura (sin terceros), vacia ese
archivo dejando solo comentarios y reinicia el perfil dns; probalo antes de confiar en el,
porque algunas redes bloquean el puerto 53 saliente.
