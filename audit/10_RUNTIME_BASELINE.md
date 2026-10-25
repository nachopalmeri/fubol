# 10 — Runtime Baseline (F0)

**Estado: F0 CORE COMPLETO — 2026-10-22.**
Host: Windows 11 Pro 23H2 (build 22631), AMD Ryzen 5 3600 (6c/12t), 16 GB RAM, disco D: con 494 GB libres.

Veredicto: el núcleo (AIOStreams + Caddy) corre en Docker Desktop/WSL2, responde en LAN por HTTP/HTTPS, exige login y pasa el smoke test **10 PASS / 0 FAIL**. Quedan dos tareas diferidas y explícitas: pin de imágenes (F5) e instalación de la CA en clientes (F3).

## 1. Verificación previa

| Chequeo | Resultado | Evidencia |
|---|---|---|
| Virtualización en firmware | **OK** | `VirtualizationFirmwareEnabled=True`, `VMMonitorModeExtensions=True`, `SLAT=True` (Win32_Processor) |
| Hipervisor activo | No (antes del reinicio) | `HypervisorPresent=False` |
| WSL | Presente, sin distros | `wsl.exe` 10.0.22621.1 (legacy) |
| Docker | Ausente | `docker` no reconocido |
| Vagrant / VirtualBox | Ausentes | No se tocaron; `vm/` queda intacta |
| Shell elevada | No | La instalación se hizo con un proceso elevado vía UAC |

## 2. Cambios aplicados

| # | Acción | Resultado |
|---|---|---|
| 1 | `dism /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart` | **Exit 3010** — reinicio requerido |
| 2 | `dism /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart` | **Exit 3010** — reinicio requerido |
| 3 | Reinicio de Windows | OK |
| 4 | `wsl --update` | **OK** — WSL **3.0.1.0**, kernel **6.18.40.1-1** |
| 5 | Docker Desktop 4.96.0 (build 243774), instalación silenciosa | **Exit 0** |
| 6 | Verificación del instalador | SHA256 `3f75d46a07ff7c7adcc42e55b2bab862e25a459351723ac2633de9ad22a5b4b6` |
| 7 | Arranque de Docker Desktop | Engine real: **Docker 29.9.1**, 12 CPUs, 8.29 GB RAM |
| 8 | `bash setup.sh` | **Exit 0** — `.env` migrado con backup, secretos generados, compose válido |
| 9 | `docker compose up -d` | **Exit 0** — `aiostreams` y `caddy` healthy |
| 10 | `bash scripts/stage-a-check.sh` | **Exit 0 — 10 PASS / 0 FAIL** |
| 11 | Login real del panel | **200** con credenciales, **200** con cookie, **401** con password incorrecta |

### Estado del `.env`

- Backup automático: `.env.bak.20261022-113212` (516 bytes).
- SHA256 antes: `a3cfa4efb7aaa9ba7a85a7b1fd44dcf2ba3093317bb1f79cb4c066cd106e8502`.
- SHA256 después: `97185d94ff3c849c8582b2177e3a40bd43028c80b369a88a3868f044ca8c01bd`.
- El contenido no se imprimió en ningún log. `setup.sh` normalizó LF y generó los secretos faltantes.

## 3. Evidencia cruda

### 3.1 Contenedores

```text
NAME         STATUS
aiostreams   Up 13 minutes (healthy)
caddy        Up 12 minutes (healthy)

aiostreams   0.0.0.0:3000->3000/tcp
caddy        0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp, 0.0.0.0:8443->8443/tcp
```

### 3.2 Smoke test (`scripts/stage-a-check.sh`)

```text
== stage-a-check (Etapa A) ==
server_host=192.168.0.122

-- 1. Contenedores del nucleo
  PASS  aiostreams running / health=healthy
  PASS  caddy running / health=healthy

-- 2. AIOStreams directo (127.0.0.1:3000)
  PASS  /api/v1/status = 200
  PASS  /api/v1/health = 200
  info  GET / sin credenciales = 200 (el SPA puede servirse publico; el login protege las APIs)
  PASS  /api/v1/auth/me sin credenciales = 401 (login exigido)

-- 3. Caddy / HTTPS en la LAN
  PASS  CA interna presente: data/caddy/caddy/pki/authorities/local/root.crt
  PASS  https://192.168.0.122/api/v1/status = 200 (CA confiada)
  info  cadena TLS validada con OpenSSL (curl Schannel no soporta --cacert en Windows)
  PASS  http:// redirige a HTTPS (308)

-- 4. Seguridad basica
  PASS  .env sin 'changeme'
  PASS  AIOSTREAMS_AUTH definido (usuario:password)
  info  .env permisos=644 (esperado 600; en carpetas sincronizadas puede variar)

-- 5. Perfiles opcionales (informativo si estan apagados)
  info  mediafusion-api no activo (perfil opcional apagado)
  info  postgres no activo (perfil opcional apagado)
  info  redis no activo (perfil opcional apagado)
  info  prowlarr no activo (perfil opcional apagado)
  info  trawl no activo (perfil opcional apagado)
  info  mediaflow-proxy no activo (perfil opcional apagado)
  info  unbound no activo (perfil opcional apagado)
  info  pihole no activo (perfil opcional apagado)

Resultado: 10 pass, 0 fail
```

### 3.3 Login real (sin exponer credenciales)

```text
LOGIN_CODE=200
ME_WITH_COOKIE=200
BAD_LOGIN_CODE=401
COOKIE_FILE_PRESENT=yes
```

Contrato verificado en el código de AIOStreams: `POST /api/v1/auth/login` con JSON `{username,password}` y cookie de sesión `aiostreams.session`. No se usó Basic auth.

### 3.4 TLS

```text
subject=
issuer=CN=Caddy Local Authority - ECC Intermediate
X509v3 Subject Alternative Name: critical
    IP Address:192.168.0.122

Verification: OK
Verify return code: 0 (ok)
```

### 3.5 Imágenes (digests, para pin futuro)

```text
aiostreams=ghcr.io/viren070/aiostreams@sha256:83893d1c37eaaaf9ad1e9286bd857220a6b8f042a4f1eac3fa7356017aa2b184
caddy=caddy@sha256:3095ad245c353e3bdb27a38f22a095c1cfa9e295ab21c0214c3e72b0e2960525
```

## 4. Fixes aplicados durante F0

El primer smoke test falló por bugs del propio check, no del stack. Se corrigieron y se volvió a ejecutar:

| Bug | Causa | Fix |
|---|---|---|
| CA "no existe" | El bind es `./data/caddy:/data`; Caddy escribe en `/data/caddy/pki/...`, o sea `data/caddy/caddy/pki/...` | El script busca la ruta real con `find`; README, `docs/WIRING.md` y `audit/09` corregidos |
| Caddy `health=starting` | El check corría a los pocos segundos | Espera hasta 60 s a `healthy` antes de fallar |
| Perfiles apagados marcados FAIL | `docker inspect` devolvía un newline inicial y el `case` no matcheaba `absent` | Normalización con `tr -d '\r\n'`; ausente = `info` |
| HTTPS `000` en Git Bash | El curl de Windows usa **Schannel**, que no acepta `--cacert` | Fallback con `openssl s_client` (`-verify_return_error`, `-verify_ip`, `-ign_eof`) y request en archivo |
| Request HTTP truncado | `$(...)` elimina el CRLF final | Request escrito a archivo temporal antes de `s_client` |

No se cambió la configuración del stack para “hacer pasar” el test: AIOStreams y Caddy ya estaban sanos. Los fixes son del harness de verificación y de la documentación de la ruta de la CA.

## 5. Rollback

1. Bajar el stack: `docker compose down` (sin `-v`; conserva datos).
2. Desinstalar Docker Desktop:
   `"C:\Program Files\Docker\Docker\Docker Desktop.exe" uninstall` (o el instalador con `uninstall --quiet`).
3. Deshabilitar features (opcional, requiere admin y reinicio):
   `dism /online /disable-feature /featurename:VirtualMachinePlatform /norestart`
   `dism /online /disable-feature /featurename:Microsoft-Windows-Subsystem-Linux /norestart`
4. La ruta Vagrant (`vm/`) sigue disponible como plan B, sin cambios.
5. El `.env` original está en `.env.bak.20261022-113212`. Los datos del stack viven en `data/` y no se tocaron.

## 6. Pendientes explícitos (no bloquean F0)

- **Pin de imágenes**: hoy `aiostreams:latest` y `caddy:latest`; digests registrados arriba. Se pinnea en F5 junto con backup/restore.
- **CA en clientes**: el host valida la cadena con OpenSSL; la CA todavía no está instalada en el store de Windows ni en celulares/TV. Es parte de F3 (y se reemplaza por Tailscale cert en F4 si se valida remoto).
- **`.env` 644**: en NTFS/DrvFs los permisos POSIX no aplican; el archivo está fuera de git y el backup también. Se puede endurecer con ACL de Windows más adelante.
- **Sin segundo dispositivo**: la prueba LAN desde otro equipo/persona es F3.

## 7. Próximo paso

F1: cargar la clave de TorBox por archivo local seguro (`.secrets/torbox.key`, ignorado por git), configurar el servicio en AIOStreams y ejecutar la matriz VOD E2E. La clave no se pega en el chat ni se imprime en logs.
