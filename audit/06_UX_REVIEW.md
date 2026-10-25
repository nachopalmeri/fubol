# 06 — UX Review

**Alcance:** experiencia de instalación, navegación, reproducción, subtítulos, compartir y soporte.
**Método:** recorrido de los flujos documentados + documentación oficial de los clientes. **No se tomaron capturas** porque no hay una instancia corriendo en este entorno (sin Docker/Vagrant/TorBox). No se inventan pantallas ni mediciones de usabilidad.

---

## 1. Qué UX existe realmente

El repositorio **no tiene UI**. No hay componentes, pantallas, estados, botones ni player. La UX es la suma de:

1. **AIOStreams dashboard/configure** (administrador).
2. **Stremio** (TV/desktop/móvil).
3. **Nuvio** (Android).
4. **App AIOStreams v2** (navegador/desktop/Android/TV).
5. **Addon Subtitle Sync** (subtítulos).
6. **Pi-hole/Prowlarr/MediaFusion** (administración técnica).

Por eso este informe evalúa **flujos**, no píxeles. Cualquier afirmación sobre "se ve bien" sería inventada.

---

## 2. Flujos actuales, paso a paso

### 2.1 Administrador: primer arranque

```
1. Instalar VirtualBox + Vagrant
2. cd vm && vagrant up
3. Esperar 5–10 min
4. Abrir http://192.168.56.10:3000
5. Crear usuario admin (usuario + password)
6. Services → agregar TorBox → pegar API key
7. Addons → Marketplace → Torrentio/Comet/MediaFusion
8. Proxy → MediaFlow → http://mediaflow-proxy:8888 + password
9. Save & Install → copiar manifest
10. Repetir para cada familiar
```

**Problemas:**
- El paso 2 **falla** (OPS-01).
- El paso 4 puede no abrir Caddy (OPS-04) y el TLS no funciona (OPS-02).
- El paso 5 no es el flujo real de v2 (DOC-10).
- El paso 9 produce una URL que el README documenta mal (STR-01).
- No hay verificación entre pasos ("¿cómo sé que TorBox quedó bien?").
- 10 pasos para el administrador; **7+ para cada familiar**.

### 2.2 Familiar: instalar en una TV

```
1. Instalar Stremio desde la tienda de la TV
2. Abrir Stremio → Addons → Install from URL
3. Tipear una URL de ~100 caracteres con el control remoto
4. Esperar
5. Buscar una película
6. Elegir un stream entre decenas
7. Reproducir
8. Si no se ve, probar otro stream
9. Si no hay subtítulos, instalar Subtitle Sync y configurar
```

**Problemas:**
- Tipear la URL en una TV es la peor fricción del flujo.
- La URL del README no funciona.
- Si la TV está en otra red, no llega (ARCH-01).
- Si el stream es HEVC/MKV y la TV no lo soporta, pantalla negra.
- No hay "perfil" ni "continuar viendo" configurado por el stack (depende del cliente).
- No hay un botón "pedir ayuda" ni un estado de error claro.

### 2.3 Compartir un contenido

```
1. El administrador crea un usuario en AIOStreams
2. Copia la manifest
3. Se la manda por WhatsApp
4. El familiar la instala
5. Puede buscar CUALQUIER cosa, no solo lo compartido
```

**Problemas:**
- No es un enlace de contenido; es acceso total (SEC-05).
- No hay vencimiento ni revocación por link.
- El familiar puede reenviar la manifest.
- No hay forma de saber quién está usando la cuenta.

### 2.4 Subtítulos VOSE

```
1. Instalar Subtitle Sync en Stremio
2. Configurar idiomas ES/EN
3. (A veces) crear cuenta de OpenSubtitles
4. Reproducir
5. Si no sincroniza, elegir otra pista
```

**Problemas:**
- Es config per usuario, no del stack.
- Depende de un addon de terceros.
- La app AIOStreams ya tiene sync incorporado; el repo no la menciona.
- No hay garantía de VOSE en todos los títulos.

---

## 3. Hallazgos UX

### UX-01 — La instalación del familiar es demasiado técnica

| Campo | Valor |
|---|---|
| **ID** | UX-01 |
| **Severidad** | **P1** |
| **Categoría** | UX / Onboarding |
| **Descripción** | El familiar debe instalar una app, entrar a Addons, pegar una URL larga y elegir streams. No hay un flujo de invitación ni un código corto. |
| **Evidencia** | `README.md:124-137`; `docs/WIRING.md:29-34`. |
| **Esperado** | Link corto o código de 6 dígitos; la app se configura sola. |
| **Actual** | URL larga + pasos manuales. |
| **Impacto** | Cada familiar requiere una sesión de soporte; algunos no lo logran. |
| **Fix** | Usar **Quick Connect** de AIOStreams en TV; para el resto, un link corto de invitación (si AIOStreams lo permite) o una guía con capturas. |
| **Esfuerzo** | S |
| **Test que valida** | Un familiar no técnico instala y reproduce sin ayuda, en <5 min. |
| **Estado** | **CONFIRMADO** por documentación. |

---

### UX-02 — No hay enlace por contenido

| Campo | Valor |
|---|---|
| **ID** | UX-02 |
| **Severidad** | **P1** |
| **Categoría** | UX / Producto |
| **Descripción** | Compartir manda al familiar al addon completo, no a la película. No hay "abrí esto". |
| **Evidencia** | `README.md:124-137`; ausencia de share service. |
| **Esperado** | Un link que abra el contenido y, si se quiere, expire. |
| **Actual** | Manifest completa. |
| **Impacto** | El familiar se pierde; el administrador no controla qué ve. |
| **Fix** | Perfiles/usuarios de AIOStreams; si se necesita link por contenido, construir un share service (L). |
| **Estado** | **CONFIRMADO**. |

---

### UX-03 — Errores sin explicación

| Campo | Valor |
|---|---|
| **ID** | UX-03 |
| **Severidad** | **P2** |
| **Categoría** | UX / Soporte |
| **Descripción** | Si TorBox no tiene slots, el link expiró, el addon no está instalado o el codec no se soporta, el cliente muestra un error genérico o "no hay streams". No hay guía de troubleshooting. |
| **Evidencia** | No hay sección de errores en `README.md`; no hay health dashboard para el usuario. |
| **Esperado** | Mensajes claros y un "si pasa X, hacé Y". |
| **Actual** | "No anda". |
| **Impacto** | El administrador recibe mensajes sin contexto y no sabe qué revisar. |
| **Fix** | Página de troubleshooting con 6 casos: sin streams, 403, buffering, sin audio, sin subtítulos, no instala. |
| **Esfuerzo** | S |
| **Estado** | **CONFIRMADO** por ausencia. |

---

### UX-04 — La TV no tiene un flujo de foco/legibilidad propio

| Campo | Valor |
|---|---|
| **ID** | UX-04 |
| **Severidad** | **P2** |
| **Categoría** | UX / TV |
| **Descripción** | No hay diseño propio de foco, tamaño de texto, navegación con D-pad ni estados de carga. Depende de Stremio/AIOStreams. No se puede evaluar sin dispositivo. |
| **Evidencia** | `git ls-files`; no hay CSS/componentes. |
| **Esperado** | Navegación por filas, foco visible, texto legible a 3 m. |
| **Actual** | Lo que haga el cliente. |
| **Impacto** | Si el cliente no está optimizado, la TV se siente torpe. |
| **Fix** | Usar clientes con UI de TV (Stremio TV, AIOStreams Android TV); probar foco y legibilidad en la TV real. |
| **Esfuerzo** | S (elegir cliente) |
| **Test que valida** | Recorrer 10 títulos con el control remoto; medir pasos y errores. |
| **Estado** | **NO VERIFICADO**; no hay dispositivo. |

---

### UX-05 — No hay "continuar viendo" del lado del stack

| Campo | Valor |
|---|---|
| **ID** | UX-05 |
| **Severidad** | **P2** |
| **Categoría** | UX / Producto |
| **Descripción** | El repo no configura perfiles ni sincronización de progreso. Stremio/AIOStreams pueden hacerlo, pero no está documentado ni garantizado. |
| **Evidencia** | `README.md` no lo menciona; AIOStreams app sí tiene continue watching (docs). |
| **Esperado** | "Seguir viendo" por persona. |
| **Actual** | Depende del cliente y de la cuenta. |
| **Impacto** | Cada dispositivo empieza de cero; mala experiencia familiar. |
| **Fix** | Usar perfiles de AIOStreams y su app; documentar la limitación de Stremio. |
| **Esfuerzo** | S |
| **Estado** | **NO VERIFICADO**. |

---

### UX-06 — No hay capturas ni guía visual

| Campo | Valor |
|---|---|
| **ID** | UX-06 |
| **Severidad** | **P2** |
| **Categoría** | Documentación |
| **Descripción** | El README es texto y tablas; no hay capturas de la UI, del flujo de instalación ni de los errores. |
| **Evidencia** | `README.md`; `config/stremio-addons.md`. |
| **Esperado** | Guía con 3–5 capturas por dispositivo. |
| **Actual** | Solo texto. |
| **Impacto** | El familiar no puede seguir la guía solo. |
| **Fix** | Capturas de la instancia real (cuando exista) y una guía de una página. |
| **Esfuerzo** | S |
| **Estado** | **CONFIRMADO** por ausencia; no se pudieron tomar capturas. |

---

### UX-07 — La app AIOStreams no se menciona

| Campo | Valor |
|---|---|
| **ID** | UX-07 |
| **Severidad** | **P2** |
| **Categoría** | UX / Producto |
| **Descripción** | AIOStreams v2 tiene apps para navegador, desktop, Android y TV, con perfiles, continue watching, subtítulos y Quick Connect. El repo recomienda Stremio/Nuvio y no menciona la app, que resuelve la mayoría de las fricciones. |
| **Evidencia** | Docs oficiales de AIOStreams apps; `README.md` no la menciona. |
| **Esperado** | Evaluar la app primero. |
| **Actual** | Se recomienda un cliente de terceros. |
| **Impacto** | Se pierde la mejor UX disponible sin construir nada. |
| **Fix** | Agregar la app AIOStreams como opción principal en Android TV/desktop/telefono; Stremio como fallback en Samsung/LG. |
| **Esfuerzo** | XS |
| **Estado** | **DOCUMENTADO**. |

---

### UX-08 — El administrador no tiene un panel de estado

| Campo | Valor |
|---|---|
| **ID** | UX-08 |
| **Severidad** | **P2** |
| **Categoría** | Operación |
| **Descripción** | No hay una vista simple de "todo ok / algo caído". Hay que entrar a `docker compose ps`, logs, etc. |
| **Evidencia** | `README.md`; no hay dashboard/monitor. |
| **Esperado** | Un semáforo de servicios y un comando de health. |
| **Actual** | `docker compose ps` manual. |
| **Impacto** | El administrador se entera de las caídas por un mensaje de la familia. |
| **Fix** | Script `healthcheck.sh` + alerta por Telegram/email (opcional). |
| **Esfuerzo** | S |
| **Estado** | **CONFIRMADO** por ausencia. |

---

## 4. Heurísticas de usabilidad (evaluación cualitativa)

| Heurística | Evaluación | Comentario |
|---|---|---|
| Visibilidad del estado | **Mala** | No hay estados de "resolviendo", "sin slots", "link expirado". |
| Correspondencia con el mundo real | **Media** | "Streams", "debrid", "manifest" no son lenguaje de usuario. |
| Control y libertad | **Mala** | No hay forma de cancelar/reintentar claro; el familiar depende del administrador. |
| Consistencia | **Media** | Stremio/AIOStreams/Nuvio tienen UIs distintas. |
| Prevención de errores | **Mala** | URL manual, sin validación; contraseñas default. |
| Reconocimiento vs. recuerdo | **Mala** | Hay que recordar la URL, el addon, el stream elegido. |
| Flexibilidad y eficiencia | **Media** | Power users pueden; familiares no. |
| Diseño minimalista | **Mala** | 11 servicios para 3 usuarios. |
| Ayuda al usuario | **Mala** | No hay troubleshooting ni onboarding. |
| Accesibilidad | **No evaluable** | Sin dispositivo ni capturas. |

---

## 5. Propuesta de UX mínima (sin construir un frontend)

1. **Un solo cliente por dispositivo**, documentado en una tabla (ver `05_DEVICE_COMPATIBILITY.md`).
2. **Quick Connect** en TV para evitar tipear URLs.
3. **Un link corto de invitación** por persona (si AIOStreams lo permite) o una guía con capturas.
4. **Tres pasos** en la guía del familiar: instalar app → ingresar código → elegir película.
5. **Página de troubleshooting** con 6 casos y un botón "copiar diagnóstico".
6. **Nombre y logo del servicio** ("Cine en casa") en la app, no "AIOStreams".
7. **Perfiles** con nombre y avatar; límites de calidad por perfil.
8. **Subtítulos por defecto** ES/EN y sync automático.
9. **Estado del servicio** visible para el administrador (script o monitor).
10. **Un canal de soporte** (WhatsApp del administrador) y un horario.

---

## 6. Lo que no se pudo evaluar

- **No hay capturas** de la UI real: no hay instancia corriendo.
- **No hay pruebas con usuarios**: no hay familiares ni dispositivos en este entorno.
- **No hay medición de tiempos** de instalación/reproducción.
- **No hay evaluación de accesibilidad** (contraste, tamaño de fuente, lectores de pantalla).
- **No hay evaluación de foco D-pad** en una TV real.
- **No hay evaluación de latencia percibida**.

Cualquier número de "satisfacción" o "tiempo de instalación" en este informe sería inventado. No se incluye.

---

## 7. Veredicto de UX

**3/10.** La UX no está diseñada: está delegada. Para el administrador es aceptable (una vez que aprende); para la familia es frustrante. La buena noticia es que **AIOStreams v2 ya resolvió gran parte** (apps, perfiles, Quick Connect, subtítulos, continue watching); el repo simplemente no lo usa ni lo documenta.

**Mayor mejora con menor esfuerzo:** adoptar la app AIOStreams en Android TV/desktop/telefono y Stremio nativo en Samsung/LG, con una guía de 3 pasos y una página de troubleshooting.
