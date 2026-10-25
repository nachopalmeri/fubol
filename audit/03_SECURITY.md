# 03 — Security

**Alcance:** superficie expuesta, autenticación, secretos, API key de TorBox, modelo de compartir, TLS, dependencias y riesgo legal del repositorio.
**Modo:** revisión estática + validación de configuración. Sin pruebas de penetración ni explotación.

> **Importante:** no se imprimen valores de `.env`. Las referencias a secretos son por línea y tipo, nunca por contenido.

---

## 1. Modelo de amenaza (para 3–4 usuarios)

| Actor | Capacidad | Objetivo |
|---|---|---|
| **Familiar con el link** | Tiene la manifest URL | Ver contenido, no administrar ni ver la API key |
| **Persona en la LAN** | Llega a `:3000`, `:8000`, `:8888`, `:9696`, `:8053` | Usar tu cuenta, cambiar config, romper el stack |
| **Internet (si se expone)** | Escanea puertos, prueba credenciales default | Tomar el dashboard, minar, pivotar |
| **Tercero (addon/subtítulo)** | Recibe URLs/credenciales que le pasás | Ver la API key, trackear |
| **GitHub público** | Lee el repo | Ver arquitectura, dominios, pistas de piratería |

**Supuesto:** el activo más valioso es la **API key de TorBox** (acceso a la cuenta y al consumo) y la **integridad del host**. El contenido en sí no se almacena.

---

## 2. Hallazgos

### SEC-01 — Dashboard de AIOStreams sin autenticación

| Campo | Valor |
|---|---|
| **ID** | SEC-01 |
| **Severidad** | **P1** |
| **Categoría** | Autenticación / Control de acceso |
| **Descripción** | AIOStreams no habilita autenticación por defecto. El repo no define `AIOSTREAMS_AUTH`. Cualquiera que llegue al puerto 3000 puede abrir el dashboard, ver/editar configuración y crear una configuración que use los servicios globales (incluido TorBox). |
| **Evidencia** | `.env` no contiene `AIOSTREAMS_AUTH`; `docker-compose.yml:12-17` no lo define; documentación oficial de AIOStreams: "No authentication is enabled by default. Set AIOSTREAMS_AUTH to secure the dashboard." |
| **Esperado** | Solo el administrador entra al dashboard; los familiares solo usan su manifest. |
| **Actual** | Dashboard abierto en `http://<IP>:3000`. |
| **Reproducción** | Con el stack levantado, abrir `http://<IP>:3000` desde otro dispositivo; entrar a la configuración sin credenciales. |
| **Impacto** | Uso no autorizado de la cuenta TorBox, cambio de configuraciones, filtración de metadatos, denegación de servicio. Si se expone por túnel, es admin de Internet. |
| **Causa raíz** | Se asumió que el dashboard no era sensible; en v2 el dashboard administra servicios y usuarios. |
| **Fix** | Definir `AIOSTREAMS_AUTH=usuario:hash` (o el formato que indique la versión) y `AIOSTREAMS_AUTH_ADMINS`; rotar credenciales; no exponer el dashboard a Internet sin Access. |
| **Esfuerzo** | S (1 h) |
| **Dependencias** | Definir el formato exacto de auth de la versión fijada. |
| **Test que valida** | `curl -I http://<IP>:3000` sin credenciales → 401/302; con credenciales → 200. |
| **Estado** | **CONFIRMADO** por ausencia de configuración y documentación oficial. |

---

### SEC-02 — Contraseñas por defecto `changeme`

| Campo | Valor |
|---|---|
| **ID** | SEC-02 |
| **Severidad** | **P1** |
| **Categoría** | Secretos / Configuración |
| **Descripción** | `API_PASSWORD` (MediaFusion), `MEDIAFLOW_API_PASSWORD` y `PIHOLE_WEBPASSWORD` quedan en `changeme`. MediaFlow además tiene fallback `changeme` en el compose. |
| **Evidencia** | `.env:10,14,15`; `setup.sh:26,30,31`; `docker-compose.yml:34,94`. |
| **Esperado** | Contraseñas aleatorias únicas, generadas en el bootstrap. |
| **Actual** | Credenciales conocidas por cualquiera que lea el repo. |
| **Reproducción** | Abrir `:8000/configure`, `:8888/docs`, `:8053/admin` y probar `changeme`. |
| **Impacto** | Un vecino/dispositivo comprometido puede cambiar la config de MediaFusion, usar MediaFlow como proxy abierto o entrar a Pi-hole. |
| **Causa raíz** | `setup.sh` genera solo `SECRET_KEY` y `SECRET_KEY_MF`; deja el resto como placeholder. |
| **Fix** | Generar `openssl rand -hex 16` para cada una; fallar el bootstrap si queda `changeme`; `chmod 600 .env`. |
| **Esfuerzo** | S (30 min) |
| **Dependencias** | Ninguna. |
| **Test que valida** | `grep -E 'changeme' .env` → sin resultados; login con la nueva password. |
| **Estado** | **CONFIRMADO**. |

---

### SEC-03 — Pi-hole v6 mal configurado (password y listening mode)

| Campo | Valor |
|---|---|
| **ID** | SEC-03 |
| **Severidad** | **P1** |
| **Categoría** | Configuración / DNS |
| **Descripción** | La imagen `pihole/pihole:latest` es v6. En v6, `WEBPASSWORD` ya no se usa: hay que definir `FTLCONF_webserver_api_password`. Además, en red bridge hay que definir `FTLCONF_dns_listeningMode: ALL` para que responda a clientes que no sean localhost. |
| **Evidencia** | `docker-compose.yml:92-104` (solo `WEBPASSWORD`); README oficial de Pi-hole v6 (upgrade notes / env vars). |
| **Esperado** | Password de admin conocida y DNS respondiendo a la LAN. |
| **Actual** | Password aleatoria/ignorada; DNS escuchando solo localhost dentro del contenedor. |
| **Reproducción** | Levantar Pi-hole; `docker logs pihole` muestra la password random; desde otro host, `dig @<IP> google.com` timeout. |
| **Impacto** | No se puede administrar Pi-hole; los dispositivos no resuelven DNS por Pi-hole. |
| **Causa raíz** | Se copió configuración de Pi-hole v5 sobre una imagen v6 (`latest`). |
| **Fix** | `FTLCONF_webserver_api_password: ${PIHOLE_WEBPASSWORD}`; `FTLCONF_dns_listeningMode: ALL`; fijar una versión (`pihole/pihole:2026.x`). |
| **Esfuerzo** | S (30 min) |
| **Dependencias** | Decidir si Pi-hole se queda. |
| **Test que valida** | Login en `:8053/admin`; `dig @<IP> google.com` desde otro dispositivo. |
| **Estado** | **CONFIRMADO** por documentación oficial y configuración. |

---

### SEC-04 — `SECRET_KEY_MF` no existe; MediaFusion comparte el secreto de AIOStreams

| Campo | Valor |
|---|---|
| **ID** | SEC-04 |
| **Severidad** | **P1** |
| **Categoría** | Secretos / Aislamiento |
| **Descripción** | El repo define `SECRET_KEY_MF`, pero MediaFusion lee `SECRET_KEY`. Como ambos servicios usan `env_file: .env`, MediaFusion hereda el `SECRET_KEY` de AIOStreams (64 hex) y lo trunca a 32 bytes. `SECRET_KEY_MF` se ignora. |
| **Evidencia** | `.env:9`; `docker-compose.yml:10-11,116-117`; `backend/src/config.rs:416-419` de MediaFusion v6 (`key[..b.len().min(32)]`). |
| **Esperado** | Un secreto distinto por servicio. |
| **Actual** | Mismo secreto (truncado) para cifrar credenciales de ambos. |
| **Reproducción** | `docker compose config` muestra `SECRET_KEY` en ambos servicios; cambiar `SECRET_KEY_MF` no tiene efecto. |
| **Impacto** | Comprometer un servicio facilita descifrar el otro; confusión operativa al rotar. |
| **Causa raíz** | Nombre de variable inventado/asumido; no se leyó el `.env-sample` oficial. |
| **Fix** | Renombrar a `SECRET_KEY` en un env file separado para MediaFusion; usar un valor de 32 hex (`openssl rand -hex 16`); no compartir el `.env` completo entre servicios. |
| **Esfuerzo** | S (1 h) |
| **Dependencias** | Separar `env_file` por servicio. |
| **Test que valida** | `docker compose config` muestra valores distintos; MediaFusion arranca y cifra/descifra correctamente. |
| **Estado** | **CONFIRMADO** por código de MediaFusion v6. |

---

### SEC-05 — No hay enlaces por contenido; compartir la manifest da acceso total

| Campo | Valor |
|---|---|
| **ID** | SEC-05 |
| **Severidad** | **P1** |
| **Categoría** | Producto / Control de acceso |
| **Descripción** | El repo no implementa enlaces de un contenido. La única unidad de sharing es la manifest de AIOStreams, que permite buscar y reproducir cualquier cosa que la cuenta TorBox pueda resolver. No hay expiración ni revocación por contenido. |
| **Evidencia** | `README.md:124-137` (crear usuario → copiar manifest); no hay servicio/route de share en el repo; las rutas de AIOStreams son manifest/stream/config. |
| **Esperado** | Un enlace que abra solo una película/episodio, con vencimiento y revocación. |
| **Actual** | Un enlace que da acceso al addon completo. |
| **Reproducción** | Entregar la manifest a otra persona; puede buscar cualquier título y usar tu TorBox. |
| **Impacto** | Un familiar con el link puede consumir tu cuota, ver contenido que no querías compartir y reenviar el link. |
| **Causa raíz** | Se confundió "usuario de AIOStreams" con "enlace de contenido". |
| **Fix** | (a) Usar perfiles/usuarios de AIOStreams con permisos y límites; (b) si se necesita un link por contenido, construir un servicio de share con token de un solo uso y TTL (fuera de alcance de esta fase). |
| **Esfuerzo** | S (perfiles) / L (share service) |
| **Dependencias** | Modelo de producto. |
| **Test que valida** | Un usuario B no puede buscar fuera del catálogo permitido; revocar el usuario corta el acceso. |
| **Estado** | **CONFIRMADO** por ausencia de implementación. |

---

### SEC-06 — `.env` con permisos amplios y secretos en claro

| Campo | Valor |
|---|---|
| **ID** | SEC-06 |
| **Severidad** | **P2** |
| **Categoría** | Secretos / SO |
| **Descripción** | `setup.sh` crea `.env` con el umask por defecto (normalmente 022 → 644) y nunca hace `chmod 600`. El archivo contiene `SECRET_KEY`, passwords y la config de servicios. |
| **Evidencia** | `setup.sh:16-32`; no hay `umask` ni `chmod` posterior. |
| **Esperado** | `.env` legible solo por el usuario que corre Docker. |
| **Actual** | Legible por cualquier usuario del VM. |
| **Reproducción** | `stat -c '%a' .env` en la VM → 644. |
| **Impacto** | Otro usuario/proceso del VM puede leer secretos. Riesgo bajo en un VM de un solo usuario, pero evitable. |
| **Causa raíz** | No se endureció el bootstrap. |
| **Fix** | `umask 077` al inicio de `setup.sh`; `chmod 600 .env`. |
| **Esfuerzo** | XS |
| **Dependencias** | Ninguna. |
| **Test que valida** | `stat -c '%a' .env` → 600. |
| **Estado** | **CONFIRMADO** por script. |

---

### SEC-07 — Postgres y Redis sin auth (aceptable solo si no se exponen)

| Campo | Valor |
|---|---|
| **ID** | SEC-07 |
| **Severidad** | **P3** |
| **Categoría** | Segmentación |
| **Descripción** | Postgres usa password fija `mediafusion`; Redis no tiene password. No publican puertos al host, así que el riesgo es interno. |
| **Evidencia** | `docker-compose.yml:159-187`. |
| **Esperado** | Credenciales fuertes y red interna. |
| **Actual** | Password fija, Redis abierto en la red de Compose. |
| **Impacto** | Si un contenedor se compromete, puede leer/escribir la DB y la cola. |
| **Fix** | Password aleatoria; `requirepass` en Redis; red `internal: true` para DB/Redis. |
| **Esfuerzo** | S |
| **Estado** | **RIESGO FUNDAMENTADO**; no explotado. |

---

### SEC-08 — Prowlarr expuesto sin auth por defecto

| Campo | Valor |
|---|---|
| **ID** | SEC-08 |
| **Severidad** | **P2** |
| **Categoría** | Control de acceso |
| **Descripción** | Prowlarr se publica en `:9696` y su autenticación viene desactivada por defecto. Si se expone por túnel o se abre la LAN, cualquiera puede ver/agregar indexers y API keys. |
| **Evidencia** | `docker-compose.yml:190-207`; Prowlarr docs (Authentication → Forms, default none). |
| **Esperado** | Auth activada y puerto no expuesto. |
| **Actual** | HTTP directo, sin auth configurada explícitamente en el repo. Prowlarr puede pedir auth para direcciones no locales según su default, pero no se verificó en una instancia. |
| **Impacto** | Posible filtración de API keys de indexers; uso no autorizado si la auth queda deshabilitada. |
| **Fix** | Activar Forms auth; no publicar 9696; acceder solo por túnel/SSH. |
| **Esfuerzo** | S |
| **Test que valida** | `curl -I http://<IP>:9696` → login. |
| **Estado** | **RIESGO FUNDAMENTADO**; no verificado en instancia. |

---

### SEC-09 — TLS interno no confiable y sin hostname

| Campo | Valor |
|---|---|
| **ID** | SEC-09 |
| **Severidad** | **P1** |
| **Categoría** | TLS / Transporte |
| **Descripción** | Caddy usa `tls internal` sobre `:443` catch-all. No hay hostname, así que no emite certificado (probado). Aun con hostname, el certificado lo firma la CA local de Caddy, que no confían los dispositivos de los familiares. |
| **Evidencia** | `config/Caddyfile:2-5`; prueba real con Caddy 2.11.7 (ver `07_TEST_RESULTS.md`). |
| **Esperado** | HTTPS válido y confiado por TV/telefonos. |
| **Actual** | Handshake falla; si se arregla el hostname, sigue siendo self-signed. |
| **Impacto** | Stremio rechaza addons remotos; los navegadores muestran advertencia; los familiares no pueden entrar. |
| **Causa raíz** | Se confundió "TLS interno para LAN" con "HTTPS para familiares". |
| **Fix** | Cloudflare Tunnel (TLS válido) o Caddy con Let's Encrypt y dominio público. Para LAN, instalar la CA de Caddy en cada dispositivo (no escala). |
| **Esfuerzo** | M |
| **Dependencias** | Dominio/túnel. |
| **Test que valida** | `curl -I https://<host>` sin `-k` → 200; TV instala el addon. |
| **Estado** | **CONFIRMADO** con prueba real. |

---

### SEC-10 — Repositorio público con documentación de piratería

| Campo | Valor |
|---|---|
| **ID** | SEC-10 / LEG-01 |
| **Severidad** | **P1** |
| **Categoría** | Legal / Reputacional |
| **Descripción** | El repo es público (`private=false` en GitHub) y contiene una guía técnica de sitios de streaming no autorizados, cómo extraen streams y una tabla de dominios activos. También afirma que el stack es "para uso personal" pero lo conecta a TorBox y scrapers. |
| **Evidencia** | GitHub API: `private=False`, `visibility=public`; `docs/COMO_FUNCIONAN.md:128-247`; `README.md:158-171`; `docs/LEGAL.md:3`. |
| **Esperado** | Si el objetivo es contenido autorizado, no documentar piratería. |
| **Actual** | Guía pública de piratería + nombre de usuario identificable. |
| **Impacto** | Exposición legal, reputacional y de cuenta; el repo puede usarse como evidencia. |
| **Causa raíz** | Se priorizó documentar el reverse engineering sin evaluar el soporte. |
| **Fix** | Pasar el repo a privado; separar la documentación sensible; eliminar dominios y how-to; si se quiere un portfolio, publicar solo la arquitectura genérica. |
| **Esfuerzo** | S |
| **Dependencias** | Decisión del usuario. |
| **Test que valida** | GitHub API `private=true`; `git grep` sin dominios de piratería. |
| **Estado** | **CONFIRMADO**. |

---

## 3. Manejo de la API key de TorBox

### Lo que está bien

- La key **no está en el repo** ni en `.env` (no hay ningún `TORBOX_API_KEY` versionado).
- AIOStreams la guarda del lado servidor, cifrada con `SECRET_KEY`.
- Las URLs que reciben los clientes son links firmados del CDN de TorBox, no la API key.

### Lo que está mal o no está probado

| Riesgo | Detalle | Estado |
|---|---|---|
| Dashboard abierto | Cualquiera en la LAN puede crear una config que use la key | **CONFIRMADO** |
| Permalinks | La API de TorBox tiene permalinks con `token=<API_KEY>` en el query string. Si AIOStreams/MediaFlow los usan o loguean, la key queda expuesta | **RIESGO FUNDAMENTADO**; AIOStreams tiene `makeUrlLogSafe`, pero no se probó el camino completo |
| Logs | `docker logs` puede contener URLs con tokens si el nivel es debug | **NO VERIFICADO** |
| Rotación | No hay procedimiento ni revocación por usuario | **CONFIRMADO** |
| Compartir cuenta | TorBox permite compartir cuenta/API key; el riesgo real es abuso de ancho de banda | **CONFIRMADO** (ver 04) |
| Filtración por addon | Terceros como Subtitle Sync pueden pedir tu API key de TorBox para sincronizar; si se la das, sale del servidor | **DOCUMENTADO** por el addon; evitar |

**Regla operativa:** la key solo vive en AIOStreams; nunca se pasa por chat, mail, captura ni addon de terceros. Si se sospecha filtración: rotar en TorBox, actualizar AIOStreams, reiniciar, revisar logs.

---

## 4. Superficie expuesta (por puerto)

| Puerto | Servicio | Auth | Exposición recomendada |
|---|---|---|---|
| 3000 | AIOStreams | **No** | Solo túnel con Access; nunca directo |
| 8000 | MediaFusion | `changeme` | Solo LAN/túnel; cambiar password |
| 8888 | MediaFlow | `changeme` | Solo interno; no publicar |
| 9696 | Prowlarr | **No** | Solo interno/SSH |
| 8053 | Pi-hole | v6 mal config | Solo LAN |
| 80/443 | Caddy | TLS roto | Reemplazar por túnel/LE |
| 53 | Pi-hole DNS | — | Solo LAN, con listening mode ALL |
| 5335 | Unbound | — | Solo interno |
| 5432/6379 | Postgres/Redis | fija/sin auth | Solo red interna |

**Conclusión:** hoy hay **cuatro dashboards administrativos** accesibles en la LAN, tres con password default o sin auth. Es la superficie más peligrosa del stack.

---

## 5. CORS, CSRF, XSS, SSRF, path traversal

No hay código propio, así que estos controles dependen de AIOStreams, MediaFusion, Prowlarr y Caddy. No se hizo análisis dinámico ni revisión de código de terceros.

| Clase | Qué mirar | Estado |
|---|---|---|
| **CORS** | AIOStreams expone APIs al navegador; si `BASE_URL` es HTTP y el origen es otro, puede haber bloques o `*` | **NO VERIFICADO** |
| **CSRF** | Dashboards sin auth → CSRF es secundario; con auth, verificar SameSite | **NO VERIFICADO** |
| **XSS** | Títulos/metadata de terceros se renderizan en la UI; AIOStreams/Stremio deberían escapar | **NO VERIFICADO** |
| **SSRF** | MediaFlow acepta URLs arbitrarias para proxear; con password default, cualquiera puede usarlo como proxy hacia la red interna | **RIESGO FUNDAMENTADO** (SEC-02) |
| **Path traversal** | MediaFlow/Prowlarr sirven archivos estáticos; sin auth, el riesgo aumenta | **NO VERIFICADO** |

**Recomendación:** no exponer MediaFlow/Prowlarr a Internet; ponerlos en una red `internal: true`; cambiar passwords; y si se quiere una auditoría dinámica, hacerla con Burp/ZAP contra una instancia de prueba, no contra la de la familia.

---

## 6. Dependencias e integridad de imágenes

- **8 de 11 servicios usan `latest`** (`docker-compose.yml:5,28,50,70,85,177,190,210`). No hay digests. (MediaFusion está fijado en `6.0.0`; Postgres en `18-alpine`.)
- MediaFusion está fijado en `6.0.0` (existe, pero la versión actual es `6.1.6`).
- No hay `docker scout`, Trivy, Dependabot ni SBOM.
- El cambio Pi-hole v5 → v6 ya rompió la config (SEC-03): es la prueba de que `latest` no es seguro para este stack.

**Fix:** fijar versiones exactas o digests; actualizar en una rama; correr un smoke test antes de tocar producción; agregar Trivy en CI.

---

## 7. Checklist de seguridad (antes de compartir con familiares)

- [ ] `AIOSTREAMS_AUTH` activo y probado.
- [ ] `API_PASSWORD`, `MEDIAFLOW_API_PASSWORD`, `PIHOLE_WEBPASSWORD` aleatorios (no `changeme`).
- [ ] `.env` con `chmod 600`; no versionado; backup cifrado.
- [ ] `SECRET_KEY` separado por servicio (AIOStreams / MediaFusion).
- [ ] Pi-hole v6 con `FTLCONF_webserver_api_password` y `FTLCONF_dns_listeningMode=ALL`.
- [ ] Prowlarr con auth y sin puerto público.
- [ ] MediaFlow solo interno; no expuesto.
- [ ] HTTPS válido (Cloudflare Tunnel o Let's Encrypt), no `tls internal`.
- [ ] Sin puertos 3000/8000/8888/9696/8053 abiertos al WAN.
- [ ] Logs de Docker con rotación y sin tokens.
- [ ] Backups de `data/` probados (restaurar, no solo crear).
- [ ] Repo privado y sin dominios de piratería.
- [ ] Procedimiento de rotación de la API key de TorBox escrito.

---

## 8. Veredicto de seguridad

**2/10.** El núcleo (key server-side, cifrada) está bien pensado, pero la operación lo anula: dashboards abiertos, passwords default, TLS roto, Pi-hole mal configurado y un repo público que documenta piratería. No está en condiciones de recibir usuarios externos.

**Prioridad absoluta:** SEC-01, SEC-02, SEC-03, SEC-09, SEC-10. Sin eso, no importa qué tan bueno sea el streaming.
