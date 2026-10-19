#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release git

# Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker vagrant

# Clone project (already synced via shared folder in Vagrant; fallback clone not needed)
mkdir -p /opt/media
if [ ! -d /opt/media/fubol ]; then
  cp -r /vagrant /opt/media/fubol 2>/dev/null || true
fi

cd /opt/media/fubol 2>/dev/null || cd /vagrant
docker compose up -d --build

echo "=== Streaming stack started ==="
echo "AIOStreams:         http://192.168.56.10:3000"
echo "Pi-hole web:        http://192.168.56.10:8053/admin"
echo "Caddy HTTPS:        https://192.168.56.10"
