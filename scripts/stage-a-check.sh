#!/usr/bin/env bash
# stage-a-check.sh - Verificaciones de la Etapa A sobre el host con Docker.
# Solo lectura: no modifica nada. Ejecutar en la raiz del repo (en la VM):
#   bash scripts/stage-a-check.sh
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PASS=0
FAIL=0
ok()   { echo "  PASS  $1"; PASS=$((PASS + 1)); }
ko()   { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); }
info() { echo "  info  $1"; }

SERVER_HOST="$(sed -n 's/^SERVER_HOST=//p' .env 2>/dev/null | tail -n1)"
# El bind es ./data/caddy:/data, asi que Caddy escribe en data/caddy/caddy/pki/...
# Se busca la ruta real para no depender del layout exacto.
CA="$(find data/caddy -path '*/pki/authorities/local/root.crt' -print -quit 2>/dev/null || true)"
[ -n "$CA" ] || CA="data/caddy/pki/authorities/local/root.crt"

echo "== stage-a-check (Etapa A) =="
echo "server_host=${SERVER_HOST:-(sin .env)}"

echo ""
echo "-- 1. Contenedores del nucleo"
docker compose ps 2>/dev/null || info "docker compose no disponible en este host"
for c in aiostreams caddy; do
  # Caddy puede tardar en pasar de "starting" a "healthy": esperar hasta 60 s.
  for _ in $(seq 1 30); do
    st="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null | tr -d '\r\n' || true)"
    hs="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$c" 2>/dev/null | tr -d '\r\n' || true)"
    [ -n "$st" ] || st=missing
    [ -n "$hs" ] || hs=missing
    { [ "$st" = "running" ] && { [ "$hs" = "healthy" ] || [ "$hs" = "n/a" ]; }; } && break
    sleep 2
  done
  if [ "$st" = "running" ] && { [ "$hs" = "healthy" ] || [ "$hs" = "n/a" ]; }; then
    ok "$c running / health=$hs"
  else
    ko "$c estado=$st health=$hs"
  fi
done

echo ""
echo "-- 2. AIOStreams directo (127.0.0.1:3000)"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3000/api/v1/status 2>/dev/null || true)"
[ "$code" = "200" ] && ok "/api/v1/status = 200" || ko "/api/v1/status = $code"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3000/api/v1/health 2>/dev/null || true)"
[ "$code" = "200" ] && ok "/api/v1/health = 200" || ko "/api/v1/health = $code"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3000/ 2>/dev/null || true)"
info "GET / sin credenciales = $code (el SPA puede servirse publico; el login protege las APIs)"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3000/api/v1/auth/me 2>/dev/null || true)"
case "$code" in
  401 | 403) ok "/api/v1/auth/me sin credenciales = $code (login exigido)" ;;
  200)       ko "/api/v1/auth/me sin credenciales = 200 (revisar AIOSTREAMS_AUTH)" ;;
  *)         info "/api/v1/auth/me = $code (endpoint distinto en esta version: revisar a mano)" ;;
esac

echo ""
echo "-- 3. Caddy / HTTPS en la LAN"
if [ -n "${SERVER_HOST:-}" ] && [ "$SERVER_HOST" != "CHANGE_ME" ]; then
  # Caddy genera la CA en el primer arranque; darle hasta 30 s.
  for _ in $(seq 1 15); do [ -f "$CA" ] && break; sleep 2; done
  if [ -f "$CA" ]; then
    ok "CA interna presente: $CA"
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --cacert "$CA" "https://${SERVER_HOST}/api/v1/status" 2>/dev/null || true)"
    used_openssl=0
    # En Windows/Git Bash, curl usa Schannel y no acepta --cacert: se valida con OpenSSL.
    if [ "$code" != "200" ] && command -v openssl >/dev/null 2>&1; then
      reqf="$(mktemp 2>/dev/null || echo "/tmp/stage-a-req.$$")"
      respf="$(mktemp 2>/dev/null || echo "/tmp/stage-a-resp.$$")"
      printf 'GET /api/v1/status HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n' "$SERVER_HOST" >"$reqf"
      if openssl s_client -help 2>&1 | grep -q -- '-verify_ip'; then
        openssl s_client -quiet -ign_eof -connect "${SERVER_HOST}:443" -servername "$SERVER_HOST" \
          -CAfile "$CA" -verify_return_error -verify_ip "$SERVER_HOST" <"$reqf" >"$respf" 2>/dev/null
      else
        openssl s_client -quiet -ign_eof -connect "${SERVER_HOST}:443" -servername "$SERVER_HOST" \
          -CAfile "$CA" -verify_return_error <"$reqf" >"$respf" 2>/dev/null
      fi
      alt="$(sed -n '1s/^HTTP\/[0-9.]* \([0-9][0-9][0-9]\).*/\1/p' "$respf")"
      rm -f "$reqf" "$respf"
      [ -n "$alt" ] && code="$alt" && used_openssl=1
    fi
    [ "$code" = "200" ] && ok "https://${SERVER_HOST}/api/v1/status = 200 (CA confiada)" || ko "https://${SERVER_HOST}/api/v1/status = $code"
    [ "$used_openssl" = "1" ] && info "cadena TLS validada con OpenSSL (curl Schannel no soporta --cacert en Windows)"
    if command -v openssl >/dev/null 2>&1; then
      echo | openssl s_client -connect "${SERVER_HOST}:443" -CAfile "$CA" 2>/dev/null \
        | sed -n 's/^ *subject=/      subject=/p;s/^ *issuer=/      issuer=/p' | head -n2
    fi
  else
    ko "no existe $CA (Caddy todavia no emitio su CA)"
  fi
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://${SERVER_HOST}/" 2>/dev/null || true)"
  case "$code" in
    301 | 302 | 307 | 308) ok "http:// redirige a HTTPS ($code)" ;;
    *) ko "http:// no redirige a HTTPS ($code)" ;;
  esac
else
  info "sin SERVER_HOST valido: se omiten pruebas HTTPS"
fi

echo ""
echo "-- 4. Seguridad basica"
if [ ! -f .env ]; then
  ko ".env no existe (corre: bash setup.sh)"
elif grep -q changeme .env 2>/dev/null; then
  ko ".env contiene 'changeme'"
else
  ok ".env sin 'changeme'"
fi
grep -qE '^AIOSTREAMS_AUTH=.+:.+' .env 2>/dev/null && ok "AIOSTREAMS_AUTH definido (usuario:password)" || ko "AIOSTREAMS_AUTH ausente o mal formado"
perm="$(stat -c '%a' .env 2>/dev/null || echo '?')"
info ".env permisos=$perm (esperado 600; en carpetas sincronizadas puede variar)"

echo ""
echo "-- 5. Perfiles opcionales (informativo si estan apagados)"
for c in mediafusion-api postgres redis prowlarr trawl mediaflow-proxy unbound pihole; do
  run="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null | tr -d '\r\n' || true)"
  hs="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$c" 2>/dev/null | tr -d '\r\n' || true)"
  [ -n "$run" ] || run=absent
  [ -n "$hs" ] || hs=absent
  case "$run" in
    running) ok "$c running / health=$hs" ;;
    absent) info "$c no activo (perfil opcional apagado)" ;;
    *) ko "$c estado=$run health=$hs" ;;
  esac
done

echo ""
echo "Resultado: ${PASS} pass, ${FAIL} fail"
[ "$FAIL" -eq 0 ]
