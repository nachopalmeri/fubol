# 07 — Test Results

**Fecha:** 21 de octubre de 2026
**Entorno:** Windows (PowerShell), sin Docker, sin VirtualBox, sin Vagrant, sin dispositivos, sin cuenta TorBox.
**Regla:** no se inventaron resultados. Cada prueba tiene comando, salida y estado. Lo que no se pudo ejecutar se declara como **NO EJECUTADO**.

---

## 1. Entorno

| Componente | Estado |
|---|---|
| Docker / Docker Desktop | **No instalado** (`docker` no se reconoce) |
| Docker Compose (binario standalone) | **v5.6.1** (descargado para validar) |
| VirtualBox | **No instalado** (`VBoxManage` no se reconoce) |
| Vagrant | **No instalado** (`vagrant` no se reconoce) |
| Bash | **5.3.15(2)** (Cygwin) |
| Caddy | **2.11.7** (descargado para probar el Caddyfile) |
| Node / npm | No usados en esta auditoría |
| Dispositivos (TV, Android TV, telefonos) | **Ninguno** |
| API key TorBox | **No provista** |
| Red | Host con acceso a Internet; sin VM |

**Consecuencia:** se pudieron validar sintaxis, configuración, semántica de Caddy y contratos de las APIs. **No se pudo validar el arranque de los 11 contenedores, el playback, la API autenticada de TorBox ni ningún dispositivo.**

---

## 2. Pruebas ejecutadas

### T-01 — Inventario del repositorio

**Comando:**
```powershell
Get-ChildItem -Recurse -File -Force |
  Where-Object { $_.FullName -notmatch '\\\.git\\' } |
  Select-Object FullName, Length
```

**Resultado:** 15 archivos versionados + `.env` local + `audit/`. No hay `src/`, `app/`, `components/`, `package.json`, tests ni CI.

**Estado:** **VERIFICADO**.

---

### T-02 — Estado de Git y secretos

**Comandos:**
```powershell
git log --oneline
git status --short
git remote -v
git ls-files
git ls-files --error-unmatch .env
git log --all --oneline -- .env
```

**Resultado:**
- Último commit: `9037bb6`.
- Working tree limpio al inicio.
- Remoto: `https://github.com/nachopalmeri/fubol.git`.
- `.env` **no** está trackeado (`error: pathspec '.env' did not match...`).
- `git log --all -- .env` → vacío: **nunca se commiteó**.
- 15 archivos trackeados, ninguno con código de aplicación.

**Estado:** **VERIFICADO**. No se imprimieron valores de `.env`.

---

### T-03 — Visibilidad del repositorio

**Comando:**
```powershell
Invoke-RestMethod -Uri 'https://api.github.com/repos/nachopalmeri/fubol' -Headers @{'User-Agent'='audit'}
```

**Resultado:** `private=False`, `visibility=public`, `default_branch=main`, `pushed_at=2026-10-21T14:50:41Z`.

**Estado:** **VERIFICADO**. Hallazgo SEC-10/LEG-01.

---

### T-04 — Validación de Docker Compose

**Comando:**
```powershell
docker-compose.exe -f docker-compose.yml config --quiet
```

**Resultado:**
```
Docker Compose version v5.6.1
level=warning msg="... the attribute `version` is obsolete, it will be ignored..."
COMPOSE_EXIT=0
```

**Interpretación:** el YAML es válido y la interpolación de variables funciona. El único warning es `version: "3.9"` (obsoleto). **No valida** que las imágenes existan, que los healthchecks funcionen ni que los servicios arranquen.

**Estado:** **VERIFICADO**.

---

### T-05 — Sintaxis de scripts shell

**Comando:**
```bash
bash -n setup.sh; echo $?
bash -n vm/provision.sh; echo $?
```

**Resultado:** `0` y `0`.

**Interpretación:** no hay errores de sintaxis. **No detecta** el `EOF` suelto de `setup.sh:93`, porque un comando llamado `EOF` es sintácticamente válido.

**Estado:** **VERIFICADO** (sintaxis).

---

### T-06 — Ejecución real de `setup.sh` en copia temporal

**Comando (resumen):**
```powershell
$tmp='D:\Dev\temp\opencode\fubol-setup-test'
Copy-Item -Recurse -Force 'D:\Dev\fubol\*' $tmp
Remove-Item -Force "$tmp\.env"
bash "$tmp/setup.sh"
echo "EXIT=$LASTEXITCODE"
```

**Resultado:**
- Generó `.env` con secretos aleatorios.
- Creó directorios de datos.
- Imprimió los próximos pasos.
- **Salió con `EXIT=127`** al llegar a `setup.sh:93`:
  ```
  bash : setup.sh: line 93: EOF: command not found
  ```
- `chmod +x setup.sh` (línea 94) **nunca se ejecutó**.
- No se imprimieron secretos.

**Estado:** **VERIFICADO**. Hallazgo DOC-09.

---

### T-07 — Validación del Caddyfile

**Comando:**
```powershell
caddy.exe validate --config config/Caddyfile --adapter caddyfile
```

**Resultado:**
```
adapted config to JSON
Caddyfile input is not formatted; run 'caddy fmt --overwrite'
CADDY_VALIDATE_EXIT=0
```

**Interpretación:** sintaxis válida. `validate` **no** emite certificados ni prueba TLS.

**Estado:** **VERIFICADO** (sintaxis).

---

### T-08 — Prueba real de TLS con el Caddyfile del repo

**Comando (resumen):**
```powershell
# Caddyfile del repo: :443 { tls internal; reverse_proxy aiostreams:3000 }
caddy.exe run --config Caddyfile --adapter caddyfile
curl.exe -vk --max-time 10 https://127.0.0.1/
```

**Resultado:**
```
* schannel: next InitializeSecurityContext failed: SEC_E_ILLEGAL_MESSAGE (0x80090326)
curl: (35) ... handshake failed
```
- En los logs **no** aparece `certificate obtained` para el catch-all.
- No se creó ningún certificado leaf.

**Variante con hostname:**
```caddyfile
https://192.168.56.10 {
    tls internal
    reverse_proxy aiostreams:3000
}
```
**Resultado:**
```
{"logger":"tls.obtain","msg":"obtaining certificate","identifier":"192.168.56.10"}
{"logger":"tls.obtain","msg":"certificate obtained successfully","identifier":"192.168.56.10","issuer":"local"}
```

**Interpretación:**
- `:443` + `tls internal` **no emite certificado** para un catch-all sin hostname; el handshake TLS falla.
- Con `https://<IP>` sí emite, pero firmado por la CA local de Caddy: **no lo confía ningún dispositivo**.
- La prueba se hizo en Windows, no en el contenedor Linux; la semántica de Caddy es la misma.

**Estado:** **VERIFICADO** (falla reproducida). Hallazgo OPS-02/SEC-09.

---

### T-09 — Existencia de la imagen MediaFusion 6.0.0

**Comando:**
```powershell
Invoke-RestMethod 'https://hub.docker.com/v2/repositories/mhdzumair/mediafusion/tags/6.0.0'
```

**Resultado:** tag existente; arquitecturas `amd64`, `arm64`; `last_pushed=2026-07-14`; tamaño ~258 MB.

**Estado:** **VERIFICADO**. La imagen existe; no se ejecutó.

---

### T-10 — Contrato de AIOStreams (código fuente)

**Fuentes:**
- `packages/server/src/app.ts`
- `scripts/healthcheck.js`
- `packages/core/src/config/bootstrap.ts`
- `packages/core/src/utils/env.ts`

**Resultados:**
- Health endpoints reales: `/api/v1/health` y `/api/v1/status`.
- El healthcheck oficial de la imagen usa `/api/v1/status`.
- Ruta de manifest: `/stremio/:uuid/:encryptedPassword/manifest.json`.
- Variables: `BASE_URL`, `PORT`, `DATABASE_URI`, `SECRET_KEY`, `NODE_ENV`, `AIOSTREAMS_AUTH`.
- `SECRET_KEY` debe ser 64 hex.
- `AIOSTREAMS_AUTH` no tiene default seguro (vacío = sin auth).

**Estado:** **VERIFICADO** por código upstream. Hallazgos OPS-04, STR-01, SEC-01.

---

### T-11 — Contrato de MediaFusion (código y compose oficial)

**Fuentes:**
- `backend/src/config.rs` (v6)
- `deployment/docker-compose/docker-compose.yml`
- `deployment/docker-compose/.env-sample`

**Resultados:**
- `SECRET_KEY` es obligatorio; v6 lo trunca a 32 bytes (`key[..min(32)]`). No valida longitud, así que el valor de 64 hex **no impide el arranque**.
- `API_PASSWORD`, `HOST_URL`, `CONTACT_EMAIL`, `POSTGRES_URI` son las variables reales.
- `SECRET_KEY_MF` **no existe**.
- El compose oficial usa `mediafusion:6.1.6` y un worker con `/usr/local/bin/mediafusion-worker`.
- El worker y TRAWL son reales, no inventados.

**Estado:** **VERIFICADO** por código upstream. Hallazgos SEC-04, DOC-02.

---

### T-12 — Contrato de Pi-hole v6

**Fuente:** README oficial de `pi-hole/docker-pi-hole`.

**Resultados:**
- v6 usa `FTLCONF_webserver_api_password` (no `WEBPASSWORD`).
- En red bridge hay que usar `FTLCONF_dns_listeningMode: ALL`.
- El repo no define ninguna de las dos.

**Estado:** **VERIFICADO** por documentación oficial. Hallazgo SEC-03.

---

### T-13 — Contrato de Unbound

**Fuentes:** README de `MatthewVance/unbound-docker`, `1.22.0/data/unbound.sh`, issues oficiales.

**Resultados:**
- El entrypoint genera `unbound.conf` si no existe.
- `unbound.conf` incluye `a-records.conf`, `srv-records.conf`, `forward-records.conf`.
- Montar un directorio vacío sobre `/opt/unbound/etc/unbound` oculta esos archivos.
- Unbound falla si un `include` no existe (`cannot open include file`).
- La config por defecto **reenvía a Cloudflare**, no es recursiva.

**Estado:** **VERIFICADO** por documentación/código upstream. Hallazgos OPS-03, DOC-06.

---

### T-14 — Contrato de MediaFlow Proxy

**Fuentes:** `Dockerfile`, `docs/configuration/runtime.md`, `docs/features.md`.

**Resultados:**
- `API_PASSWORD`, `PORT`, `REDIS_URL` son válidos.
- La imagen runtime es `python:3.14-slim` y **no instala `curl`**.
- El healthcheck del repo usa `curl` → fallará con "not found".
- Soporta transcoding y URLs cifradas, pero el repo no lo configura.

**Estado:** **VERIFICADO** por Dockerfile. Hallazgo OPS-11.

---

### T-15 — Contrato de TorBox

**Fuentes:** `api-docs.torbox.app`, SDK `TorBox-App/torbox-sdk-js`, help center.

**Resultados:**
- `requestdl` abre el link 3 h para iniciar; luego casi ilimitado.
- `checkcached`: 100 hashes/llamada, cache 1 h.
- `mylist`: refresco cada 600 s; `bypass_cache=true`.
- Planes: 3/5/10 slots; cached no consume slot.
- Cuenta/API key compartida: **permitida**.
- Permalinks: incluyen la API key.

**Estado:** **VERIFICADO** por documentación oficial. **No se llamó a la API** (sin key y para evitar operaciones destructivas).

---

### T-16 — Artefactos de PowerShell en los archivos

**Comando:**
```powershell
Select-String -Path (Get-ChildItem -Recurse -File).FullName -Pattern "Set-Content" -SimpleMatch
```

**Resultado:** 6 archivos con una línea final `'@ | Set-Content ...`:
`.gitignore:5`, `config/stremio-addons.md:37`, `docs/ARCHITECTURE.md:54`, `docs/COMO_FUNCIONAN.md:303`, `docs/LEGAL.md:8`, `docs/WIRING.md:36`.

**Estado:** **VERIFICADO**. Hallazgo DOC-01.

---

### T-17 — Imágenes y tags

**Comando:**
```powershell
Select-String -Path docker-compose.yml -Pattern '^\s+image:'
```

**Resultado:** 11 imágenes; **8 usan `latest`**; MediaFusion está fijado (`6.0.0`, dos veces) y Postgres usa `18-alpine`.

**Estado:** **VERIFICADO**. Hallazgo OPS-08.

---

### T-18 — Puertos y exposición

**Método:** lectura de `docker-compose.yml` + `vm/Vagrantfile`.

**Resultado:**
- Publicados: 3000, 8000, 8888, 9696, 80, 443, 8053, 5335, 53.
- Forwarded en Vagrant: 3000, 8000, 8888, 9696, 80, 443, 8053, 5335. **Falta 53.**
- Los forwarded ports de Vagrant se bindean a **todas las interfaces del host** por defecto (docs oficiales), así que los puertos quedan expuestos en la LAN (sujeto al firewall). No hay `host_ip` explícito, pero eso no cambia el binding por defecto.
- No hay `public_network`.
- `.env:1,6,7`: `BASE_URL`/`HOST_URL`/`POSTER_HOST_URL` apuntan a `192.168.56.10` (host-only), que es la causa de que las URLs no sean alcanzables desde otros dispositivos.

**Estado:** **VERIFICADO** por configuración + docs de Vagrant. Hallazgos ARCH-01, SEC-07, SEC-08, OPS-07.

---

### T-19 — Búsqueda de secretos en git

**Comandos (bash, sobre el historial completo):**
```bash
git log -p --all -- . ':!audit' | grep -aE '^\+.*SECRET_KEY=[0-9a-fA-F]{16,}' | wc -l
git log -p --all -- . ':!audit' | grep -aE '^\+.*(API_PASSWORD|MEDIAFLOW_API_PASSWORD|PIHOLE_WEBPASSWORD)=.+' | grep -av 'changeme' | wc -l
git log -p --all -- . ':!audit' | grep -aiE '^\+.*torbox.*(key|token).*=.+' | wc -l
git log --all --oneline -- .env | wc -l
```

**Resultado:** `0`, `0`, `0`, `0`. No hay `SECRET_KEY` con valor hex, ni passwords no-placeholder, ni patrones de API key de TorBox en el historial. `.env` nunca se commiteó.

**Nota:** un primer barrido genérico de strings hex de 32+ caracteres devolvió 5 coincidencias; al revisarlas eran hashes de commit (`index ...`), no secretos. No se imprimieron valores.

**Estado:** **VERIFICADO** (limitado a git; no hay workflows de GitHub Actions que auditar).

---

## 3. Pruebas que NO se pudieron ejecutar

| Prueba | Por qué | Cómo hacerla |
|---|---|---|
| `docker compose up -d` | Docker no instalado | En la VM: `docker compose up -d --wait; docker compose ps` |
| `vagrant up` | Vagrant/VirtualBox no instalados | En el host: `cd vm; vagrant up --debug` |
| Healthchecks reales | Sin contenedores | `docker inspect --format '{{.State.Health.Status}}' <container>` |
| API TorBox autenticada | Sin API key; además no se hacen operaciones destructivas | En una cuenta de prueba: `curl -H "Authorization: Bearer $KEY" https://api.torbox.app/v1/api/user/me` |
| Playback VOD | Sin instancia/dispositivos | Instalar manifest en Stremio y reproducir 3 títulos (H.264, HEVC, 4K) |
| Playback deportes | Sin instancia/dispositivos | Abrir MediaFusion, elegir un evento y reproducir |
| Subtítulos VOSE | Sin instancia/dispositivos | Reproducir con Subtitle Sync y verificar sync |
| Acceso remoto | Sin túnel/dominio | Configurar Cloudflare Tunnel y probar desde 4G |
| Latencia/bandwidth | Sin instancia | `docker stats`, `iftop`/`nethogs`, test de velocidad |
| Codecs en TV | Sin TV | Probar la matriz de `05_DEVICE_COMPATIBILITY.md` |
| Pi-hole :53 en Ubuntu | Sin VM | `ss -lunpt | grep :53`; `dig @<IP> google.com` |
| Unbound crash-loop | Sin Docker | `docker compose logs unbound` |
| Caddy en Linux | Sin Docker | `docker compose logs caddy`; `curl -vk https://<host>` |

---

## 4. Matriz de escenarios (A–J)

| # | Escenario | Estado | Evidencia / bloqueo |
|---|---|---|---|
| **A** | Arranque limpio en host nuevo | **FALLA CONFIRMADA** | `vagrant up` no encuentra el compose (OPS-01); Unbound crash-loop (OPS-03); Caddy no arranca (OPS-04); TLS roto (OPS-02). |
| **B** | Primera configuración de TorBox | **NO VERIFICADO** | Requiere UI + API key. La key no está en el repo; el flujo del README usa una manifest URL inválida (STR-01). |
| **C** | VOD en LAN (TV/PC) | **NO VERIFICADO / BLOQUEADO** | Las URLs apuntan a `192.168.56.10`, host-only (ARCH-01); la TV no puede resolverlas. En el host, con la URL correcta, *podría* funcionar; no se probó. |
| **D** | VOD remoto (fuera de casa) | **FALLA CONFIRMADA** | Sin HTTPS válido, sin túnel, `BASE_URL` HTTP (SEC-09, STR-02). |
| **E** | Deportes en vivo | **NO VERIFICADO** | MediaFusion no es instalable remoto (STR-02); los streams gratuitos no son estables (docs). |
| **F** | Subtítulos VOSE | **NO VERIFICADO** | Depende de addon/cliente; no hay instancia. |
| **G** | Compartir un contenido | **FALLA CONFIRMADA** | No existe link por contenido; la manifest da acceso total (SEC-05). |
| **H** | Reinicio del host | **NO VERIFICADO** | Teóricamente los volúmenes persisten; no se probó. Si el host duerme, el control plane cae (ARCH-04). |
| **I** | Cambio de IP/red | **FALLA CONFIRMADA** | `BASE_URL`/`HOST_URL` hardcodeados a `192.168.56.10` (`.env:1,6`). |
| **J** | Caída de TorBox / Internet | **NO VERIFICADO** | Sin fallback de debrid (STR-07); no se probó el mensaje de error. |

---

## 4.b Hallazgos de documentación y alcance (DOC-01 a DOC-13)

| ID | Sev. | Descripción | Evidencia | Esperado vs. actual | Fix | Test | Estado |
|---|---|---|---|---|---|---|---|
| DOC-01 | P2 | 6 archivos terminan con el artefacto de PowerShell `'@ \| Set-Content ...`. | `.gitignore:5`, `config/stremio-addons.md:37`, `docs/ARCHITECTURE.md:54`, `docs/COMO_FUNCIONAN.md:303`, `docs/LEGAL.md:8`, `docs/WIRING.md:36` | Archivos limpios vs. basura al final | Borrar la línea | `grep -rn "Set-Content"` → 0 | **CONFIRMADO** |
| DOC-02 | P2 | MediaFusion aparece como 6.1.6 en unos docs y 6.0.0 en el compose. | `README.md:42`, `docs/COMO_FUNCIONAN.md:201`, `docker-compose.yml:111,139`, `docs/ARCHITECTURE.md:33` | Una sola versión | Unificar y documentar el pin | `grep -rn "6\\.1\\.6\\|6\\.0\\.0"` consistente | **CONFIRMADO** |
| DOC-03 | P2 | "3/10 streams concurrentes" es impreciso: son descargas activas; los cacheados no consumen slot. | `README.md:89-90`; help center de TorBox | Precisión | Reescribir con la definición real | Revisión de doc | **CONFIRMADO** |
| DOC-04 | P2 | Dice que compartir cuenta puede violar los ToS; TorBox permite compartir cuenta y API key. | `README.md:205`; help center de TorBox | Alineado con la fuente | Corregir; el riesgo real es abuso de ancho de banda | Revisión de doc | **CONFIRMADO** |
| DOC-05 | P2 | "Todo el tráfico de TorBox sale de una sola IP" es falso salvo que MediaFlow proxee todo; TorBox permite multi-IP. | `README.md:31`; help center de TorBox | Precisión | Corregir | Revisión de doc | **CONFIRMADO** |
| DOC-06 | P2 | "Unbound recursivo, sin filtracion" es falso: la config por defecto reenvía a Cloudflare. | `README.md:187`; `docker-compose.yml:70-82`; README de mvance/unbound | Privacidad real vs. prometida | Proveer config recursiva o corregir la afirmación | `dig` + logs de unbound | **CONFIRMADO** |
| DOC-07 | P2 | Se menciona "descomentar cloudflared" pero no existe ningún servicio cloudflared. | `README.md:196` | Documento alineado con el compose | Agregar el servicio o borrar la mención | `grep cloudflared docker-compose.yml` | **CONFIRMADO** |
| DOC-08 | P2 | `COMO_FUNCIONAN.md` tiene contradicciones (Futbol Libre activo y bloqueado; Pelota Libre duplicado) y fuentes de baja confianza. | `docs/COMO_FUNCIONAN.md:161-175` vs. `275-280`; fuentes LinkedIn/PCrisk/PraviCeler | Datos verificables | Reescribir con fuentes primarias o eliminarlo del repo público | Revisión de fuentes | **CONFIRMADO** (como inconsistencia) |
| DOC-09 | P2 | `setup.sh` tiene un `EOF` suelto y sale 127; `chmod` nunca corre. | `setup.sh:93-94`; test T-06 | Script que termina 0 | Borrar el `EOF`; mover `chmod` antes | `bash setup.sh; echo $?` → 0 | **CONFIRMADO** |
| DOC-10 | P2 | "Crear usuario admin (usuario + password)" no es el flujo de AIOStreams v2. | `README.md:104-110`; docs de AIOStreams | Flujo real | Documentar Save & Install + auth del dashboard | Probar el alta | **CONFIRMADO** |
| DOC-11 | P3 | `.env.example` trae `changeme`. | `.env.example:19-20` | Placeholders vacíos | Dejar vacío o `<generar>` | `grep changeme .env.example` | **CONFIRMADO** |
| DOC-12 | P3 | "5–10 min" de `vagrant up` no está medido y el provision hoy falla. | `README.md:60` | Tiempo medido | Medir después de A1 | Cronómetro en un `vagrant up` real | **NO VERIFICADO** |
| DOC-13 | P3 | Dice que MediaFusion es "despliegue separado" pero está en el compose. | `config/stremio-addons.md:21` vs. `docker-compose.yml:111` | Consistencia | Unificar | Revisión de doc | **CONFIRMADO** |

---

## 5. Cobertura de la auditoría

| Área | Cobertura | Qué se verificó | Qué falta |
|---|---|---|---|
| Configuración / Compose | **Alta** | YAML, imágenes, puertos, healthchecks, dependencias, variables | Arranque real |
| Seguridad | **Media-Alta** | Auth, secretos, TLS, exposición, repo público | Pentest dinámico, logs reales |
| Streaming / TorBox | **Media** | Contratos de API, tipos de link, expiración, planes | Playback y API autenticada |
| Dispositivos | **Baja** | Documentación oficial de clientes | Pruebas en hardware |
| UX | **Baja** | Flujos documentados | Capturas, usuarios, TV real |
| Performance | **Baja** | Arquitectura y límites teóricos | Benchmarks, `docker stats` |
| Mantenibilidad | **Alta** | Tags, tests, CI, documentación, artefactos | Ejecución de CI |

**Porcentaje global de pruebas ejecutadas vs. planificadas:** no se calcula un número porque sería arbitrario. Se puede afirmar: **todas las pruebas estáticas posibles se hicieron; ninguna prueba dinámica de streaming/dispositivos se pudo hacer.**

---

## 6. Conclusión de pruebas

- **Lo que sí se probó:** sintaxis, compose, scripts, TLS de Caddy, existencia de imagen, contratos de las APIs, visibilidad del repo.
- **Lo que no se probó:** arranque, playback, API TorBox, dispositivos, latencia, subtítulos, acceso remoto.
- **Lo que se confirmó como falla:** `vagrant up`, Caddy TLS, Unbound, healthcheck de AIOStreams, acceso LAN, manifest URL, TLS remoto, share por contenido, cambio de IP.

**No se puede declarar el stack "listo" con esta evidencia.** La etapa A del plan existe precisamente para convertir estas pruebas estáticas en una prueba de humo real.
