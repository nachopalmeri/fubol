#!/usr/bin/env bash
# setup.sh - Prepara el stack para el primer arranque
# Ejecutar UNA VEZ antes de 'docker compose up -d' o 'vagrant up'
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Streaming Stack - Setup ==="

# 1. Generar .env si no existe
if [ ! -f .env ]; then
  echo "[1/5] Generando .env con secretos aleatorios..."
  SECRET_KEY=$(openssl rand -hex 32)
  MF_KEY=$(openssl rand -hex 16)
  cat > .env <<EOF
BASE_URL=http://192.168.56.10:3000
SECRET_KEY=${SECRET_KEY}
DATABASE_URI=sqlite://./data/db.sqlite
PORT=3000
NODE_ENV=production
HOST_URL=http://192.168.56.10:8000
POSTER_HOST_URL=http://192.168.56.10:8000
CONTACT_EMAIL=admin@example.com
SECRET_KEY_MF=${MF_KEY}
API_PASSWORD=changeme
PROWLARR_URL=http://prowlarr:9696
TRAWL_URL=http://trawl:8191
TZ=America/Argentina/Buenos_Aires
PIHOLE_WEBPASSWORD=changeme
MEDIAFLOW_API_PASSWORD=changeme
EOF
  echo "  -> .env creado. EDITAR BASE_URL si tu IP es diferente."
else
  echo "[1/5] .env ya existe, no se sobrescribe."
fi

# 2. Crear directorios de datos
echo "[2/5] Creando directorios de datos..."
mkdir -p data/{aiostreams,mediaflow,caddy,caddy_config,unbound,pihole,dnsmasq,mediafusion,postgres,redis,prowlarr}
echo "  -> OK"

# 3. Validar docker-compose.yml
echo "[3/5] Validando docker-compose.yml..."
if command -v docker &>/dev/null; then
  docker compose config --quiet && echo "  -> YAML valido" || echo "  -> ERROR en YAML"
else
  echo "  -> Docker no instalado, se omite validacion"
fi

# 4. Generar Caddyfile si no existe
if [ ! -f config/Caddyfile ]; then
  echo "[4/5] Generando config/Caddyfile..."
  mkdir -p config
  cat > config/Caddyfile <<'EOF'
:443 {
    tls internal
    reverse_proxy aiostreams:3000
}

http://:80 {
    redir https://{host}{uri}
}
EOF
  echo "  -> OK"
else
  echo "[4/5] config/Caddyfile ya existe."
fi

# 5. Resumen
echo ""
echo "[5/5] Setup completo."
echo ""
echo "=== PROXIMOS PASOS (MANUALES) ==="
echo "1. Editar .env: cambiar BASE_URL con tu IP/dominio real."
echo "2. Levantar el stack: docker compose up -d  (o: vagrant up)"
echo "3. Esperar ~2 min a que todos los servicios esten healthy."
echo "4. Abrir AIOStreams: http://<IP>:3000 -> crear usuario admin -> Services -> TorBox -> pegar API key."
echo "5. Abrir MediaFusion: http://<IP>:8000/configure -> activar deportes."
echo "6. Abrir Prowlarr: http://<IP>:9696 -> agregar indexers."
echo "7. Pi-hole: http://<IP>:8053/admin -> DNS -> Upstream: unbound#5335."
echo "8. Stremio/Nuvio: instalar manifest URL de AIOStreams."
echo "9. Instalar Subtitle Sync en Stremio (client-side) para VOSE ES/EN."
echo "10. (Opcional, Via B) Contratar IPTV premium + integrar lista M3U en Stremio."
echo ""
echo "=== SERVICIOS ==="
echo "AIOStreams:      http://<IP>:3000"
echo "MediaFusion:     http://<IP>:8000"
echo "MediaFlow Proxy:  http://<IP>:8888"
echo "Prowlarr:        http://<IP>:9696"
echo "Pi-hole:         http://<IP>:8053/admin"
echo "Caddy HTTPS:     https://<IP>"
EOF
chmod +x setup.sh
echo "setup.sh creado y marcado como ejecutable."