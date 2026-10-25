# 05 — Compatibilidad de dispositivos

**Alcance:** qué cliente usar en cada dispositivo, qué codecs puede reproducir, cómo se instala el addon y qué limitaciones tiene el control remoto.
**Estado:** investigación de documentación oficial + configuración del repo. **No se probó en ningún dispositivo físico.** Cada fila lleva su estado.

> **Leyenda**
> **VERIFICADO** = comprobado en este entorno (código/config).
> **DOCUMENTADO** = fuente oficial del fabricante/proyecto, no ejecutado.
> **NO VERIFICADO** = no hay evidencia suficiente.
> **FALLA CONFIRMADA** = la configuración del repo impide el caso.
> **NO SOPORTADO** = no existe cliente nativo.

---

## 1. Matriz de clientes

| Dispositivo | Cliente recomendado | Estado | Notas |
|---|---|---|---|
| **Windows / macOS / Linux** | App AIOStreams (mpv) o Stremio desktop | **DOCUMENTADO** | La app AIOStreams usa mpv: máxima compatibilidad de codecs. Stremio desktop también reproduce casi todo. |
| **Android phone/tablet** | App AIOStreams o Stremio Android | **DOCUMENTADO** | App AIOStreams usa ExoPlayer + mpv. Stremio Android usa su player; probar HEVC/AC3. |
| **Android TV / Google TV / Fire TV** | App AIOStreams (layout TV) o Stremio Android TV | **DOCUMENTADO** | La app AIOStreams tiene Quick Connect para no tipear URLs. Stremio TV tiene UI leanback. |
| **Samsung TV (Tizen 2019+)** | Stremio nativo | **DOCUMENTADO** | Stremio tiene app nativa. La app AIOStreams para Tizen es sideload y solo probada en emulador. |
| **LG TV (webOS 2020+)** | Stremio nativo | **DOCUMENTADO** | Ídem Samsung: Stremio es la opción práctica; AIOStreams TV es sideload/emulador. |
| **Sony / Philips / Hisense (Android TV)** | App AIOStreams o Stremio | **DOCUMENTADO** | Si es Android TV, aplica la fila de Android TV. |
| **iPhone / iPad** | Stremio iOS (limitado) o navegador / app Jellyfin | **DOCUMENTADO / NO VERIFICADO** | La versión iOS de Stremio es limitada; la app AIOStreams no es nativa para iOS: se usa navegador o Jellyfin. |
| **Apple TV** | Stremio tvOS o navegador/Jellyfin | **DOCUMENTADO / NO VERIFICADO** | Stremio lista Apple TV; la app AIOStreams no tiene app tvOS nativa. |
| **Navegador (cualquier SO)** | App AIOStreams web | **DOCUMENTADO** | **Falla con MKV, HEVC y audio surround**; sirve para H.264/AAC y HLS. |
| **Steam Deck / Raspberry Pi** | Stremio Linux / Flatpak | **DOCUMENTADO** | Stremio lista ambos; codecs según build. |
| **Meta Quest / Pico** | Stremio VR | **DOCUMENTADO** | Stremio lista VR; no relevantes para el objetivo. |
| **PlayStation / Xbox** | — | **NO SOPORTADO** | No hay app nativa de Stremio/AIOStreams. Solo navegador de la consola, con limitaciones de codecs. |
| **Chromecast / AirPlay** | — | **NO VERIFICADO** | No hay soporte documentado en el repo; la app AIOStreams tiene "play on another device"/watch together, no cast genérico. |

---

## 2. Lo que el repo asume vs. la realidad

| Afirmación del repo | Realidad |
|---|---|
| "Stremio/Nuvio" como clientes | Stremio cubre más plataformas; **Nuvio es Android/Android TV/Fire TV** (según el repo), no iPhone/Samsung/LG. |
| "Instalar manifest URL" | En una TV, tipear una URL de 100+ caracteres con el control remoto es inviable. AIOStreams tiene **Quick Connect**; Stremio no. |
| "VOSE con Subtitle Sync" | Requiere configurar el addon por usuario y, a veces, una cuenta/API key. AIOStreams app tiene sync incorporado. |
| "HTTPS para compartir" | El Caddyfile actual no emite certificado; y un certificado interno no lo confía la TV. |
| "TV en la misma Wi-Fi" | La VM está en red host-only y las URLs apuntan a `192.168.56.10`; la TV no puede resolverlas (ARCH-01). |

---

## 3. Codecs: la tabla que falta en el repo

| Contenedor / codec | Navegador | App AIOStreams desktop (mpv) | App AIOStreams Android | Stremio TV (Samsung/LG) | Stremio Android TV |
|---|---|---|---|---|---|
| MP4 / H.264 / AAC | ✅ | ✅ | ✅ | ✅ | ✅ |
| MKV / H.264 / AAC | ❌ | ✅ | ✅ | ⚠️ | ✅ |
| MKV / HEVC / AAC | ❌ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| MKV / HEVC 10-bit HDR | ❌ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| AV1 | ❌ | ✅ (mpv reciente) | ⚠️ | ⚠️ (TV 2023+) | ⚠️ |
| AC3 / EAC3 | ❌ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| DTS / DTS-HD | ❌ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| HLS (m3u8) | ✅ | ✅ | ✅ | ✅ | ✅ |
| MPEG-TS | ❌ | ✅ | ✅ | ⚠️ | ✅ |

**Cómo leerla:** ✅ = debería funcionar; ⚠️ = depende del modelo/año/codec exacto; ❌ = no funciona. **No se probó en hardware.** La regla segura es **1080p H.264/AAC en MP4** para cualquier dispositivo; 4K HEVC solo en desktop/Android con mpv y TV compatible.

**Transcoding:** MediaFlow puede convertir a H.264/AAC, pero no está activado y un VM de 4 CPU no soporta 3 streams 4K. No es una solución mágica.

---

## 4. Hallazgos

### DEV-01 — No hay UI ni player propios

| Campo | Valor |
|---|---|
| **ID** | DEV-01 |
| **Severidad** | **P2** |
| **Categoría** | Producto / UX |
| **Descripción** | El repo no tiene frontend, player ni componentes. La experiencia es la de Stremio/Nuvio/AIOStreams, no la de este proyecto. |
| **Evidencia** | `git ls-files`; no hay `src/`, `app/`, `components/`, `package.json`. |
| **Esperado** | (Según el brief) una plataforma propia con player y continue watching. |
| **Actual** | Apps de terceros. |
| **Impacto** | No se puede auditar foco, legibilidad, botones, estados de error ni accesibilidad desde el repo. |
| **Fix** | Aceptar que el producto es AIOStreams v2 + clientes, o construir una capa propia (no recomendado). |
| **Esfuerzo** | S (decisión) / XL (construir) |
| **Estado** | **VERIFICADO** (ausencia). |

---

### DEV-02 — El navegador no reproduce MKV/HEVC/surround

| Campo | Valor |
|---|---|
| **ID** | DEV-02 |
| **Severidad** | **P2** |
| **Categoría** | Compatibilidad |
| **Descripción** | La app web de AIOStreams advierte que el navegador solo reproduce lo que puede decodificar: MKV, HEVC y surround suelen fallar. El repo no lo advierte ni sugiere alternativas. |
| **Evidencia** | Docs oficiales de la app AIOStreams (`docs.aiostreams.viren070.me/apps/`). |
| **Esperado** | Aviso y fallback (app desktop/Android, o 1080p H.264). |
| **Actual** | El usuario elige un 4K HEVC y ve pantalla negra. |
| **Impacto** | "No funciona" en el dispositivo más fácil de probar (navegador). |
| **Fix** | Guía de codecs; recomendar app nativa; priorizar H.264/AAC en el addon para navegador. |
| **Esfuerzo** | XS |
| **Test que valida** | Reproducir un MKV HEVC en Chrome/Edge → falla; en app desktop → funciona. |
| **Estado** | **DOCUMENTADO**; no probado. |

---

### DEV-03 — Apps de Samsung/LG: sideload y solo emulador

| Campo | Valor |
|---|---|
| **ID** | DEV-03 |
| **Severidad** | **P2** |
| **Categoría** | Compatibilidad / UX |
| **Descripción** | AIOStreams tiene apps para Tizen/webOS, pero no están en las tiendas: se instalan desde archivo y el propio proyecto dice que solo se probaron en emuladores, no en TVs reales. |
| **Evidencia** | Docs oficiales de AIOStreams Smart TV: "installed from a file... only been tried in LG's and Samsung's TV emulators so far". |
| **Esperado** | App de tienda o Stremio nativo. |
| **Actual** | Sideload con modo desarrollador; puede expirar. |
| **Impacto** | Para padres/familiares, inviable sin soporte técnico. |
| **Fix** | Usar Stremio nativo en Samsung/LG; reservar AIOStreams TV para Android TV/Fire TV. |
| **Esfuerzo** | XS (decisión) |
| **Test que valida** | Instalar Stremio en la TV y reproducir; comparar con la app sideload. |
| **Estado** | **DOCUMENTADO**. |

---

### DEV-04 — No hay matriz de dispositivos ni onboarding

| Campo | Valor |
|---|---|
| **ID** | DEV-04 |
| **Severidad** | **P2** |
| **Categoría** | UX / Documentación |
| **Descripción** | El README no dice qué cliente usar en cada dispositivo, cómo instalar el addon, ni qué hacer si el codec falla. No hay capturas. |
| **Evidencia** | `README.md` (sección de clientes genérica); `config/stremio-addons.md` (lista de addons, no guía por dispositivo). |
| **Esperado** | Guía de 3 pasos por dispositivo, con capturas y solución de problemas. |
| **Actual** | Documentación técnica para el administrador. |
| **Impacto** | Cada familiar requiere soporte manual. |
| **Fix** | Este informe + una guía de onboarding de una página. |
| **Esfuerzo** | S |
| **Estado** | **VERIFICADO** (ausencia). |

---

### DEV-05 — iPhone/iPad/Apple TV: soporte indirecto

| Campo | Valor |
|---|---|
| **ID** | DEV-05 |
| **Severidad** | **P2** |
| **Categoría** | Compatibilidad |
| **Descripción** | La app AIOStreams no tiene app nativa iOS/tvOS: se usa navegador o Jellyfin. Stremio iOS es una versión limitada. |
| **Evidencia** | Docs AIOStreams: "iPhone, iPad and Apple TV: a browser on iOS..." (y Jellyfin apps); downloads de Stremio: iOS "limited version". |
| **Esperado** | App nativa con las mismas funciones. |
| **Actual** | Navegador/Jellyfin o Stremio limitado. |
| **Impacto** | La experiencia no es equivalente a Android/desktop; codecs limitados. |
| **Fix** | Para iPhone/iPad, usar Jellyfin app contra el servidor de AIOStreams; o Stremio iOS si alcanza. |
| **Esfuerzo** | S |
| **Test que valida** | Instalar Jellyfin app y reproducir; comparar con Android. |
| **Estado** | **DOCUMENTADO**; no probado. |

---

### DEV-06 — Consolas sin soporte nativo

| Campo | Valor |
|---|---|
| **ID** | DEV-06 |
| **Severidad** | **P3** |
| **Categoría** | Compatibilidad |
| **Descripción** | No hay app de Stremio/AIOStreams para PlayStation/Xbox. Solo navegador de consola, con codecs limitados. |
| **Evidencia** | Descargas oficiales de Stremio (no lista consolas); docs AIOStreams (no lista consolas). |
| **Esperado** | N/A. |
| **Actual** | Navegador. |
| **Impacto** | Mala experiencia; no es un requisito del brief. |
| **Fix** | No prometer consolas. |
| **Esfuerzo** | — |
| **Estado** | **NO SOPORTADO**. |

---

### DEV-07 — Casting/AirPlay no documentado

| Campo | Valor |
|---|---|
| **ID** | DEV-07 |
| **Severidad** | **P2** |
| **Categoría** | Compatibilidad |
| **Descripción** | El repo no documenta Chromecast/AirPlay. La app AIOStreams tiene "play on another device"/watch together, pero no es cast genérico. |
| **Evidencia** | Docs AIOStreams; ausencia en README. |
| **Esperado** | Saber si se puede mandar de telefono a TV. |
| **Actual** | Incierto. |
| **Impacto** | El usuario intenta cast y falla. |
| **Fix** | Probar y documentar; si no hay cast, usar la app nativa de la TV. |
| **Esfuerzo** | S |
| **Estado** | **NO VERIFICADO**. |

---

### DEV-08 — Nuvio es Android-only (según el repo)

| Campo | ID |
|---|---|
| **ID** | DEV-08 |
| **Severidad** | **P2** |
| **Categoría** | Documentación |
| **Descripción** | El repo recomienda "Stremio/Nuvio" como si fueran equivalentes, pero Nuvio es Android/Android TV/Fire TV. No cubre Samsung/LG/iOS. |
| **Evidencia** | `README.md` (clientes); `config/stremio-addons.md:24-27` (Nuvio Android). |
| **Esperado** | Matriz por dispositivo. |
| **Actual** | Recomendación genérica. |
| **Impacto** | Un familiar con iPhone o LG no puede seguir la guía. |
| **Fix** | Usar Stremio como cliente universal; Nuvio solo Android. |
| **Esfuerzo** | XS |
| **Estado** | **VERIFICADO** por documentación del repo; no se accedió a docs oficiales de Nuvio. |

---

## 5. Recomendación por dispositivo (para la etapa B)

| Dispositivo | Primera opción | Fallback |
|---|---|---|
| Android TV / Fire TV | App AIOStreams (Quick Connect) | Stremio Android TV |
| Samsung / LG | Stremio nativo | Navegador (solo H.264) |
| Windows/Mac/Linux | App AIOStreams desktop (mpv) | Stremio desktop |
| Android phone/tablet | App AIOStreams | Stremio Android |
| iPhone/iPad | Jellyfin app o navegador | Stremio iOS limitado |
| Apple TV | Stremio tvOS o Jellyfin | Navegador |
| Consolas | Navegador (limitado) | — |

**Regla de oro:** una sola app por dispositivo, probada con un título H.264/AAC y un título HEVC. Si el HEVC falla, no es "el servidor": es el player.

---

## 6. Veredicto de compatibilidad

**3/10.** Stremio cubre casi todas las plataformas y AIOStreams tiene apps prometedoras, pero:
- no hay matriz ni pruebas,
- las apps de TV de AIOStreams son sideload/emulador,
- iOS/Apple TV dependen de navegador/Jellyfin,
- y el repo no distingue clientes.

Con una matriz y una prueba por dispositivo, esto puede subir a 7/10 sin escribir código. **Hoy no se puede afirmar que funcione en ninguna TV.**
