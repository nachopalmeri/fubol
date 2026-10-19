# Bloqueo de anuncios y trackers (local, sin filtracion de datos)

## Pi-hole (incluido en docker-compose)
- Web: http://<VM-IP>:8053/admin  (password: changeme en .env)
- Configurar los dispositivos de la LAN para usar <VM-IP> como DNS.
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

## DNS recursivo (Unbound)
Pi-hole -> Upstream DNS: `unbound#5335` (en vez de Google/Cloudflare).
Asi las consultas DNS no se filtran a terceros.
