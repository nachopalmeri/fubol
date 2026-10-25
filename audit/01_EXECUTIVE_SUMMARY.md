# 01 — Executive Summary

**Proyecto:** Centro de streaming privado (`D:\Dev\fubol`)
**Fecha de auditoría:** 21 de octubre de 2026
**Alcance:** repositorio completo, configuración Docker/Vagrant, documentación, integración TorBox/AIOStreams/MediaFusion, seguridad, compatibilidad de dispositivos, UX y pruebas posibles en este entorno.
**Modo:** auditoría de solo lectura. No se modificó código de producción, `docker-compose.yml`, `Vagrantfile`, `provision.sh` ni `.env`. Solo se agregó la carpeta `audit/`.

---

## Veredicto en una frase

**El stack no está operativo como está documentado.** La elección de fondo (AIOStreams + TorBox para VOD) es razonable, pero el arranque tiene bloqueantes reales (Vagrant, Caddy, Unbound, healthcheck de AIOStreams), la red de la VM no es accesible desde otros dispositivos de la LAN, y no existe ninguna pieza propia de aplicación, player, enlaces de compartir ni autenticación familiar.

**Puntaje global: 3/10.**
**Uso personal en LAN, hoy: 2/10.** **Uso familiar/remoto, hoy: 1/10.**

---

## Qué existe realmente en el repositorio

El repositorio **no contiene una aplicación**. Contiene 15 archivos versionados:

| Tipo | Archivos | Qué es |
|---|---|---|
| Orquestación | `docker-compose.yml` | 11 servicios de terceros |
| Bootstrap | `setup.sh`, `.env.example` | Generación de `.env`, directorios, Caddyfile |
| VM | `vm/Vagrantfile`, `vm/provision.sh` | Ubuntu 22.04, 8 GB RAM, 4 CPU, IP 192.168.56.10 |
| Reverse proxy | `config/Caddyfile` | `:443` + `tls internal` → AIOStreams |
| Documentación | `README.md`, `docs/*.md`, `privacy/README.md`, `config/stremio-addons.md` | Instrucciones y análisis |
| Ignorados | `.env`, `data/` | Secretos y volúmenes locales (no versionados) |

**No hay:** frontend, backend, router, componentes, player, tests, CI, migraciones, API propia, sistema de usuarios, sistema de enlaces compartidos, ni una sola línea de código de aplicación.

Todo el comportamiento de producto (catálogo, reproducción, subtítulos, continue watching, perfiles) pertenece a **AIOStreams, Stremio, Nuvio, MediaFusion y los reproductores de cada dispositivo**. Este repositorio solo los empaqueta y los conecta.

---

## Estado verificado, simulado, documentado y no verificado

| Estado | Qué cubre esta auditoría |
|---|---|
| **VERIFICADO en este entorno** | `docker-compose.yml` parsea y `docker compose config` sale 0 (Compose v5.6.1); `bash -n` de ambos scripts; ejecución real de `setup.sh` en copia temporal (sale 127); `caddy validate` y ejecución real de Caddy 2.11.7 con el Caddyfile del repo; repo GitHub público; `.env` no trackeado; tag `mhdzumair/mediafusion:6.0.0` existe en Docker Hub. |
| **VERIFICADO por código/fuente oficial** | Endpoints reales de AIOStreams (`/api/v1/health`, `/api/v1/status`, `/stremio/:uuid/:encryptedPassword/manifest.json`); variables de entorno de AIOStreams; `SECRET_KEY` de MediaFusion v6; variables de Pi-hole v6; includes obligatorios de Unbound; ausencia de `curl` en la imagen de MediaFlow; límites y endpoints de TorBox. |
| **DOCUMENTADO (fuente primaria, no ejecutado acá)** | Comportamiento de redes privadas/forwarded ports de Vagrant; `depends_on: service_healthy` de Compose; requisito de HTTPS de Stremio; soporte de dispositivos de Stremio/AIOStreams; límites de planes TorBox. |
| **SIMULADO** | Nada. No se simuló reproducción ni se inventaron capturas. |
| **NO VERIFICADO** | Arranque real de los 11 contenedores; playback real; subtítulos; apps en TV física; API TorBox autenticada; latencia; ancho de banda; comportamiento de Caddy dentro de la VM Linux. |

**Límites del entorno:** este host Windows no tiene Docker, Docker Desktop, VirtualBox ni Vagrant. No hay dispositivos físicos (TV, Android TV, telefonos, consolas) ni cuenta/API key de TorBox. Por eso **no se ejecutó playback ni se probó la API autenticada**. Los informes marcan cada afirmación con su estado; no se aprueba nada que no se haya podido verificar.

---

## Top 10 hallazgos

| # | ID | Sev. | Hallazgo | Evidencia |
|---|---|---|---|---|
| 1 | OPS-01 | P0 | `vagrant up` no puede funcionar: el synced folder `/vagrant` apunta a `vm/`, no a la raíz del repo, así que no encuentra `docker-compose.yml`. | `vm/Vagrantfile:14`, `vm/provision.sh:20-25` |
| 2 | OPS-02 | P0 | Caddy `:443` + `tls internal` sin hostname no obtiene certificado; el handshake TLS falla. Probado con Caddy 2.11.7. | `config/Caddyfile:2-5` |
| 3 | OPS-03 | P0 | Unbound monta un directorio vacío sobre `/opt/unbound/etc/unbound`, ocultando `a-records.conf`, `srv-records.conf` y `forward-records.conf`; el proceso entra en crash-loop. Pi-hole queda bloqueado por `depends_on`. | `docker-compose.yml:70-82`, `setup.sh:38-40` |
| 4 | OPS-04 | P0 | El healthcheck de AIOStreams pega a `/health`, que no existe; los endpoints reales son `/api/v1/health` y `/api/v1/status`. AIOStreams queda `unhealthy` y Caddy nunca arranca. | `docker-compose.yml:21`; AIOStreams `app.ts`, `scripts/healthcheck.js` |
| 5 | ARCH-01 | P0 | La VM usa `private_network` (host-only) y `BASE_URL`/`HOST_URL` apuntan a `192.168.56.10`, una dirección que solo ve el host. Los forwarded ports sí quedan expuestos en las interfaces del host, pero las URLs generadas son inalcanzables desde la TV; además el puerto 53 no se forwardea. | `vm/Vagrantfile:5-8`; `.env:1,6` |
| 6 | SEC-01 | P1 | El dashboard de AIOStreams no tiene autenticación (`AIOSTREAMS_AUTH` ausente). Cualquiera que llegue al :3000 puede administrar el stack y usar tu cuenta TorBox. | `.env` (sin `AIOSTREAMS_AUTH`), docs de AIOStreams |
| 7 | SEC-02 | P1 | Contraseñas por defecto `changeme` en MediaFusion, MediaFlow y Pi-hole. | `.env:10,14,15`; `setup.sh:26,30,31`; `docker-compose.yml:34,94` |
| 8 | STR-01 | P1 | La manifest URL documentada es del formato viejo. AIOStreams v2 exige `/stremio/<uuid>/<encryptedPassword>/manifest.json`; con `/stremio/<TOKEN>/manifest.json` la autenticación falla. | `README.md:129,136`; rutas de AIOStreams |
| 9 | SEC-03 | P1 | Pi-hole v6 ignora `WEBPASSWORD`; hay que usar `FTLCONF_webserver_api_password`. Además falta `FTLCONF_dns_listeningMode: ALL`, por lo que no responde a clientes de la LAN. | `docker-compose.yml:92-104`; README de Pi-hole |
| 10 | STR-03 | P1 | MediaFlow, si se activa como proxy de todos los streams, hace que el video pase por la VM: duplica el ancho de banda y convierte a la VM en cuello de botella y punto único de falla. | `README.md:114-122`; `docs/ARCHITECTURE.md:13` |

---

## Las 14 preguntas, respondidas sin vueltas

### 1. ¿La arquitectura actual es adecuada para el objetivo?

**No, tal como está.** La decisión central —AIOStreams como orquestador y TorBox como debrid— es correcta para VOD. Pero se le sumaron 10 servicios (MediaFusion, worker, Postgres, Redis, Prowlarr, TRAWL, MediaFlow, Caddy, Pi-hole, Unbound) sin que ninguno tenga una prueba de integración, y con varios bloqueantes de arranque. Para 2–3 familiares, la complejidad supera ampliamente el valor.

**Lo que sí es adecuado:** TorBox + AIOStreams + un cliente Stremio/AIOStreams. **Lo que no:** la red host-only de Vagrant, el HTTPS autofirmado, MediaFusion/Prowlarr/TRAWL para deportes gratuitos, y Pi-hole/Unbound como supuesta garantía de privacidad.

### 2. ¿Qué funciona hoy realmente y qué no?

**Verificado estáticamente:**
- El YAML es válido y `docker compose config` pasa (solo warning por `version`).
- Las imágenes existen: `mhdzumair/mediafusion:6.0.0` está en Docker Hub (amd64/arm64, publicada 2026-07-14); las demás usan `latest`.
- `setup.sh` genera `.env` y directorios.
- `.env` no está versionado.
- El Caddyfile es sintácticamente válido.

**Roto o no demostrado:**
- `vagrant up` (bloqueante).
- Caddy TLS (bloqueante).
- Unbound + Pi-hole (bloqueante en cadena).
- Healthcheck de AIOStreams (bloqueante de Caddy).
- Acceso desde TV/telefono en la LAN (bloqueante).
- Instalación remota de MediaFusion (HTTP, sin ruta en Caddy).
- Manifest URL de AIOStreams (formato incorrecto).
- Playback, subtítulos, cacheo, concurrencia y latencia: **no probados**.

### 3. ¿Qué impide usarlo cómodamente desde una Smart TV?

Cinco cosas, en orden:

1. **Las URLs apuntan a una dirección que la TV no ve.** `private_network` es host-only; la TV está en la Wi-Fi/LAN real, no en `192.168.56.0/24`. Los forwarded ports de Vagrant se bindean a todas las interfaces del host, así que existe un camino por la IP LAN del host, pero `BASE_URL=http://192.168.56.10:3000` y `HOST_URL=http://192.168.56.10:8000` generan manifests y posters que la TV no puede resolver. Además, el puerto 53 (DNS) no se forwardea.
2. **HTTP no sirve para instalar addons remotos.** Stremio exige HTTPS salvo localhost; `HOST_URL=http://192.168.56.10:8000` no es instalable desde la TV.
3. **La manifest URL está mal formada** para AIOStreams v2.
4. **Codecs:** el player de la TV decide. Navegadores y TVs viejas fallan con MKV/HEVC/audio surround; no hay guía de qué formato usar.
5. **Mando a distancia:** no hay diseño propio de foco/legibilidad; depende del cliente. AIOStreams tiene apps de TV, pero las de Samsung/LG son sideload y solo probadas en emulador.

### 4. ¿Qué impide compartirlo con familiares?

- No hay HTTPS confiable: el certificado de Caddy es interno y no lo confía ningún telefono/TV.
- No hay autenticación en el dashboard.
- No hay enlaces por contenido: compartir la manifest da acceso a **todo** el addon y a tu cuenta TorBox, no a una película.
- No hay perfiles ni onboarding: cada persona tendría que entender manifests, addons y credenciales.
- La VM no es always-on: si el host se apaga, se cae el control plane.
- Si se activa MediaFlow, tu upstream es el límite para todos.

### 5. ¿Qué riesgos tiene la API key de TorBox?

- **Bien:** AIOStreams la guarda del lado servidor, cifrada con `SECRET_KEY`, y no se entrega a los clientes.
- **Mal:** el dashboard está sin auth; cualquiera en la LAN puede crear una configuración y usar tu key.
- **Mal:** `SECRET_KEY_MF` no existe en MediaFusion; el servicio hereda el `SECRET_KEY` de AIOStreams (truncado a 32 bytes). No hay separación de secretos.
- **Riesgo:** los permalinks de TorBox incluyen la API key en el query string. Si AIOStreams/MediaFlow loguean la URL completa, la key queda en logs. AIOStreams tiene `makeUrlLogSafe`, pero no se probó el camino completo.
- **Riesgo:** no hay rotación ni revocación por usuario; si se filtra, hay que rotar la key y reconfigurar todo.
- **Riesgo:** el repo es público y documenta el uso de TorBox para contenido no autorizado; no hay secretos en git, pero sí exposición reputacional/legal.

### 6. ¿Qué pasa si la computadora se apaga?

El **control plane** (AIOStreams, MediaFusion, Caddy) deja de responder. Los enlaces directos de TorBox que el player ya tenga resueltos pueden seguir reproduciendo hasta que expiren (la API de TorBox abre el link 3 horas para *iniciar* la descarga; una vez iniciada, el tiempo es casi ilimitado). Pero **nuevas búsquedas, nuevos episodios, subtítulos y manifests fallan**. No hay alta disponibilidad ni failover. Para uso familiar real, el control plane tiene que estar always-on (host encendido 24/7, NAS o VPS).

### 7. ¿El video pasa por mi infraestructura?

**Por defecto, no:** AIOStreams devuelve un enlace directo al CDN de TorBox y el player baja de ahí. **Con MediaFlow activado como proxy, sí:** el video entra y sale por la VM, duplicando el ancho de banda (bajada + subida) y haciendo que la VM sea el límite. El README instruye activar MediaFlow; si se sigue al pie de la letra, el video **sí** pasa por tu infraestructura. Recomendación: MediaFlow solo para streams en vivo que necesiten reescritura de headers, nunca para VOD.

### 8. ¿Cuál es la mejor forma de acceso remoto?

| Opción | Veredicto |
|---|---|
| **Cloudflare Tunnel + Cloudflare Access** | **Recomendada** para familiares no técnicos: HTTPS válido, sin abrir puertos, login por email OTP. Requiere dominio y cuenta Cloudflare; Cloudflare termina TLS y ve metadata. |
| **Tailscale (VPN) + HTTPS interno** | Muy segura, pero cada familiar necesita instalar Tailscale. Buena para administración, no para "que funcione sin explicar nada". |
| **VPS pequeño con Caddy + Let's Encrypt** | Buena si el host de casa no es always-on. Costo mensual y más superficie de ataque. |
| **Caddy con `tls internal` + abrir 443** | **No viable** para familiares: certificado no confiado; además el Caddyfile actual ni siquiera emite certificado. |
| **Cloudflare Tunnel sin Access** | **No recomendado:** deja el dashboard de AIOStreams expuesto a Internet. El túnel siempre debe ir acompañado de Access o de una capa de auth. |

### 9. ¿Qué riesgos tiene TorBox?

- **Slots:** Essential 3, Pro 10 descargas activas. Los streams **cacheados no consumen slot**; la doc del repo dice "3/10 streams", que es impreciso.
- **Abuso:** umbrales de 10 TB/mes (Essential), 20 TB (Standard), 30 TB (Pro). 3–4 personas en 4K pueden acercarse.
- **Links:** expiran a las 3 horas para *empezar*; si el usuario deja el player en pausa antes de iniciar, puede fallar.
- **Permalinks:** incluyen la API key en la URL; no compartir.
- **Cuenta compartida:** TorBox **permite** compartir cuenta y API key (help center oficial); el riesgo real no es "suspensión por compartir", sino abuso de ancho de banda y contenido.
- **SLA:** no hay garantía de disponibilidad; el contenido cacheado depende de la cuenta y del DMCA.
- **Legal:** TorBox es un servicio de debrid; el uso con contenido no autorizado sigue siendo responsabilidad del usuario.

### 10. ¿Qué afecta la reproducción?

1. Manifest URL incorrecta (no autentica).
2. HTTP/HTTPS y certificados no confiables.
3. Contenido cacheado vs. uncached (latencia y slots).
4. Expiración del link de TorBox.
5. Codec/contenedor vs. player del dispositivo (MKV/HEVC/surround).
6. Ancho de banda del host y del uplink.
7. MediaFlow como proxy (agrega un hop y duplica tráfico).
8. Player de la TV (limitaciones de audio/subtítulos).
9. Subtítulos: pista incorrecta, desincronización, falta de VOSE.
10. Si el control plane está caído, no hay resolución de links.

### 11. ¿Qué debería conservar?

- **AIOStreams + TorBox** como núcleo de VOD.
- La **estructura de `docker-compose.yml`** (servicios separados, healthchecks, `depends_on`, volúmenes).
- **Caddy** como reverse proxy (corrigiendo el site address).
- **Pi-hole + Unbound** solo si se configuran bien y se acepta que no son una garantía de privacidad.
- La **documentación** como base, corrigiendo afirmaciones.
- La idea de **`setup.sh`** (automatizar secretos y directorios), corrigiendo el bug.
- El **Vagrantfile** como idea, corrigiendo red y synced folder.

### 12. ¿Qué debería refactorizar?

- **Vagrant:** `config.vm.synced_folder "..", "/vagrant"`; `public_network` (bridged) y apuntar `BASE_URL`/`HOST_URL` a la IP LAN (los forwarded ports ya bindean a todas las interfaces); forwardear 53.
- **Caddy:** usar un hostname real (`https://stream.example.com`) o un túnel; no `:443` catch-all con `tls internal`.
- **Unbound:** proveer `unbound.conf` recursivo real y los includes, o eliminarlo.
- **Pi-hole:** `FTLCONF_webserver_api_password`, `FTLCONF_dns_listeningMode: ALL`, upstream `unbound#53`.
- **Healthchecks:** `/api/v1/status` para AIOStreams; `curl` no existe en MediaFlow.
- **Secretos:** generar `API_PASSWORD`, `MEDIAFLOW_API_PASSWORD`, `PIHOLE_WEBPASSWORD` aleatorios; `chmod 600 .env`; separar `SECRET_KEY` de AIOStreams y MediaFusion.
- **URLs:** `BASE_URL`/`HOST_URL` deben ser la URL pública HTTPS, no `192.168.56.10`.
- **Manifest:** documentar el formato v2 con uuid + encrypted password.
- **Alcance:** sacar MediaFusion/Prowlarr/TRAWL/Pi-hole/Unbound de la v1; agregarlos solo si hay una necesidad medida.

### 13. ¿Qué falta para la experiencia familiar?

- HTTPS confiable y un hostname estable.
- Autenticación y perfiles por persona.
- Un mecanismo de invitación que no exponga toda la cuenta.
- Un cliente único por dispositivo, con onboarding de 3 pasos.
- Un control plane always-on.
- Una guía de "qué hacer si no anda" y un canal de soporte.
- Subtítulos VOSE por defecto.
- Límites de ancho de banda y expectativas claras (no 4K para todos a la vez).

### 14. ¿Cuáles son las 5 intervenciones de mayor impacto?

1. **Hacer que arranque:** synced folder de Vagrant, Caddy con hostname, Unbound con config, healthcheck de AIOStreams, Pi-hole v6.
2. **Cerrar la seguridad:** `AIOSTREAMS_AUTH`, contraseñas únicas, sacar `changeme`, no exponer dashboards.
3. **Resolver el acceso remoto:** Cloudflare Tunnel + Access (o Tailscale), `BASE_URL`/`HOST_URL` HTTPS, y **MediaFlow off para VOD**.
4. **Corregir el modelo de compartir:** perfiles/usuarios de AIOStreams y enlaces revocables; no compartir la manifest maestra.
5. **Elegir un cliente por dispositivo:** Stremio para Samsung/LG/Android TV; app de AIOStreams para desktop/Android/telefono; validar codecs y mando a distancia en cada uno.

---

## Puntajes (0–10)

| Criterio | Puntaje | Justificación |
|---|---:|---|
| Arquitectura | **3** | Núcleo correcto, pero 11 servicios, red host-only y bloqueantes de arranque. |
| Seguridad | **2** | Sin auth, contraseñas default, TLS roto, repo público con documentación de piratería. |
| Streaming | **4** | TorBox + AIOStreams es sólido; manifest mal formada, sin pruebas, proxy que ahoga la VM. |
| Compatibilidad | **3** | Stremio es amplio, pero no hay matriz ni guía de codecs; apps de TV en emulador. |
| UX | **3** | No hay UI propia; fricción de manifest/addons; sin onboarding ni capturas. |
| Performance | **3** | Sin benchmarks; 8 GB, sin límites; MediaFlow duplica tráfico. |
| Mantenibilidad | **2** | `latest` en 8 de 11 servicios, sin tests/CI, artefactos de PowerShell, contradicciones. |
| Family readiness | **1** | Sin HTTPS confiable, sin auth, sin enlaces seguros, sin acceso LAN, sin always-on. |
| **Global** | **3** | **No listo para uso real; sí hay una base rescatable.** |

---

## Roadmap en 3 etapas (resumen)

| Etapa | Objetivo | Duración estimada | Salida |
|---|---|---|---|
| **A — Estabilidad y seguridad** | Que el stack arranque y sea seguro en LAN | 1–2 semanas | Un dispositivo reproduce VOD; dashboards cerrados; sin bloqueantes P0/P1 |
| **B — Acceso familiar y multi-dispositivo** | Que 2–3 familiares entren sin soporte técnico | 2–4 semanas | HTTPS válido, perfiles, matriz de dispositivos, onboarding |
| **C — Optimización y deportes** | Latencia, costo, límites y deportes | 2–4 semanas | MediaFlow selectivo, backups, monitoreo, IPTV premium si se justifica |

Detalle completo en `08_ACTION_PLAN.md`.

---

## Lo que NO hay que hacer

- **No** construir un frontend/player propio: AIOStreams v2 ya trae apps, perfiles, continue watching, subtítulos y servidor Jellyfin. Sería sobreingeniería para 3 personas.
- **No** compartir la manifest maestra ni la API key de TorBox.
- **No** activar MediaFlow para VOD.
- **No** mantener MediaFusion + Prowlarr + TRAWL + Pi-hole + Unbound en la v1 solo porque están en el compose.
- **No** declarar "listo" sin una prueba de reproducción real en una TV/telefono y una prueba de acceso remoto.
- **No** seguir documentando dominios de piratería en un repo público.

---

## Evidencia y trazabilidad

- Hallazgos completos: `02_ARCHITECTURE.md`, `03_SECURITY.md`, `04_STREAMING_TORBOX.md`, `05_DEVICE_COMPATIBILITY.md`, `06_UX_REVIEW.md`.
- Comandos y resultados: `07_TEST_RESULTS.md`.
- Plan de acción: `08_ACTION_PLAN.md`.
- Fuentes primarias citadas en cada informe (AIOStreams, MediaFusion, Pi-hole, Unbound, MediaFlow, TorBox, Caddy, Vagrant, Stremio).
