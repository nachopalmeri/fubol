# 09 — Etapa A: implementación, correcciones y validación

> Estado global: **PARCIALMENTE VALIDADO**.
> Todo lo que puede probarse sin Docker/VirtualBox/TorBox/dispositivos físicos **fue ejecutado**
> (setup.sh, migración de `.env`, validación de Compose en los 4 modos de perfil, Caddy real con
> emisión de certificado y HTTPS verificado, escaneo de secretos). Lo que depende de runtime real
> queda listado como pendiente con su plan exacto de prueba (§6, §7).
>
> `audit/01`–`audit/08` no fueron modificados.

---

## 0. Alcance y reglas respetadas

- Solo Etapa A: núcleo mínimo reproducible, seguro y accesible en LAN.
- No se intentaron los 67 hallazgos: se corrigieron los 5 P0 y los P1 de seguridad/operación
  que bloqueaban el arranque o la exposición de datos (§4).
- Sin puertos públicos a Internet, sin túneles (Cloudflare/Tailscale/VPS queda para Etapa B).
- Sin reescritura de arquitectura: AIOStreams sigue siendo el orquestador/proxy;
  la clave de TorBox sigue viviendo solo en el servidor.
- Nada commiteado ni pusheado. El `.env` real no fue modificado por el agente
  (lo migra `setup.sh` cuando el usuario lo ejecuta).

---

## 1. Entorno de validación (qué se pudo ejecutar y qué no)

| Recurso | Estado en esta máquina | Consecuencia |
|---|---|---|
| Docker / Docker Desktop | **No instalado** | No hay arranque real de contenedores |
| Vagrant / VirtualBox / WSL | **No instalados** | No hay VM ni provisión real |
| `docker-compose.exe` v5.6.1 (standalone) | Disponible (tools de auditoría) | Validación real de Compose por perfiles |
| `caddy.exe` v2.11.7 | Disponible | Prueba real del Caddyfile nuevo, TLS, redirect |
| Node v26.9.0 | Disponible | Stubs para simular AIOStreams/MediaFusion |
| Git Bash (bash, sed, awk, openssl, curl-schannel) | Disponible | Ejecución real de `setup.sh` y scripts |
| Clave de TorBox | No disponible | Pruebas autenticadas de debrid imposibles |
| TV / celular / segunda PC | No disponibles | Trust de CA y streaming por dispositivo: pendientes |

Conclusión honesta: **ninguna prueba de streaming end-to-end ni de contenedores corriendo puede
declararse pasada**. Lo que se declara PASÓ se probó de verdad con las herramientas listadas;
lo demás está en §6/§7 con estado "pendiente" y cómo probarlo.

---

## 2. Reproducción fresca de los 5 P0 (antes de tocar código)

| # | Hallazgo | Método de reproducción usado en esta sesión | Resultado |
|---|---|---|---|
| 1 | OPS-01 — `/vagrant` apunta a `vm/`, no hay compose ahí | Semántica de Vagrant: el synced folder por defecto monta el directorio **que contiene el Vagrantfile**; este está en `vm/`. Además el `provision.sh` original ocultaba errores (`2>/dev/null \|\| true`) y `docker compose up -d` corría en un directorio sin `docker-compose.yml`. Auditoría previa: `setup.sh` moría en `line 93: EOF: command not found`, `EXIT=127`, y el `chmod` final nunca corría. | Confirmado (semántica de configuración; verificado que `vm/` no contiene `docker-compose.yml`) |
| 2 | OPS-02 — Caddy `:443` + `tls internal` sin certificado | Ejecución real con `caddy.exe` sobre el Caddyfile viejo: `curl -k https://localhost/` → `http_code=000`, `curl: (35) schannel: SEC_E_ILLEGAL_MESSAGE`. Log de Caddy: **ningún** mensaje de emisión ("certificate obtained") porque un sitio catch-all `:443` no pide certificado. | **Reproducido en runtime** |
| 3 | OPS-03 — Unbound con directorio vacío montado | Verificación en fuente: `1.22.0/data/unbound.sh` genera `unbound.conf` solo si no existe, y ese archivo **incluye** `a-records.conf`, `srv-records.conf`, `forward-records.conf`; el entrypoint además crea `var/` y ejecuta `unbound-anchor`. Montar el directorio vacío oculta los 3 include files → `cannot open include file` al arrancar. | Confirmado a nivel fuente (runtime pendiente de Docker) |
| 4 | OPS-04 — healthcheck de AIOStreams contra `/health` | Fuentes: `Dockerfile` → `HEALTHCHECK CMD ["/nodejs/bin/node", "/app/scripts/healthcheck.js"]` → `GET /api/v1/status`. Rutas reales del servidor (`app.ts`): `/api/v1/health` y `/api/v1/status`; `/health` **no existe** (404). El override del compose apuntaba a la ruta inexistente. | Confirmado a nivel fuente |
| 5 | ARCH-01 — URLs hardcodeadas a `192.168.56.10` (host-only) | `.env`, `.env.example`, `setup.sh` y README usaban `http://192.168.56.10:3000/8000`; con `private_network` esa IP solo la ve el host: TV y celulares nunca alcanzan los manifests. | Confirmado (config; `compose config` post-fix resuelve `BASE_URL: https://<SERVER_HOST>`) |

Extra: los forwarded ports de Vagrant **sí** quedaban expuestos en las interfaces del host,
pero las URLs generadas apuntaban a la IP host-only — la TV resuelve el nombre contra una red
que no tiene nada que ver. La corrección real es la red bridged (§4, ARCH-01).

---

## 3. Archivos modificados / agregados

| Archivo | Tipo | Resumen |
|---|---|---|
| `docker-compose.yml` | modificado | Perfiles `sports`/`dns`, healthchecks corregidos, puertos revisados, auth y secretos vía `.env`, sin defaults `changeme`; límites de logging (`x-logging`, 10m×3) en los 11 servicios; guards `:?` también en las 3 passwords de perfiles opcionales |
| `setup.sh` | reescrito | Genera/migra `.env`, detecta `SERVER_HOST` (excluye docker/veth/VirtualBox/WSL), crea `config/mediafusion.env`, valida compose, no imprime secretos; dirs de datos 755; normaliza CRLF de `.env` y recorta `\r` en lecturas (T-A20) |
| `config/Caddyfile` | reescrito | Sitios nombrados `https://{$SERVER_HOST}` y `:8443`; TLS interno; redirect automático |
| `config/unbound/a-records.conf`, `srv-records.conf`, `forward-records.conf` | nuevos | Archivos individuales que sí existen para el entrypoint de Unbound (reenvío explícito a Cloudflare, con nota de recursión) |
| `vm/Vagrantfile` | modificado | `synced_folder ".." → /vagrant`; red bridged (`public_network`); fallback comentado documentado |
| `vm/provision.sh` | reescrito | Libera puerto 53, falla fuerte si falta el compose, ejecuta `setup.sh` sin ocultar errores, `up -d --wait`, resumen con URLs; plan B de `SERVER_HOST` arreglado (ya no es código muerto): error claro si sigue sin IP y aviso si no es IP de la VM |
| `.env.example` | reescrito | Esquema nuevo documentado (sin valores `changeme`, sin IPs hardcodeadas) |
| `.gitignore` | modificado | Elimina línea basura; agrega `.env.bak.*` y `config/mediafusion.env` |
| `README.md` | reescrito (contenido preservado y corregido) | URLs reales, formato de manifest correcto, perfiles, CA interna, rotación, checklist; afirmaciones TorBox corregidas (DOC-03/04/05), sin estimaciones no medidas (DOC-12); orden setup.sh/Vagrant aclarado (Opción A no lo corre en el host); delay unificado; ruta de Prowlarr corregida |
| `docs/WIRING.md` | reescrito | Pasos post-install con URLs nuevas; elimina línea basura `'@ \| Set-Content` |
| `docs/ARCHITECTURE.md` | reescrito | Diagrama y puertos reales; Unbound honesto (reenvío); afirmaciones TorBox corregidas (DOC-04/05); elimina línea basura |
| `docs/LEGAL.md` | corregido | DOC-04: compartir cuenta/API key permitido por TorBox; elimina línea basura |
| `docs/COMO_FUNCIONAN.md` | corregido (mínimo) | Elimina línea basura + unifica MediaFusion a 6.0.0 (DOC-02) y quita mención `mkcert` inexistente; resto del contenido intacto (permanencia en repo público: decisión del usuario, SEC-10) |
| `config/stremio-addons.md` | reescrito | DOC-13: MediaFusion ya no figura como "despliegue separado" (perfil `sports`); manifest real `uuid/password`; elimina línea basura |
| `privacy/README.md` | reescrito | `unbound#53` (no 5335), password real, recursión honesta |
| `scripts/stage-a-check.sh` | nuevo | Smoke test de solo lectura para la VM con Docker; el chequeo de login puede fallar (`/api/v1/auth/me`) y ya no da falso PASS si falta `.env` |
| `scripts/cleanup-test-cas.ps1` | nuevo | Limpia las 3 CAs de prueba del store de Windows (§9) |
| `audit/09_STAGE_A_IMPLEMENTATION.md` | nuevo | Este documento |

Sin cambios: `audit/01`–`08` y el `.env` real (secretos del usuario).
`docs/COMO_FUNCIONAN.md` conserva su contenido (solo se quitó la línea basura); su permanencia en un
repo público sigue pendiente de decisión del usuario (SEC-10).

---

## 4. Correcciones aplicadas (causa → fix → evidencia)

### P0

**OPS-01 — Compose no encontrado + errores ocultos**
- Fix: `vm/Vagrantfile`: `config.vm.synced_folder "..", "/vagrant"` (monta la raíz del repo).
  `vm/provision.sh`: valida `[ -f /vagrant/docker-compose.yml ]` y **aborta con mensaje** si no
  está; ejecuta `bash setup.sh` sin `|| true`; `docker compose up -d` corre desde `/vagrant`.
- Evidencia: `bash -n` OK; el diseño se refleja en §5 T-A05 (compose valida con `--project-directory` raíz).

**OPS-02 — HTTPS sin certificado (catch-all + `tls internal`)**
- Fix: `config/Caddyfile` ahora define sitios **nombrados**:
  `https://{$SERVER_HOST}` (AIOStreams) y `https://{$SERVER_HOST}:8443` (MediaFusion).
  Caddy pide certificado para un host concreto y activa el redirect HTTP→HTTPS automático.
- Evidencia (runtime real, `caddy.exe` v2.11.7 + stubs):
  - Log: `"certificate obtained successfully","identifier":"127.0.0.1","issuer":"local"`.
  - `curl --cacert root.crt https://127.0.0.1/api/v1/status` → `200 {"success":true...}`.
  - `curl http://127.0.0.1/` → `308` a `https://127.0.0.1/`; cadena completa con `-L` → 200.
  - `openssl s_client ... -CAfile root.crt` → `Verify return code: 0 (ok)`, SAN `IP Address:127.0.0.1`.
- Hallazgo adicional del test: `caddy validate` **pasa** aunque `SERVER_HOST` esté vacío
  (degrada al catch-all viejo). Se agregó una segunda barrera en el compose:
  healthcheck `CMD-SHELL test -n "$$SERVER_HOST" && caddy validate ...`
  (el `$$` evita la interpolación de Compose; el chequeo corre dentro del contenedor).

**OPS-03 — Unbound crash-loop por montaje de directorio vacío**
- Fix: montar **solo los 3 archivos** (`a-records.conf`, `srv-records.conf`,
  `forward-records.conf`), nunca el directorio. Se agregaron los archivos al repo con contenido válido.
- Evidencia: fuente de la imagen (include paths idénticos a los montados, `var/` y `dev/` los crea
  el entrypoint); `docker-compose config --profile dns` → exit 0. Runtime pendiente (§7).

**OPS-04 — Healthcheck contra ruta inexistente**
- Fix: se **eliminó** el override; el contenedor hereda el `HEALTHCHECK` oficial de la imagen
  (`GET /api/v1/status`), mantenido por upstream.
- Evidencia: Dockerfile de AIOStreams (líneas 146–147) y `scripts/healthcheck.js`;
  rutas reales en `packages/server/src/app.ts` (`/api/v1/health`, `/api/v1/status`; `/health` no existe).
- Efecto: `caddy` depende de `aiostreams: service_healthy` y ahora ese healthy es real.

**ARCH-01 — IP host-only como URL pública**
- Fix: `SERVER_HOST` es la única fuente de verdad. `setup.sh` la detecta (LAN privada, ignora
  127/169.254 y la NAT de Vagrant `10.0.2.x`), con fallback PowerShell en Git Bash; si no puede,
  escribe `CHANGE_ME` y **sale con error 1** pidiendo edición manual. Compose deriva
  `BASE_URL=https://${SERVER_HOST}` y el Caddyfile usa `{$SERVER_HOST}`. El `Vagrantfile` usa red
  bridged para que la VM tenga IP del router.
- Evidencia: `compose config` resuelve `BASE_URL: https://192.168.0.x` (IP detectada de esta máquina
  en el test) y falla con mensaje claro si el valor falta (`REAL_ENV_EXIT=1`, ver T-A06).

### P1 (seguridad / operación)

| Hallazgo | Fix aplicado | Evidencia |
|---|---|---|
| SEC-01 panel sin auth | `AIOSTREAMS_AUTH` obligatoria (`${...:?}`), generada por `setup.sh` (usuario `admin`) | Compose falla sin ella; `stage-a-check.sh` verifica el formato |
| SEC-02 `changeme` | Eliminados todos los defaults. `setup.sh` reemplaza `changeme`/vacíos por aleatorios y conserva los válidos | Migración: `changeme_left=0`, `API_PASSWORD_regenerated=yes` |
| SEC-03 Pi-hole v6 con env viejo | `FTLCONF_webserver_api_password`, `FTLCONF_dns_listeningMode: ALL`, `FTLCONF_dns_upstreams: unbound#53` | `compose config --profile dns` OK |
| SEC-04 secretos compartidos | `SECRET_KEY_MF` separada; AIOStreams ya no recibe `env_file: .env` (solo las variables que necesita); MediaFusion recibe `config/mediafusion.env` generado | `docker-compose.yml` (líneas de `environment`/`env_file`); `.gitignore` con `config/mediafusion.env` |
| SEC-06 `.env` legible | `umask 077` + `chmod 600` (con guard para filesystems sincronizados); `.env.bak.*` en `.gitignore` | Test: modo 600 en el flujo Linux; en Git Bash/NTFS el permiso lo maneja Windows (documentado) |
| SEC-08 puertos internos expuestos | Prowlarr `127.0.0.1:9696`, MediaFlow `127.0.0.1:8888`, Unbound `127.0.0.1:5335`; Postgres/Redis/TRAWL sin publicar | `compose config` (puertos resueltos) |
| SEC-09 TLS no confiable | CA interna de Caddy instalable; documentada por plataforma en README Paso 8 | `openssl Verify return code: 0 (ok)` con `--cacert` |
| OPS-05 upstream Pi-hole roto (`unbound#5335`) | `FTLCONF_dns_upstreams: unbound#53` (nombre interno Docker) | Docs corregidos (WIRING, privacy, README) |
| OPS-07 service_healthy falso / OPS-11 healthcheck MediaFlow con curl inexistente | MediaFlow ahora usa `python -c urllib...` (imagen `python:3.14-slim`, verificado en Dockerfile); MediaFusion conserva `curl -f /health` (verificado: su imagen instala curl explícitamente) | Fuentes de ambas imágenes (§1 checks) |
| STR-01 manifest URL incorrecto en docs | Formato real verificado en fuente: `/stremio/:uuid/:encryptedPassword/manifest.json` (`app.ts`) reproducido en README/WIRING | `compose config` + docs |
| STR-02/03 URLs de proxy | README/WIRING con `http://mediaflow-proxy:8888` (interno) y puerto local `127.0.0.1:8888` | Docs |

No corregido en esta etapa (con justificación): **SEC-10** (repo público + `docs/COMO_FUNCIONAN.md`),
decisión del usuario (hacer privado el repo / mover o eliminar el documento); **pinning de tags
`latest`** (OPS-08): requiere runtime real para no romper versiones a ciegas; queda como pendiente
explícito (§8); **Unbound sin recursión**: se reenvía a Cloudflare por defecto (documentado y honesto),
la recursión pura queda a un paso en `config/unbound/forward-records.conf`.

---

## 5. Pruebas ejecutadas (evidencia real, no inspección)

Copia de trabajo: `D:\Dev\temp\opencode\stage-a-tests\repo` (nunca se tocó el `.env` real del repo).

| ID | Prueba | Comando (resumen) | Resultado |
|---|---|---|---|
| T-A01 | Sintaxis de los 3 scripts | `bash -n setup.sh / provision.sh / stage-a-check.sh` | EXIT=0 los tres |
| T-A02 | `setup.sh` desde cero (sin `.env`) | `bash setup.sh` en copia limpia | Crea `.env`, detecta la IP LAN local (192.168.0.x), genera los 7 secretos (32/16 bytes), crea `config/mediafusion.env`, 10 dirs de datos, `legacy_keys_left=0`, `changeme_count=0` |
| T-A03 | Migración de `.env` viejo (IP host-only + `changeme`) | `.env` fake antiguo + `bash setup.sh` | `backups_created=1`, `SECRET_KEY` y `SECRET_KEY_MF` **preservados**, `API_PASSWORD` regenerada, `MEDIAFUSION_DB_PASSWORD` agregada, claves viejas eliminadas |
| T-A04 | Idempotencia | `bash setup.sh` 2ª vez | EXIT=0; todos los secretos "ya definido, se conserva" |
| T-A05 | Compose válido en 4 modos | `docker-compose config --quiet` (core / `--profile sports` / `--profile dns` / ambas) | EXIT=0 ×4 |
| T-A06 | Guardas de variables obligatorias | `compose config` sin `.env` y con el `.env` **real sin migrar** | EXIT=1 con mensaje explícito `Falta SERVER_HOST/SECRET_KEY/AIOSTREAMS_AUTH ... corre bash setup.sh` (falla a propósito; sin defaults silenciosos) |
| T-A07 | Derivación de URL pública | `compose config` (grep) | `BASE_URL: https://192.168.0.x`, `SERVER_HOST: 192.168.0.x` |
| T-A08 | Caddy real: emisión + HTTPS + redirect + 8443 | `caddy.exe run` con Caddyfile nuevo (upstreams → stubs Node) | Cert emitido para `127.0.0.1`; `https://127.0.0.1/api/v1/status` → 200 con `--cacert`; `http://` → 308; `-L` → 200; `:8443/health` → 200; `openssl`: `Verify return code: 0 (ok)`, SAN IP |
| T-A09 | `caddy validate` como healthcheck | con y sin `SERVER_HOST` en entorno | **Lección**: validate pasa con variable vacía → se endureció el healthcheck (`test -n "$SERVER_HOST"`) |
| T-A10 | Escaneo de secretos del repo | regex hex ≥40, `changeme`, IP de la máquina de test | 0 hex sospechosos; `changeme` solo dentro de lógica de detección/tests; IP de test no aparece en el repo |
| T-A11 | Estado de git | `git status --porcelain` | Solo modificaciones intencionales + `?? audit/ config/unbound/ scripts/`; sin commits; `.env` sin trackear e intacto |

### Plan de pruebas A–J (del pedido original) — estado

| Test | Qué verifica | Estado |
|---|---|---|
| A | `setup.sh` fresh + migración + idempotencia | ✅ **Ejecutado** (T-A02/03/04) |
| B | Compose válido por perfiles + guardas de secretos | ✅ **Ejecutado** (T-A05/06/07) |
| C | Núcleo arriba: `aiostreams` y `caddy` `healthy` | ⏳ Pendiente (requiere Docker) — `docker compose up -d` + `scripts/stage-a-check.sh` |
| D | Panel pide login en LAN (sin acceso anónimo) | ⏳ Pendiente (Docker) — T-A08 cubrió el TLS; falta el contenedor real |
| E | HTTPS LAN con CA instalada en otro dispositivo | ⏳ Pendiente (segunda PC/celular) |
| F | Redirect HTTP→HTTPS y 8443 | ✅ Núcleo **ejecutado** con Caddy real (T-A08); validación dentro de contenedor pendiente |
| G | Instalar manifest en Stremio desde 2º equipo | ⏳ Pendiente (dispositivos + CA instalada) |
| H | Reproducción de stream cacheado con TorBox | ⏳ Pendiente (clave TorBox + Docker) |
| I | Perfil `sports` (MediaFusion) accesible por 8443 | ⏳ Pendiente (Docker) — Caddy lado proxy ya probado |
| J | Perfil `dns` (Pi-hole/Unbound) resolviendo en la LAN | ⏳ Pendiente (Docker + puerto 53 libre) |

---

## 6. Pruebas pendientes: cómo completarlas (sin ambigüedad)

En la máquina que tenga Docker (VM recomendada):

```bash
# 1) Provisionar / actualizar
cd vm && vagrant up          # o: docker compose up -d  en la raíz

# 2) Smoke test de Etapa A (solo lectura)
bash scripts/stage-a-check.sh

# 3) Manuales
docker compose ps                                   # C: healthy en aiostreams y caddy
curl -s -o /dev/null -w '%{http_code}\n' http://<IP>:3000/   # D: no debe servir el panel abierto
```

- **C/D/F**: `stage-a-check.sh` + abrir `http://<IP>:3000` y verificar login.
- **E/G**: copiar `data/caddy/caddy/pki/authorities/local/root.crt`, instalar en el 2º equipo (§10), y
  probar `https://<IP>/api/v1/status`; luego instalar el manifest en Stremio (§11).
- **H**: en el panel, cargar la API key de TorBox y reproducir una película popular (stream cached).
- **I**: `docker compose --profile sports up -d`; `https://<IP>:8443/health` y `/configure`.
- **J**: `docker compose --profile dns up -d`; `dig @<IP> google.com` desde otro equipo.
- **D-bis**: abrir `http://<IP>:3000/stremio/configure` sin login: si queda pública y molesta, definir el flag de auth de AIOStreams (nombre real a confirmar en runtime).
- **I-bis**: en los logs de `sports`, confirmar si MediaFusion 6.0.0 usa `TRAWL_URL`/`STREAM_RS_PORT`; si no, sacar `trawl` del perfil y de docs.
- Nota: `docker compose --profile sports up -d` en un clon limpio falla hasta correr `setup.sh` (genera `config/mediafusion.env`): es esperado.

---

## 7. Por qué no se pudo más (límites reales)

- Esta máquina de desarrollo no tiene Docker, VirtualBox, Vagrant ni WSL: no hay forma honesta de
  declarar "contenedores healthy" o "playback OK".
- Sin clave de TorBox no hay prueba de debrid.
- Sin dispositivos no hay prueba de trust de CA ni de instalación de addon en Stremio.
- Las imágenes se validaron a nivel fuente (Dockerfiles y entrypoints), que es verificación
  estática — se declara como tal, no como prueba de runtime.

---

## 8. Riesgos restantes y decisiones pendientes del usuario

1. **SEC-10 (repo público)**: el repositorio es público y `docs/COMO_FUNCIONAN.md` describe el
   funcionamiento de sitios de streaming no autorizados. Decisión pendiente: repo privado y/o
   mover/eliminar ese documento. No se tocó.
2. **CA de Caddy instalada en esta máquina de test**: las corridas de prueba instalaron 3 CA
   "Caddy Local Authority - 2026 ECC Root" en el store del usuario de Windows (las elimina el
   propio Caddy por diseño al arrancar con `tls internal`; la eliminación automática requiere
   confirmación interactiva). Thumbprints y limpieza en §9. En el servidor real esto no pasa:
   la CA vive solo dentro del contenedor y se distribuye a los clientes a mano.
3. **Rotación recomendada por higiene de sesión**: `SECRET_KEY` de AIOStreams (su valor pasó por
   salida de terminal en la etapa de auditoría). Procedimiento en §12; después cargar de nuevo la
   API key de TorBox en el panel cuando toque.
4. **Rotación de la API key de TorBox**: recomendable re-generarla en torbox.app y cargar la nueva
   en AIOStreams (una sola vez, procedimiento en §12).
5. **Tags `latest`** (OPS-08): siguen sin pin. Pinchar versiones a ciegas sin runtime puede romper
   más de lo que arregla; queda para después de la primera puesta en marcha real.
6. **TVs que no aceptan CAs de usuario** (ej. Samsung/LG): para esos casos el addon HTTPS requiere
   certificado público → Etapa B (DNS-01 con dominio, sin túneles). Documentado en README.
7. **`MEDIAFUSION_DB_PASSWORD` post-inicialización**: Postgres solo aplica la password al crear el
   volumen; si ya existe `data/postgres/`, hay que rotarla también dentro de Postgres (§12).
8. **Perfil `sports`**: el healthcheck de MediaFusion (`/health`) y el ciclo completo de scraping
   quedan por confirmar en runtime real (fuente verificada, runtime pendiente).
9. **`/stremio/configure`** puede ser pública según la versión/flag de auth de AIOStreams: verificar en runtime (§6, D-bis).
10. **Pi-hole + Unbound**: `depends_on: service_healthy` solo aplica al arranque; un `docker restart pihole` con unbound caído puede hacer fallar dnsmasq (upstream `unbound#53`).
11. **`TRAWL_URL`/`STREAM_RS_PORT`** no figuran en el sample de MediaFusion 6.0.0: confirmar en runtime si `trawl` aporta (§6, I-bis).

---

## 9. Limpieza de artefactos de test en esta máquina (Windows)

Estas 3 CA fueron agregadas al store del usuario por las pruebas con `caddy.exe` (fechas 21/10/2026).
**Las claves privadas de esas CA ya fueron eliminadas** (`AppData\Roaming\Caddy\pki` y el data-dir
temporal del test), así que las entradas que queden en el store son inertes: no pueden firmar nada.
Aun así, conviene borrarlas (requiere terminal interactiva en tu sesión de Windows, porque Windows
pide confirmación):

```
certutil -user -delstore Root c38ffddc8f2097257d1982958d2e5f8f7ac44cf7
certutil -user -delstore Root 83dce5e390bc7a64600338a91ca951a8c8d6549f
certutil -user -delstore Root 19ed672ba1d8b055fa42b0801cf2bd24c72089fb
```

Alternativa GUI: `certmgr.msc` → Entidades de certificación raíz de confianza → Certificados →
borrar las entradas "Caddy Local Authority - 2026 ECC Root" (3).

---

## 10. Acceso desde una segunda computadora (guía)

1. En el servidor: `SERVER_HOST` ya está en `.env` (lo puso `setup.sh` o vos a mano).
2. Copiar la CA interna desde el servidor: `data/caddy/caddy/pki/authorities/local/root.crt`.
3. Instalarla en la 2ª PC:
   - Windows: doble clic → Instalar certificado → **Usuario actual** → "Autoridades de
     certificación raíz de confianza" → Aceptar.
   - Linux (Debian/Ubuntu): `sudo cp root.crt /usr/local/share/ca-certificates/caddy-local.crt && sudo update-ca-certificates`
   - macOS: doble clic en Llavero → Sistema → confiar siempre.
4. Verificar: abrir `https://<SERVER_HOST>/api/v1/status` → debe responder `{"success":true,...}`
   sin aviso de certificado. Y `http://<SERVER_HOST>/` debe redirigir a HTTPS.
5. Panel: `http://<SERVER_HOST>:3000` (o `https://<SERVER_HOST>`) → login `admin` + password de `.env`.
6. Para ver contenido: instalar el manifest personal en Stremio:
   `https://<SERVER_HOST>/stremio/<uuid>/<password>/manifest.json`
   (el de cada usuario se copia del panel; nunca la API key de TorBox).

## 11. Primera prueba en TV (guía)

Antes de empezar: la TV debe estar en la misma red que el servidor (si el servidor es una VM,
red bridged).

1. Instalar Stremio en la TV (Android TV: Play Store; Fire TV: Amazon Appstore/Aptoide;
   Samsung/LG: **no** hay app oficial de Stremio → usar Nuvio o un stick Android).
2. Instalar la CA del servidor:
   - Android TV: Ajustes → Seguridad → Cifrado y credenciales → Instalar certificado →
     "Certificado de CA" (copiar `root.crt` por USB o descargarlo de `http://<IP>:3000` no aplica:
     usá USB, o el navegador de la TV y descargar desde una URL LAN temporal que definas).
   - Fire TV: Ajustes → Mi Fire TV → Desarrollador → instalar certificado, o vía USB.
3. Abrir Stremio → Addons → "Install via URL" → pegar
   `https://<SERVER_HOST>/stremio/<uuid>/<password>/manifest.json` → instalar.
4. Probar: película popular → elegir stream "cached" → debe reproducir rápido.
5. Subtítulos: instalar Subtitle Sync en el mismo cliente (Paso 5 del README).
6. Si la TV no permite instalar la CA: el addon no se podrá instalar (Stremio exige HTTPS).
   Opciones: usar un Chromecast/Android TV con CA instalable, o esperar Etapa B (certificado público).

---

## 12. Rotación de credenciales (procedimiento, sin imprimir valores)

1. Editar `.env`: borrar el valor a rotar (dejar `CLAVE=`).
2. `bash setup.sh` → genera un reemplazo aleatorio sin imprimirlo; actualiza `config/mediafusion.env`.
3. `docker compose up -d` → recrea los contenedores afectados.
4. Secuelas por clave:
   - `AIOSTREAMS_AUTH`: el panel pide la password nueva (nada más).
   - `SECRET_KEY` (AIOStreams): las credenciales cifradas viejas dejan de leerse → volver a entrar
     al panel y cargar de nuevo la API key de TorBox.
   - `SECRET_KEY_MF` / `API_PASSWORD` (MediaFusion): los usuarios del panel vuelven a loguearse.
   - `MEDIAFUSION_DB_PASSWORD`: además, si `data/postgres/` ya existe:
     `docker exec -it postgres psql -U mediafusion -c "ALTER USER mediafusion PASSWORD '<nueva>';"`
   - `PIHOLE_WEBPASSWORD`: se aplica al recrear el contenedor (v6 `FTLCONF_`).
5. Nunca pegar valores en chats, issues o logs.
6. Rotación de API key de TorBox: torbox.app → regenerar → AIOStreams → Services → pegar → Save.

---

## 13. Comandos exactos de arranque (resumen ejecutivo)

```bash
# 0) Solo Opción B (sin VM), en la raíz del repo:
bash setup.sh                 # crea/migra .env, detecta IP, valida compose

# 1) Opción VM (el provision corre setup.sh DENTRO de la VM: no lo corras en el host):
cd vm && vagrant up           # bridged: elegir la interfaz Wi-Fi/Ethernet cuando pregunte

# 1-bis) Opción sin VM (Docker Desktop/Linux):
docker compose up -d

# 2) Verificar:
docker compose ps
bash scripts/stage-a-check.sh

# 3) Perfiles opcionales:
docker compose --profile sports up -d
docker compose --profile dns up -d
```

---

## 14. Cobertura de clientes (browser/PC/TV) sin reproductor propio

Verificado contra la documentación/fuentes actuales de Stremio y AIOStreams:

- **PC/Mac/Linux**: Stremio desktop instala addons HTTPS (requiere CA confiada) o navegador directo al
  panel. Cubierto sin software propio.
- **Móvil**: Stremio app (Android/iOS) mismo flujo de manifest HTTPS.
- **TV**: Android TV / Fire TV vía Stremio o Nuvio (Android) — limitación de trust de CA en algunas
  plataformas (documentada en §8.6 y §11.6).
- **Navegador**: el panel de AIOStreams es web; la reproducción la hace Stremio (o VLC externo según
  plataforma). No se construyó ningún reproductor: ese es el diseño aprobado.

---

## 15. Honestidad de estado (resumen)

- **Ejecutado y verificado**: T-A01..T-A15 (§5 y §16).
- **Pendiente por entorno**: A–J restantes (§5/§6) — requieren Docker/VM/dispositivos/TorBox.
- **Veredicto Etapa A**: **PARCIALMENTE VALIDADO**. El núcleo está implementado y todo lo verificable
  sin runtime real pasa; la validación total queda agendada en la máquina con Docker.

---

## 16. Revisión de regresión A1–A10 (cierre del ciclo)

Se recorrió `audit/08` §2 (A1–A10) y `audit/07` §4.b/§5 contra los cambios aplicados, para confirmar
el mapa hallazgo → fix y cerrar lo que aún era corregible sin runtime.

| Ítem | Hallazgos | Estado | Nota |
|---|---|---|---|
| A1 | OPS-01 | Implementado; aceptación de runtime pendiente | `synced_folder ".." → /vagrant`; provision falla fuerte si falta el compose |
| A2 | ARCH-01 | Implementado; aceptación con dispositivos pendiente | Red bridged; 3000 accesible en LAN (con auth); sin puertos hacia WAN |
| A3 | OPS-03 | Implementado (variante elegida) | Unbound opcional (perfil `dns`) con los 3 `*-records.conf`; desvío justificado del plan: se mantiene reenvío a Cloudflare y la recursión queda documentada como opt-in |
| A4 | OPS-04 | Cerrado | Sin healthcheck propio; hereda el de la imagen |
| A5 | OPS-02, SEC-09 | Etapa A cerrada (sitio nombrado + CA interna) | Prueba real de TLS/redirect/8443 ejecutada (T-A08); decisión de túnel queda para Etapa B |
| A6 | SEC-03, OPS-05, OPS-06 | Cerrado | `FTLCONF_*`, upstream `unbound#53`, la provisión libera el puerto 53; pin de versión Pi-hole dentro de OPS-08 (diferido) |
| A7 | SEC-01/02/04/08 | Cerrado offline; rotación de key TorBox = acción del usuario (§12) | Login obligatorio, secretos aleatorios, `chmod 600`, Prowlarr no publicado (auth de la app: paso manual documentado) |
| A8 | STR-01/02, DOC-10 | Cerrado | Formato de manifest real en README/WIRING/`config/stremio-addons.md`; MediaFusion HTTPS por 8443; etiquetas de UI descritas sin afirmar texto exacto |
| A9 | Smoke test | Operacionalizado (`scripts/stage-a-check.sh`); ejecución real pendiente | Cubre compose ps/logs, healthchecks, CA, manifest |
| A10 | DOC-01..13, OPS-08/11/13 | DOC-01 completo (6/6); DOC-02..07 y DOC-09..13 corregidos; OPS-11/13 hechos; logging agregado; OPS-08 (pin de `latest`) diferido | `git grep "Set-Content"` → 0; DOC-08 (contenido de COMO_FUNCIONAN) = decisión del usuario |

Pruebas nuevas de este ciclo:

- **T-A12**: `git grep -n "Set-Content"` excluyendo `audit/` → 0 resultados (DOC-01 6/6).
- **T-A13**: `docker-compose.exe config -q` en core / sports / dns / sports+dns → exit 0 con el compose nuevo (logging).
- **T-A14**: `config` renderiza límites de logging en los 11 servicios (12 bloques `max-size` = 11 servicios + campo de extensión `x-logging`).
- **T-A15**: sin `.env` → compose falla con "Falta SERVER_HOST/SECRET_KEY/AIOSTREAMS_AUTH" (re-verificación negativa del guard).

Correcciones de inexactitudes documentales de este ciclo (DOC-03/04/05/12):

- Slots de TorBox = descargas activas concurrentes; los títulos cacheados no consumen slot.
- Compartir cuenta/API key está permitido por TorBox; el riesgo real a cuidar es el abuso de ancho de banda.
- Se eliminó la afirmación "todo el tráfico sale de una sola IP" (TorBox permite multi-IP; los streams los sirve TorBox directo a cada dispositivo; la API key queda en el servidor).
- Se quitó la estimación no medida "5–10 min" de `vagrant up` (DOC-12).

---

## 17. Cierre con revisión multiagente (código + docs + verificación)

Pre-commit, con tres revisiones independientes sobre el árbol de trabajo: reviewer
(código/config), explorador (docs vs implementación) y verificador (batería offline repetida
desde cero). Nota de provider: el pin `opencode/muse-spark-1.3-contributor-free` de los agentes
fast/balanced no estaba disponible; los reintentos corrieron con `opencode/deepseek-v4.1-flash-free`
(gratuito verificado). Reportado sin ampliar permisos.

### Hallazgos corregidos en este cierre

| Origen | Hallazgo | Fix |
|---|---|---|
| reviewer P1 | El "Plan B" de `SERVER_HOST` en `vm/provision.sh` era código muerto: `setup.sh` sale 1 con `CHANGE_ME` y `set -e` abortaba antes del fallback | `setup.sh \|\| aviso` + plan B + doble check: error claro si sigue sin IP; aviso (sin pisar) si `SERVER_HOST` no es IP de la VM |
| reviewer P2 | `MEDIAFUSION_DB_PASSWORD`, `MEDIAFLOW_API_PASSWORD`, `PIHOLE_WEBPASSWORD` usaban `${VAR:-}` (posible vacío) | Ahora `${VAR:?}` como las núcleo: sin passwords vacíos; si faltan, Compose guía a `setup.sh` |
| reviewer P2 | `umask 077` dejaba `data/*` en 700 root (contenedores no-root podrían no escribir) | `chmod 755 data data/*` best-effort; `.env` y `config/mediafusion.env` siguen 600 |
| reviewer P2 | `stage-a-check.sh`: chequeo de login no podía fallar; falso PASS si faltaba `.env` | Probe `/api/v1/auth/me` (ko si 200, ok si 401/403, info si endpoint distinto); `ko` explícito si falta `.env` |
| reviewer P2 | Comentario de `env_set` afirmaba no exponer el valor en `ps` (falso: arg de `awk`) | Comentario honesto (visible en `ps` local durante el setup; `.env` queda 600) |
| reviewer P2 | Detección de IP podía elegir docker0/vbox/WSL | Exclusión por interfaz en `ip` y PowerShell (`setup.sh` y plan B del provision) |
| reviewer P2 | `audit/09` incluía la IP real de la máquina de test | Redactada a `192.168.0.x` |
| reviewer P2 | Panel en `0.0.0.0:3000` por HTTP (cookie no `Secure`) | Nota en README: preferir `https://<IP-LAN>` con CA; el HTTP queda como fallback para clientes sin CA |
| reviewer P2 | `/stremio/configure` puede ser pública según flag de AIOStreams (no verificado en runtime) | Agregado a §6 (D-bis), §8 y checklist del README |
| explorador | README/§13: correr `setup.sh` en el host antes de `vagrant up` fija la IP del host (URLs rotas en la VM) | Docs y §13 aclaran: en Opción A lo corre el provision dentro de la VM |
| explorador | `COMO_FUNCIONAN.md`: MediaFusion `6.1.6` ≠ compose `6.0.0`; mención `mkcert` inexistente | Unificado a `6.0.0`; `mkcert` reemplazado por Caddy/CA interna (DOC-02 completo) |
| explorador | README: delay 30-60s vs 30-90s; ruta Prowlarr `Settings -> Security`; comentario de perfil sports incompleto | Unificado 30-90s; `Settings -> General -> Security`; perfil alineado al compose |
| verificador | `config --profile sports` falla en clon limpio hasta correr `setup.sh` (falta `config/mediafusion.env`) | Esperado: documentado (§6) |
| verificador | `scripts/stage-a-check.sh` untracked | Pendiente del commit (requiere autorización del usuario) |

### Pruebas de este cierre (T-A16..T-A19, ejecutadas)

- **T-A16**: `bash -n setup.sh vm/provision.sh scripts/stage-a-check.sh` → exit 0 ×3.
- **T-A17**: compose `config -q` post-setup ×4 perfiles → exit 0; pre-setup `sports`/`BOTH` fallan solo por `config/mediafusion.env` ausente (esperado); `config --services` = 11, `logging` = 11, ancla = 1.
- **T-A18**: guards nuevos: `.env` sin `PIHOLE_WEBPASSWORD` → falla "Falta PIHOLE_WEBPASSWORD en .env - corre bash setup.sh"; sin `.env` → falla con los 3 mensajes core (sin cambios).
- **T-A19**: `setup.sh` fresco en copia limpia → exit 0 (detecta IP), 10 dirs de datos, `config/mediafusion.env` creado; 2ª corrida idempotente (exit 0); `caddy validate` → "Valid configuration" (exit 0); `stage-a-check.sh` sin Docker degrada con mensajes claros (exit 1) y ya marca `FAIL .env no existe` cuando corresponde.

Verificación independiente (verificador, desde cero): PASS en sintaxis de los 3 scripts, guards de
Compose, higiene git (`.gitignore` cubre `.env` y `config/mediafusion.env`; nada trackeado), `setup.sh`
genera sin imprimir secretos e idempotente (`.env` byte-idéntico en corridas 2..5), parse-check de
PowerShell (0 errores), `caddy validate`, conteos 11/11/1 y degradación clara del smoke test sin Docker.

### Pendientes de runtime que quedan (sin cambiar el veredicto)

`/stremio/configure` (público o no), `TRAWL_URL`/`STREAM_RS_PORT` en MediaFusion 6.0.0, pihole
reiniciado con unbound caído, y las pruebas C–J (Docker/VM/dispositivos/TorBox).

Veredicto sin cambios: **PARCIALMENTE VALIDADO** — todo lo verificable offline volvió a pasar
después de los fixes; la validación total sigue agendada para la máquina con Docker.

### Addendum T-A20: check final del `.env` real (CRLF)

El `.env` real mezcla finales de línea: 13 líneas LF + 2 CRLF (`PIHOLE_WEBPASSWORD` y
`MEDIAFLOW_API_PASSWORD`, ambas con `changeme`; la última línea sin salto final). En Linux (la
VM) GNU sed/awk **no** absorben `\r`: `env_get` devolvía `changeme\r`, la comparación
`[ "$cur" = "changeme" ]` fallaba y esas 2 claves habrían quedado sin reemplazar (igual que
cualquier valor futuro editado con un editor de Windows). En Windows/Git Bash el toolchain
MSYS2 (text mode) ya lo absorbía, por eso el síntoma no aparecía ahí; un lector byte a byte
(Python) confirmó que esas 2 eran exactamente las claves con `\r`. Compose (v5) además recorta
`\r` de `.env` al interpolar (verificado byte a byte: `10`, no `13`) — mitigación extra, no
sustituto del fix.

Fix (causa raíz + defensa en profundidad):
- `env_get()` recorta `\r` (`tr -d '\r'`).
- `[1/6]` normaliza `.env` a LF cuando detecta CRLF (backup previo ya hecho; reescritura
  `awk` + `cp` in-place, segura en carpetas sincronizadas vboxsf).

Verificación T-A20 (sobre copia del `.env` real; el original no se tocó: SHA256
`a3cfa4ef…8502` idéntico antes y después):

- Post-fix: exit 0; generadas `API_PASSWORD`, `MEDIAFUSION_DB_PASSWORD`,
  `MEDIAFLOW_API_PASSWORD`, `PIHOLE_WEBPASSWORD`; creado `AIOSTREAMS_AUTH`; `SERVER_HOST`
  detectado; `SECRET_KEY`/`SECRET_KEY_MF` conservadas; `changeme` = 0; claves legacy = 0;
  10/10 claves con valor; `.env` resultante sin CRLF; backup `.env.bak.*` = 1.
- Compose con ese `.env`: `config -q` core y `sports+dns` → exit 0.
- Caso sintético CRLF (`changeme` en `SECRET_KEY`/`API_PASSWORD`, `TZ=Test/Zone`): reemplazos
  OK, `TZ` conservado sin `\r`, archivo final sin CRLF. `bash -n` → 0.
- Nota honesta: la rama de normalización no se ejercita en Git Bash (MSYS2 text-mode evita el
  match de `grep -q $'\r'`); en la VM se ejercitará en el primer `setup.sh` real. El resto del
  flujo quedó verificado de punta a punta.
- Higiene: no quedan copias de `.env` (ni `mediafusion.env`) en `D:\Dev\temp\opencode`; las
  copias scratch usadas en las pruebas fueron eliminadas.
