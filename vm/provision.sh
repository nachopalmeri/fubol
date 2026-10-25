#!/usr/bin/env bash
# Provision de la VM: instala Docker y levanta el nucleo del stack (Etapa A).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release

# Docker (repo oficial)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker vagrant

# Puerto 53 libre para el perfil "dns" (Pi-hole): el stub de systemd-resolved
# escucha en 127.0.0.53:53 y choca con el bind 0.0.0.0:53 de Docker.
if systemctl is-enabled systemd-resolved >/dev/null 2>&1; then
  mkdir -p /etc/systemd/resolved.conf.d
  cat > /etc/systemd/resolved.conf.d/99-free-port-53.conf <<'EOF'
[Resolve]
DNSStubListener=no
EOF
  systemctl restart systemd-resolved
  # La VM sigue resolviendo DNS por systemd-resolved, sin el stub local.
  ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
fi

# El repo llega por synced_folder: Vagrantfile monta la raiz del repo.
if [ ! -f /vagrant/docker-compose.yml ]; then
  echo "ERROR: no encuentro /vagrant/docker-compose.yml." >&2
  echo "Revisa el synced_folder del Vagrantfile (debe montar la raiz del repo)." >&2
  exit 1
fi

cd /vagrant

# setup.sh sale con exit 1 si SERVER_HOST quedo en CHANGE_ME. Aca no abortamos
# todavia: el plan B de abajo puede detectar la IP de la VM.
if ! bash setup.sh; then
  echo "setup.sh no completo (posible SERVER_HOST sin detectar): se intenta el plan B..."
fi

# Plan B de SERVER_HOST: si quedo vacio/CHANGE_ME, usar la IP de la interfaz
# bridged de esta VM (ignora la NAT de Vagrant, docker0, veth, etc.).
cur_host="$(sed -n 's/^SERVER_HOST=//p' .env | tail -n1)"
if [ -z "$cur_host" ] || [ "$cur_host" = "CHANGE_ME" ]; then
  lan_ip="$(ip -4 -o addr show scope global 2>/dev/null \
            | awk '$2 !~ /^(docker|br-|veth|virbr|vboxnet|wsl)/ {print $4}' \
            | cut -d/ -f1 \
            | grep -Ev '^(10\.0\.2\.|127\.|169\.254\.)' | head -n1 || true)"
  if [ -n "$lan_ip" ]; then
    sed -i "s/^SERVER_HOST=.*/SERVER_HOST=${lan_ip}/" .env
    echo "SERVER_HOST=${lan_ip}"
    # regenera config/mediafusion.env con la IP correcta
    bash setup.sh >/dev/null \
      || { echo "ERROR: setup.sh fallo al regenerar con SERVER_HOST=${lan_ip}" >&2; exit 1; }
  fi
fi

cur_host="$(sed -n 's/^SERVER_HOST=//p' .env | tail -n1)"
if [ -z "$cur_host" ] || [ "$cur_host" = "CHANGE_ME" ]; then
  echo "ERROR: SERVER_HOST sigue sin definirse. Edita /vagrant/.env (SERVER_HOST=<IP LAN de la VM>) y volve a correr: vagrant provision" >&2
  exit 1
fi

# Si corriste setup.sh en el host antes de 'vagrant up', SERVER_HOST apunta a
# la IP del host y no a la de esta VM: avisar sin pisar (puede ser un hostname propio).
if ! ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | grep -qx "$cur_host"; then
  echo "ATENCION: SERVER_HOST=${cur_host} no coincide con ninguna IP de esta VM."
  echo "  Si lo detecto setup.sh en el host, corregilo en .env (SERVER_HOST=<IP de esta VM)"
  echo "  y volve a correr: bash setup.sh && docker compose up -d"
fi

echo "Levantando el nucleo (aiostreams + caddy)..."
docker compose up -d --wait --wait-timeout 300

server_host="$(sed -n 's/^SERVER_HOST=//p' .env | tail -n1)"
echo ""
echo "=== Stack arriba (nucleo) ==="
docker compose ps
echo ""
echo "Panel AIOStreams:   http://${server_host}:3000"
echo "HTTPS (CA interna): https://${server_host}"
echo "Deportes:           docker compose --profile sports up -d  ->  https://${server_host}:8443"
echo "DNS (Pi-hole):      docker compose --profile dns up -d"
echo ""
echo "Pendiente manual de seguridad: TorBox API key se carga en el panel de AIOStreams."
