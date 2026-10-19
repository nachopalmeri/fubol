# Configuracion post-install

Pasos manuales una vez levantado el stack (vagrant up / docker compose up -d).

## 1. AIOStreams (3000)
- Crear usuario admin (guardar UUID + password).
- Services -> agregar TorBox -> pegar API key.
- Addons -> Marketplace -> instalar Torrentio/Comet/MediaFusion.
- Proxy -> seleccionar MediaFlow Proxy -> URL: http://mediaflow-proxy:8888, API password: (del .env).
- Save & Install -> copiar manifest URL.

## 2. MediaFlow Proxy (8888)
- Acceder a http://<IP>:8888/docs (documentacion interactiva).
- Verificar que AIOStreams lo use como proxy de streams.

## 3. MediaFusion (8000)
- Acceder a http://<IP>:8000/configure -> activar deportes.
- Agregar TorBox API key si se desea (opcional, para streams cacheados).
- Prowlarr: http://<IP>:9696 -> agregar indexers.

## 4. Pi-hole (8053)
- Settings -> DNS -> Upstream: unbound#5335.
- Agregar blocklists (ver privacy/README.md).

## 5. Caddy (80/443) - solo si compartis fuera de la LAN
- Editar config/Caddyfile con tu dominio.
- Actualizar BASE_URL en .env.

## 6. Nuvio/Stremio
- Instalar manifest URL de AIOStreams.
- Instalar Subtitle Sync (cliente) para VOSE ES/EN.

## 7. IPTV premium (Via B, opcional)
- Contratar suscripcion IPTV con Xtream Codes o lista M3U.
- Integrar en Stremio con addon generico de M3U (stremio-addons.net).
'@ | Set-Content docs/WIRING.md