# 08 — Action Plan

**Objetivo:** pasar de "stack que no arranca como está documentado" a "servicio familiar usable, seguro y verificable", en tres etapas.
**Regla:** no se toca código de producción en esta fase. Este documento es el plan; la ejecución empieza después de la aprobación.

---

## 1. Prioridades

| Prioridad | Significado | Cantidad |
|---|---|---:|
| **P0** | Impide arrancar o cumplir el objetivo básico | 5 |
| **P1** | Rompe una función central o expone seguridad/datos | 20 |
| **P2/P3** | Degrada, confunde o es higiene | Resto (ver §5) |

**Regla de oro:** no se empieza la etapa B hasta que todos los P0 y los P1 de seguridad estén cerrados y probados.

---

## 2. Etapa A — Estabilidad y seguridad (1–2 semanas)

**Meta:** que el stack arranque, sea seguro en LAN y reproduzca un título en un dispositivo.

### A1. Arreglar el arranque de Vagrant (P0, OPS-01)

**Qué:**
- Agregar `config.vm.synced_folder "..", "/vagrant"` en `vm/Vagrantfile`, **o** mover el `Vagrantfile` a la raíz del repo.
- Verificar que `/vagrant/docker-compose.yml` exista dentro de la VM.
- Alternativa recomendada: **eliminar Vagrant** y correr Docker en el host o en un mini-PC/NAS. Menos capas, menos fallas.

**Aceptación:**
```bash
vagrant ssh -c 'ls -l /vagrant/docker-compose.yml'
```
→ existe.

**Esfuerzo:** 1 h. **Depende de:** decisión VM vs. Docker nativo.

---

### A2. Arreglar la red para la LAN (P0, ARCH-01)

**Qué:**
- Si se mantiene Vagrant: `public_network` (bridged) **o**, como mínimo, apuntar `BASE_URL`/`HOST_URL` a la IP LAN del host (los forwarded ports ya bindean a todas las interfaces) y forwardear 53.
- Si se usa Docker nativo: publicar solo 3000/8000/80/443 en la IP LAN; no publicar 8888/9696/8053 al WAN.
- Documentar la IP/DNS que deben usar los dispositivos.

**Aceptación:**
- Desde un telefono en la misma Wi-Fi: `curl -I http://<IP-host>:3000` → 200/302.
- El manifest que genera AIOStreams usa una URL alcanzable desde la LAN (no `192.168.56.10`).
- Desde la TV: instalar el addon.

**Esfuerzo:** 2–4 h. **Depende de:** A1.

---

### A3. Arreglar Unbound o eliminarlo (P0, OPS-03)

**Opción recomendada para v1: eliminarlo.** No es necesario para streaming y es la causa del crash-loop.

**Si se mantiene:**
- Crear `config/unbound/unbound.conf` recursivo real (root hints, sin `forward-zone` a Cloudflare).
- Crear `a-records.conf`, `srv-records.conf`, `forward-records.conf` (aunque estén vacíos) en el directorio montado.
- Montar solo los archivos, no el directorio completo:
  ```yaml
  volumes:
    - ./config/unbound/unbound.conf:/opt/unbound/etc/unbound/unbound.conf:ro
  ```
- Cambiar el healthcheck a `unbound-control status` o `drill`.

**Aceptación:**
```bash
docker compose logs unbound | grep -i "fatal\|error"   # vacío
docker compose ps unbound                               # healthy
```
Y `dig @<IP> google.com` responde.

**Esfuerzo:** 2–4 h. **Depende de:** decisión de mantener DNS propio.

---

### A4. Arreglar el healthcheck de AIOStreams (P0, OPS-04)

**Qué:**
```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/v1/status"]
```
(o usar el healthcheck nativo de la imagen, sin override).

**Aceptación:**
```bash
docker inspect --format '{{.State.Health.Status}}' aiostreams   # healthy
docker compose ps caddy                                          # Up
```

**Esfuerzo:** 15 min. **Depende de:** nada.

---

### A5. Arreglar Caddy / TLS (P0, OPS-02, SEC-09)

**Opción A (LAN):** usar el hostname real:
```caddyfile
https://192.168.56.10 {
    tls internal
    reverse_proxy aiostreams:3000
}
```
Y aceptar que hay que instalar la CA de Caddy en cada dispositivo. **No escala para familiares.**

**Opción B (recomendada):** **Cloudflare Tunnel** con un dominio real; Caddy deja de ser el TLS público. El túnel termina TLS con un certificado válido.

**Opción C:** Caddy con Let's Encrypt y dominio público (requiere 80/443 abiertos y IP pública).

**Aceptación:**
```bash
curl -I https://<host>          # 200, sin -k
```
Y la TV instala el addon sin advertencias.

**Esfuerzo:** 2–4 h (A), 1–2 h (B). **Depende de:** dominio/túnel.

---

### A6. Arreglar Pi-hole v6 (P1, SEC-03, OPS-05, OPS-06)

**Si se mantiene:**
```yaml
environment:
  - FTLCONF_webserver_api_password=${PIHOLE_WEBPASSWORD}
  - FTLCONF_dns_listeningMode=ALL
```
- Upstream de Pi-hole: `unbound#53` (no `5335`).
- Deshabilitar `systemd-resolved` o `DNSStubListener=no` en la VM para liberar el puerto 53.
- Fijar `pihole/pihole:<versión>` (no `latest`).

**Aceptación:**
- Login en `:8053/admin` con la password nueva.
- `dig @<IP> google.com` desde otro dispositivo → responde.
- `ss -lunpt | grep :53` muestra el contenedor, no systemd-resolved.

**Esfuerzo:** 2–4 h. **Depende de:** A2, A3.

**Alternativa recomendada:** eliminar Pi-hole/Unbound de la v1. No aportan al streaming y agregan dos puntos de falla.

---

### A7. Cerrar la seguridad (P1, SEC-01, SEC-02, SEC-04, SEC-06, SEC-08)

**Qué:**
- `AIOSTREAMS_AUTH` activo; probar que el dashboard pide credenciales.
- `API_PASSWORD`, `MEDIAFLOW_API_PASSWORD`, `PIHOLE_WEBPASSWORD` aleatorios (`openssl rand -hex 16`).
- `umask 077` + `chmod 600 .env`.
- `SECRET_KEY` separado para MediaFusion (32 hex), en un `env_file` propio.
- Prowlarr con auth; no publicar 9696.
- MediaFlow solo interno.
- Rotar la API key de TorBox si estuvo expuesta.

**Aceptación:**
```bash
grep -E "changeme" .env          # sin resultados
curl -I http://<IP>:3000         # 401/302
curl -I http://<IP>:9696         # login
stat -c '%a' .env                # 600
```

**Esfuerzo:** 2–3 h. **Depende de:** A4.

---

### A8. Corregir la manifest URL y la documentación (P1, STR-01, STR-02)

**Qué:**
- Documentar el formato v2: `/stremio/<uuid>/<encryptedPassword>/manifest.json`.
- Usar el botón "Copy manifest URL" de AIOStreams; no inventar tokens.
- `BASE_URL` y `HOST_URL` = URL pública HTTPS (o IP LAN si es solo LAN).
- Si MediaFusion se mantiene, agregarlo a Caddy/túnel con su propio hostname.
- Actualizar `README.md`, `docs/WIRING.md`, `config/stremio-addons.md`.

**Aceptación:**
```bash
curl -sS '<manifest-url>' | jq .id    # JSON válido
```
Y el addon se instala en Stremio.

**Esfuerzo:** 1–2 h. **Depende de:** A5.

---

### A9. Smoke test real (bloqueante para cerrar A)

**Checklist:**
- [ ] `docker compose up -d --wait` → todos `healthy`.
- [ ] `curl -f https://<host>/api/v1/status` → 200.
- [ ] Login al dashboard con auth.
- [ ] TorBox configurado; `checkcached` devuelve resultados.
- [ ] Instalar manifest en un dispositivo; ver streams.
- [ ] Reproducir 1 título H.264/AAC de 1080p.
- [ ] Reproducir 1 título HEVC (si el dispositivo lo soporta).
- [ ] Reiniciar el stack y repetir.
- [ ] Revisar logs: sin secretos, sin crash-loops.

**Aceptación:** todo lo anterior pasa en **un** dispositivo. Recién entonces se puede decir "funciona en LAN".

**Esfuerzo:** 2–4 h. **Depende de:** A1–A8.

---

### A10. Higiene (P2/P3, DOC-01, DOC-02, DOC-09, OPS-08, OPS-11, OPS-13)

- Borrar los 6 artefactos `'@ | Set-Content ...`.
- Corregir el `EOF` suelto de `setup.sh:93`; mover `chmod` antes.
- Unificar MediaFusion 6.0.0 vs 6.1.6.
- Fijar versiones/digests (empezar por Pi-hole, Caddy, AIOStreams).
- Cambiar el healthcheck de MediaFlow a `python -c "import urllib.request; urllib.request.urlopen('http://localhost:8888/docs')"` o instalar `curl`.
- Quitar `version: "3.9"`.
- Agregar `logging` (max-size/max-file) a todos los servicios.

**Esfuerzo:** 2–3 h. **Depende de:** nada.

---

## 3. Etapa B — Acceso familiar y multi-dispositivo (2–4 semanas)

**Meta:** que 2–3 familiares entren desde su dispositivo, sin soporte técnico, con HTTPS válido.

### B1. Elegir la vía de acceso remoto (decisión)

| Opción | Cuándo | Costo | Privacidad |
|---|---|---|---|
| **Cloudflare Tunnel + Access** | Familiares no técnicos | Dominio (~USD 10/año) | Cloudflare ve metadata |
| **Tailscale** | Familiares pueden instalar una app | Gratis | Alta |
| **VPS + Caddy + LE** | Host de casa no always-on | USD 5–10/mes | Media |
| **Solo LAN** | No hay remoto | Bajo | Alta |

**Recomendación:** Cloudflare Tunnel + Access para la familia; Tailscale para administración.

**Aceptación:** un familiar abre `https://<dominio>` desde 4G, se autentica con OTP y reproduce.

**Esfuerzo:** 3–6 h.

---

### B2. Perfiles y permisos (P1, SEC-05)

- Un perfil por persona en AIOStreams.
- Límite de calidad por perfil (ej. 1080p para remotos).
- Revocación documentada: borrar el perfil y rotar el link.
- No compartir la manifest maestra.

**Aceptación:** 3 perfiles; revocar uno corta el acceso sin afectar a los demás.

**Esfuerzo:** 2–3 h.

---

### B3. Matriz de dispositivos y pruebas reales (P2, DEV-01..08)

- Probar la matriz de `05_DEVICE_COMPATIBILITY.md` en al menos: 1 Android TV/Fire TV, 1 Samsung/LG, 1 telefono, 1 desktop.
- Registrar: codec, audio, subtítulos, mando, tiempo de arranque.
- Elegir un cliente principal por dispositivo.

**Aceptación:** 4/4 dispositivos reproducen un título H.264/AAC y, si soportan, HEVC.

**Esfuerzo:** 1–2 días.

---

### B4. Onboarding de 3 pasos (P1, UX-01, UX-06)

- Guía de una página por dispositivo, con capturas reales.
- Quick Connect en TV.
- Página de troubleshooting con 6 casos.
- Canal de soporte.

**Aceptación:** un familiar no técnico lo hace solo en <10 min.

**Esfuerzo:** 1 día.

---

### B5. Subtítulos VOSE (P2, UX/STR)

- Usar el sync incorporado de la app AIOStreams.
- Fallback: Subtitle Sync en Stremio.
- Preferencias ES/EN por perfil.
- Probar 3 títulos con subtítulos forzados.

**Aceptación:** 3/3 títulos con subtítulos sincronizados.

**Esfuerzo:** 2–4 h.

---

### B6. Always-on (P1, ARCH-04)

- Deshabilitar suspensión del host.
- UPS o al menos monitoreo de caídas.
- Si no es viable: mover AIOStreams a un VPS (el video sigue directo desde TorBox).

**Aceptación:** 7 días seguidos con el control plane disponible; alerta si se cae.

**Esfuerzo:** 2–4 h + hardware.

---

## 4. Etapa C — Optimización y deportes (2–4 semanas)

### C1. MediaFlow selectivo (P1, STR-03, ARCH-02)

- Desactivar MediaFlow para VOD.
- Activarlo solo para addons de vivo/IPTV que necesiten headers.
- Medir latencia y tráfico con/sin proxy.

**Aceptación:** VOD directo; vivo sin buffering; `docker stats` estable.

**Esfuerzo:** 2 h + medición.

---

### C2. Deportes: decidir con honestidad (P1)

- **Gratis:** MediaFusion + scrapers; disponibilidad no garantizada; mantener como best-effort.
- **Pago:** IPTV premium estable + addon M3U; único camino a "cero downtime".
- **No** prometer deportes gratuitos estables.

**Aceptación:** si se elige IPTV, un canal de prueba funciona 60 min sin cortes; si no, se documenta la limitación.

**Esfuerzo:** 1–2 días (evaluación) + costo.

---

### C3. Límites, logs, backups y monitoreo (P1/P2, OPS-09, OPS-10)

- `logging: max-size: 10m, max-file: 3` en todos.
- Límites de memoria/CPU por servicio.
- Backup diario de `data/` con retención; **probar restore**.
- Monitor simple (Uptime Kuma o script + Telegram).
- Alertas de consumo de TorBox.

**Aceptación:** restore probado; alerta llega; logs no crecen sin control.

**Esfuerzo:** 1 día.

---

### C4. Load test (P2, PERF-01)

- 3 streams simultáneos (1080p y 4K) desde 2 redes.
- Medir CPU/RAM/red de la VM; buffering.
- Ajustar calidad por perfil.

**Aceptación:** 3 streams 1080p estables; 4K documentado como "1–2 a la vez".

**Esfuerzo:** 1 día.

---

### C5. Evaluar VPS / managed (P2)

- Si el host no es always-on o el uplink no alcanza: VPS para AIOStreams.
- Si no se quiere operar nada: managed (ElfHosted).
- Comparar costo/privacidad/uptime.

**Aceptación:** decisión documentada con números.

**Esfuerzo:** 1 día.

---

## 5. Tabla maestra de hallazgos → acción

| ID | Sev. | Acción | Etapa | Esfuerzo |
|---|---|---|---|---|
| OPS-01 | P0 | Synced folder / mover Vagrantfile / quitar Vagrant | A1 | 1 h |
| OPS-02 | P0 | Caddy hostname o túnel | A5 | 2–4 h |
| OPS-03 | P0 | Config Unbound o eliminarlo | A3 | 2–4 h |
| OPS-04 | P0 | Healthcheck `/api/v1/status` | A4 | 15 min |
| ARCH-01 | P0 | Bridged/forwarded ports/53 | A2 | 2–4 h |
| SEC-01 | P1 | `AIOSTREAMS_AUTH` | A7 | 1 h |
| SEC-02 | P1 | Passwords aleatorios | A7 | 30 min |
| SEC-03 | P1 | Pi-hole v6 env | A6 | 1 h |
| OPS-05 | P1 | Upstream `unbound#53` | A6 | 15 min |
| OPS-06 | P1 | Liberar puerto 53 | A6 | 1 h |
| SEC-04 | P1 | `SECRET_KEY` separado | A7 | 1 h |
| STR-01 | P1 | Manifest URL v2 | A8 | 30 min |
| STR-02 | P1 | HTTPS MediaFusion | A8/B1 | 2 h |
| SEC-05 | P1 | Perfiles/links | B2 | 2–3 h |
| SEC-09 | P1 | TLS válido | A5 | 2–4 h |
| SEC-10 | P1 | Repo privado / limpiar docs | A10 | 1 h |
| STR-03 | P1 | MediaFlow off VOD | C1 | 2 h |
| STR-04 | P1 | TTL/re-resolución | C1 | 1 h |
| ARCH-04 | P1 | Always-on | B6 | 2–4 h |
| OPS-07 | P1 | No exponer puertos directos | A7 | 1 h |
| OPS-08 | P1 | Pins/digests | A10 | 2 h |
| OPS-09 | P1 | Logs/límites | C3 | 2 h |
| OPS-10 | P1 | Backups | C3 | 2 h |
| SEC-06 | P2 | `chmod 600 .env` | A7 | 5 min |
| SEC-08 | P2 | Prowlarr auth | A7 | 30 min |
| DOC-01 | P2 | Borrar artefactos | A10 | 15 min |
| DOC-02 | P2 | Unificar versión | A10 | 15 min |
| DOC-03..08 | P2 | Corregir docs | A10 | 2 h |
| DOC-09 | P2 | Arreglar `EOF` | A10 | 15 min |
| DOC-10 | P2 | Flujo auth v2 | A8 | 30 min |
| OPS-11 | P2 | Healthcheck MediaFlow | A10 | 15 min |
| DEV-01..08 | P2 | Matriz/onboarding | B3/B4 | 2–3 días |
| UX-01..08 | P1/P2 | Onboarding/troubleshooting | B4 | 1–2 días |
| OPS-12 | P2 | Prowlarr auth | A7 | 30 min |
| OPS-13 | P3 | Quitar `version` | A10 | 5 min |
| OPS-14 | P3 | `shm_size` Postgres | C3 | 5 min |
| OPS-15 | P3 | `--wait` en provision | A10 | 10 min |
| SEC-07 | P3 | Redis/Postgres auth | C3 | 30 min |
| DOC-11..13 | P3 | Higiene docs | A10 | 30 min |

---

## 6. Cronograma sugerido

| Semana | Qué |
|---|---|
| **1** | A1–A6: arranque, red, Unbound, healthcheck, Caddy, Pi-hole |
| **2** | A7–A10: seguridad, manifest, smoke test, higiene |
| **3–4** | B1–B3: túnel, perfiles, dispositivos |
| **5–6** | B4–B6: onboarding, subtítulos, always-on |
| **7–8** | C1–C3: MediaFlow, deportes, límites/backups |
| **9–10** | C4–C5: load test, VPS/managed |

**No es una promesa:** depende de acceso a hardware, dominio y cuenta TorBox.

---

## 7. Decisiones que necesito del usuario antes de la etapa B

1. **¿Remoto sí o no?** Si no, la etapa B se reduce a LAN y no hace falta dominio/túnel.
2. **¿Cloudflare, Tailscale o VPS?** Cambia el costo y la privacidad.
3. **¿El host puede estar encendido 24/7?** Si no, VPS.
4. **¿Se mantiene Pi-hole/Unbound?** Recomiendo sacarlos de la v1.
5. **¿Se mantiene MediaFusion/Prowlarr/TRAWL?** Recomiendo sacarlos hasta que VOD esté estable.
6. **¿Deportes gratis o IPTV paga?** Define la promesa de disponibilidad.
7. **¿Presupuesto mensual?** TorBox + dominio + IPTV/VPS.

---

## 8. Lo que NO se debe hacer

- **No** construir un frontend/player propio: AIOStreams v2 ya tiene apps, perfiles, continue watching y subtítulos.
- **No** activar MediaFlow para todo.
- **No** compartir la manifest maestra ni la API key.
- **No** exponer 3000/8000/8888/9696/8053 a Internet.
- **No** usar `tls internal` para familiares.
- **No** mantener 11 servicios si 4 alcanzan.
- **No** declarar "listo" sin smoke test en un dispositivo real y una prueba remota.
- **No** seguir publicando dominios de piratería en un repo público.

---

## 9. Definición de "terminado"

### Etapa A
- [ ] `vagrant up` (o `docker compose up -d --wait`) termina sin error.
- [ ] Todos los servicios `healthy` (o los que queden).
- [ ] TLS válido en LAN (o túnel).
- [ ] Auth activo; sin `changeme`.
- [ ] Un dispositivo reproduce un título.
- [ ] `07_TEST_RESULTS.md` actualizado con evidencia real.

### Etapa B
- [ ] Un familiar entra desde 4G y reproduce.
- [ ] 3 perfiles; revocación probada.
- [ ] 4 dispositivos probados.
- [ ] Onboarding de 3 pasos.
- [ ] Subtítulos VOSE en 3 títulos.
- [ ] 7 días de uptime.

### Etapa C
- [ ] VOD directo (sin MediaFlow).
- [ ] Deportes: decisión y limitación documentada.
- [ ] Backups con restore probado.
- [ ] Logs/límites/monitoreo.
- [ ] Load test 3 streams.
- [ ] Decisión VPS/managed.

---

## 10. Cierre

El proyecto tiene una base rescatable: **AIOStreams + TorBox** es una buena elección. Lo que falla es la capa alrededor: red, TLS, auth, DNS, documentación y alcance.

La forma más rápida de llegar a algo usable no es agregar más servicios, sino **sacar los que no aportan** y **probar de punta a punta** con un dispositivo real. La etapa A es corta y de alto impacto; sin ella, todo lo demás es teórico.
