#!/usr/bin/env bash
# setup.sh - Prepara el stack para el primer arranque (Etapa A).
# Idempotente: se puede ejecutar varias veces sin romper nada.
#
#   - Crea .env con secretos aleatorios (nunca los imprime en pantalla).
#   - Actualiza un .env viejo: agrega variables nuevas, reemplaza
#     "changeme"/vacios por aleatorios y hace backup .env.bak.*
#   - Detecta SERVER_HOST (IP LAN) para que las URLs funcionen desde
#     otros dispositivos (TV, PC, celular).
#   - Genera config/mediafusion.env (perfil "sports") a partir de .env.
#   - Crea directorios de datos y valida el compose si Docker esta disponible.
#
# Uso: bash setup.sh
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Streaming Stack - Setup (Etapa A) ==="

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
gen_hex() {
  # Cadena hex aleatoria de $1 bytes.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

env_get() {
  [ -f .env ] || return 0
  # tr -d '\r': un .env editado en Windows (CRLF) produce "valor\r"; sin esto,
  # comparaciones como "changeme" fallan y los valores rompen URLs (Linux/sed).
  sed -n "s/^$1=//p" .env | tail -n1 | tr -d '\r'
}

env_set() {
  # Reemplaza (o agrega) KEY=value en .env sin imprimir el valor.
  # Nota honesta: el valor viaja como argumento de awk (visible por `ps` local
  # durante el setup); .env queda modo 600.
  local key="$1" value="$2" tmp
  [ -f .env ] || : > .env
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { found = 0 }
    $0 ~ "^" k "=" { if (found == 0) { print k "=" v; found = 1 } ; next }
    { print }
    END { if (found == 0) print k "=" v }
  ' .env > "$tmp"
  mv "$tmp" .env
}

env_drop() {
  # Elimina la linea KEY=... (variables viejas que ya no usa el compose).
  local key="$1" tmp
  [ -f .env ] || return 0
  tmp="$(mktemp)"
  awk -v k="$key" '$0 !~ "^" k "="' .env > "$tmp"
  mv "$tmp" .env
}

ensure_secret() {
  local key="$1" bytes="$2" cur
  cur="$(env_get "$key")"
  if [ -z "$cur" ] || [ "$cur" = "changeme" ] || [ "$cur" = "CHANGE_ME" ]; then
    env_set "$key" "$(gen_hex "$bytes")"
    echo "    - $key: generado (${bytes} bytes hex)"
  else
    echo "    - $key: ya definido, se conserva"
  fi
}

ensure_aiostreams_auth() {
  # Formato vigente de AIOStreams: lista separada por comas usuario:password.
  local cur pass
  cur="$(env_get AIOSTREAMS_AUTH)"
  pass="${cur#*:}"
  if [ -z "$cur" ] || [ "$pass" = "$cur" ] || [ -z "$pass" ] || [ "$pass" = "changeme" ]; then
    pass="$(gen_hex 16)"
    env_set AIOSTREAMS_AUTH "admin:${pass}"
    echo "    - AIOSTREAMS_AUTH: generado (usuario: admin)"
  else
    echo "    - AIOSTREAMS_AUTH: ya definido, se conserva"
  fi
}

detect_lan_ip() {
  # IP privada de la maquina que correra Docker, ignorando loopback,
  # link-local y la red NAT de Vagrant (10.0.2.0/24).
  local ip=""
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 -o addr show scope global 2>/dev/null \
          | awk '$2 !~ /^(docker|br-|veth|virbr|vboxnet|wsl)/ {print $4}' \
          | cut -d/ -f1 \
          | grep -Ev '^(10\.0\.2\.|127\.|169\.254\.)' \
          | grep -E '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' \
          | head -n1 || true)"
  fi
  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | tr ' ' '\n' \
          | grep -Ev '^(10\.0\.2\.|127\.|169\.254\.)' \
          | grep -E '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' \
          | head -n1 || true)"
  fi
  if [ -z "$ip" ] && command -v powershell.exe >/dev/null 2>&1; then
    # Git Bash en Windows: primera IPv4 privada que no sea la NAT de Vagrant.
    ip="$(powershell.exe -NoProfile -Command \
      "(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { \$_.IPAddress -match '^(192\.168\.|10\.|172\.)' -and \$_.IPAddress -notmatch '^10\.0\.2\.' -and \$_.PrefixOrigin -ne 'WellKnown' -and \$_.InterfaceAlias -notmatch 'vEthernet|WSL|VirtualBox|Docker|Loopback' } | Select-Object -First 1 -ExpandProperty IPAddress)" \
      2>/dev/null | tr -d '\r\n' || true)"
  fi
  printf '%s' "$ip"
}

# ---------------------------------------------------------------------------
# [1/6] .env
# ---------------------------------------------------------------------------
if [ -f .env ]; then
  echo "[1/6] .env existente: se actualiza (backup en .env.bak.*)..."
  cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"
else
  echo "[1/6] Creando .env nuevo..."
  : > .env
fi

# Normaliza CRLF a LF: .env editados en Windows traen "\r" que en Linux rompen
# comparaciones (changeme) y valores (URLs). cp in-place: seguro en vboxsf;
# el backup ya esta hecho.
if grep -q $'\r' .env; then
  norm_tmp="$(mktemp)"
  awk '{ sub(/\r$/, ""); print }' .env > "$norm_tmp"
  cp "$norm_tmp" .env
  rm -f "$norm_tmp"
  echo "    - CRLF detectado: .env normalizado a LF"
fi

# ---------------------------------------------------------------------------
# [2/6] SERVER_HOST (direccion de los clientes)
# ---------------------------------------------------------------------------
echo "[2/6] SERVER_HOST (IP LAN o hostname para TV/PC/celular)..."
cur_host="$(env_get SERVER_HOST)"
# 192.168.56.10 era la IP host-only vieja: se considera invalida a proposito.
if [ -z "$cur_host" ] || [ "$cur_host" = "CHANGE_ME" ] || [ "$cur_host" = "192.168.56.10" ]; then
  detected="$(detect_lan_ip)"
  if [ -n "$detected" ]; then
    env_set SERVER_HOST "$detected"
    echo "    - detectado: $detected"
  else
    env_set SERVER_HOST "CHANGE_ME"
    echo "    - ATENCION: no pude detectar la IP LAN automaticamente."
  fi
else
  echo "    - ya definido: $cur_host"
fi

# ---------------------------------------------------------------------------
# [3/6] Secretos
# ---------------------------------------------------------------------------
echo "[3/6] Secretos (los valores no se imprimen)..."
ensure_secret SECRET_KEY 32
ensure_aiostreams_auth
ensure_secret SECRET_KEY_MF 16
ensure_secret API_PASSWORD 16
ensure_secret MEDIAFUSION_DB_PASSWORD 16
ensure_secret MEDIAFLOW_API_PASSWORD 16
ensure_secret PIHOLE_WEBPASSWORD 16
[ -n "$(env_get CONTACT_EMAIL)" ] || env_set CONTACT_EMAIL "admin@example.com"
[ -n "$(env_get TZ)" ] || env_set TZ "America/Argentina/Buenos_Aires"

# ---------------------------------------------------------------------------
# [4/6] Limpiar variables viejas (el compose ya no las lee)
# ---------------------------------------------------------------------------
echo "[4/6] Limpiando variables obsoletas de .env..."
for k in BASE_URL HOST_URL POSTER_HOST_URL PORT NODE_ENV DATABASE_URI PROWLARR_URL TRAWL_URL; do
  env_drop "$k"
done
echo "    - OK"

# ---------------------------------------------------------------------------
# [5/6] Directorios de datos y config/mediafusion.env
# ---------------------------------------------------------------------------
echo "[5/6] Directorios de datos y config generada..."
mkdir -p \
  data/aiostreams data/mediaflow data/caddy data/caddy_config \
  data/pihole data/dnsmasq data/mediafusion data/postgres data/redis data/prowlarr
# umask 077 deja los directorios en 700 (root): contenedores que corren sin root
# (postgres, redis, mediaflow) podrian no poder escribir. Los datos no son
# secretos: 755 best-effort; .env y config/mediafusion.env siguen en 600.
chmod 755 data data/* 2>/dev/null || true

host="$(env_get SERVER_HOST)"
tz="$(env_get TZ)"
cat > config/mediafusion.env <<EOF
# Generado por setup.sh - NO editar a mano (se regenera en cada ejecucion).
# Valores espejo de .env: este archivo solo adapta los nombres de las
# variables que espera MediaFusion y no filtra el resto de .env.
HOST_URL=https://${host}:8443
POSTER_HOST_URL=https://${host}:8443
CONTACT_EMAIL=$(env_get CONTACT_EMAIL)
SECRET_KEY=$(env_get SECRET_KEY_MF)
API_PASSWORD=$(env_get API_PASSWORD)
POSTGRES_URI=postgresql://mediafusion:$(env_get MEDIAFUSION_DB_PASSWORD)@postgres:5432/mediafusion
REDIS_URL=redis://redis:6379
STREAM_RS_PORT=8000
PROWLARR_URL=http://prowlarr:9696
TRAWL_URL=http://trawl:8191
TZ=${tz:-America/Argentina/Buenos_Aires}
EOF
# chmod puede no aplicarse en carpetas sincronizadas (vboxsf/NTFS): no abortar.
chmod 600 config/mediafusion.env 2>/dev/null || true
chmod 600 .env 2>/dev/null || true
echo "    - OK (config/mediafusion.env modo 600)"

# ---------------------------------------------------------------------------
# [6/6] Validacion
# ---------------------------------------------------------------------------
if [ "$(env_get SERVER_HOST)" = "CHANGE_ME" ]; then
  echo ""
  echo "!! FALTANTE: SERVER_HOST"
  echo "   Edita .env y define la IP LAN del servidor, por ejemplo:"
  echo "       SERVER_HOST=192.168.1.50"
  echo "   (o un hostname que resuelvan tus dispositivos). Luego: bash setup.sh"
  exit 1
fi

if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
  else
    COMPOSE="docker-compose"
  fi
  echo "[6/6] Validando docker-compose.yml ($COMPOSE)..."
  if ! $COMPOSE config --quiet; then
    echo "    - ERROR: configuracion base invalida. Revisa docker-compose.yml y .env"
    exit 1
  fi
  echo "    - configuracion base: OK"
  if ! $COMPOSE --profile sports --profile dns config --quiet; then
    echo "    - ERROR: perfiles sports/dns invalidos."
    exit 1
  fi
  echo "    - perfiles sports/dns: OK"
else
  echo "[6/6] Docker no disponible en esta maquina: se omite la validacion de compose."
fi

EFF_HOST="$(env_get SERVER_HOST)"
echo ""
echo "Setup completo. Proximos pasos:"
echo "  1. Arrancar el nucleo:       docker compose up -d"
echo "  2. Ver estado:               docker compose ps"
echo "  3. Panel AIOStreams (LAN):   http://${EFF_HOST}:3000  (usuario: admin)"
echo "     Password: en .env (AIOSTREAMS_AUTH), no se imprime aca."
echo "  4. HTTPS en la LAN (requiere instalar la CA interna; ver README):"
echo "       https://${EFF_HOST}         -> panel + manifests"
echo "       https://${EFF_HOST}:8443    -> MediaFusion (perfil sports)"
echo ""
echo "Perfiles opcionales (no bloquean el nucleo):"
echo "  docker compose --profile sports up -d    # deportes MediaFusion"
echo "  docker compose --profile dns up -d       # Pi-hole + Unbound"
echo ""
echo "Manifest para clientes (Stremio/Nuvio), formato real de AIOStreams v2:"
echo "  https://${EFF_HOST}/stremio/<uuid>/<password>/manifest.json"
echo "  AIOStreams te muestra el tuyo al crear cada usuario en el panel."
echo "  Stremio exige HTTPS para instalar addons: instala primero la CA interna."
