# Audit 19 — Conectores deportivos: MeteGol, Nuvio y Stremio

Fecha: 2026-10-28. Investigación documental sobre repositorios públicos y configuración local. No se ejecutó código externo, no se consultaron URLs de streams ni se hicieron sondeos masivos. No se instalaron dependencias.

## Hallazgo principal

No conviene integrar ninguno de estos tres repositorios como fuente de reproducción en Fubol. MeteGol documenta que enlaza canales de pago reemitidos sin autorización; SportsSphere y `live-sport-plugin` también agregan/proxyan fuentes de terceros, pero sus READMEs no acreditan derechos. La opción segura es conservar el conector existente y mejorar el diagnóstico de catálogo/evento/fuente vacía, o incorporar únicamente feeds con permiso verificable. No hay evidencia para prometer deportes argentinos completos ni reproducción sin demoras.

## Repositorios examinados

| Proyecto | Evidencia primaria | Compatibilidad e implicación |
|---|---|---|
| [Geber-Dev0/Metegol](https://github.com/Geber-Dev0/Metegol) | Rama `master`; GitHub API reporta `license: null` y el endpoint `/license` responde 404. README y [`docs/LEGAL.md`](https://github.com/Geber-Dev0/Metegol/blob/master/docs/LEGAL.md) dicen explícitamente que las fuentes reemiten ESPN/Fox/TNT/Disney+/Liga 1 Max/UFC sin autorización. README explica que el proxy HLS requiere ejecutarse en PC con IP residencial y túnel; el catálogo puede publicarse por Netlify, pero el proxy no funciona allí/Workers por bloqueos descritos por el autor. | No reutilizar ni desplegar. No tiene licencia declarada para reutilizar código. La URL de manifest desplegada no se fija en el README: documenta `https://<tu-proyecto>.netlify.app/manifest.json` y, localmente, `http://localhost:7000/manifest.json`. Depende de que el usuario aloje procesos/infraestructura propios; no es plug-and-play desde el servicio actual. El manifest declara Stremio `catalog`, `meta`, `stream`, tipo `tv`; zona horaria configurable, no garantiza derechos ni contenido argentino. La investigación anterior en `audit/15_ADDONS_AND_LATENCY.md` ya cubre su arquitectura y riesgo; esta revisión confirma la limitación de licencia y proxy desde el README/LEGAL actuales. |
| [Gregoryc28/SportsSphere](https://github.com/Gregoryc28/SportsSphere) | README describe Quart + Playwright/headless Chromium para resolver embeds, proxy por restricciones de CORS/referer y fuentes externas; requiere Docker/Python y Chromium. GitHub API reporta `license: null`. El README formula “personal/educational use” y no identifica licencias de los streams. | Self-hosted Stremio addon, no adaptador directo para AIOStreams/Nuvio. Gran coste operativo (browser, memoria, servidor), mantenimiento de embeds y riesgo legal sin resolver. No instalar ni ejecutar. Su “publicly available APIs” no constituye evidencia de autorización. |
| [rutvik2611/live-sport-plugin](https://github.com/rutvik2611/live-sport-plugin) | README lo llama fork “production-hardened” de Nuvio/Stremio y declara MIT en su sección License, pero la GitHub API consultada devuelve `license: null` (sin licencia detectada por GitHub). Describe 13+ proveedores externos, resolver HLS y arquitectura Docker/Traefik/Cloudflare; exige hosting propio y configuración `ADDON_URL`. | El README anuncia ambos clientes, pero no aporta evidencia de cobertura legal ni validación funcional de todos los proveedores. No tomar “MIT” como permiso confirmado sin un archivo/licencia verificable; no desplegar. Incluye configuraciones de dominio/Cloudflare personalizadas en el ejemplo, no una instancia pública estable para instalar. |

## Fubol: estado y diagnóstico compatible

- `config/stremio-addons.md` indica que Sports Streams ya está configurado en `config/aiostreams/fubol.config.json`, con los catálogos Fútbol, En vivo internacional, Hoy, Básquet, Motor, Peleas y Tenis. La config activa precisamente esos siete y desactiva categorías adicionales.
- El mismo documento registra casos anteriores con streams reales y eventos sin streams; advierte `429` ante ráfagas. `audit/18_FAMILY_RELEASE.md` registra la última pasada de 72 candidatos y la observación posterior de 429. No se repitió ni se puede extrapolar ese resultado a todos los partidos, horarios o disponibilidad futura.
- Diferenciar explícitamente: **catálogo/evento visible ≠ stream reproducible**. La evidencia previa de manifest 200 y catálogo con entradas solo confirma descubrimiento. No clasificar entradas de agenda como fuente utilizable hasta que el addon entregue un stream y el cliente lo pueda reproducir; una verificación de stream exige permiso y una comprobación puntual autorizada, que no se hizo aquí.
- No se justifica añadir un adapter para los repos examinados. Cambio compatible recomendado para una futura mejora local: exponer estado separado por etapa (`manifest`, catálogo, evento, stream-devuelto, reproducción), conservar `429` como rate-limit (no vacío definitivo), y mostrar “evento listado, sin fuente disponible” en vez de una falsa señal positiva. No alterar configuración ni hacer nuevas peticiones en esta tarea.
- Aun con stream válido, la latencia depende del origen. La medición anterior de `audit/15_ADDONS_AND_LATENCY.md` da 35–45 s para el caso estudiado y señala que 3–8 s requiere una fuente legal LL-HLS/DASH. No es una garantía universal ni se arregla cambiando el addon.

## Fuentes

- GitHub API de [Metegol repo](https://api.github.com/repos/Geber-Dev0/Metegol), [Metegol license](https://api.github.com/repos/Geber-Dev0/Metegol/license), [SportsSphere repo](https://api.github.com/repos/Gregoryc28/SportsSphere), [live-sport-plugin repo](https://api.github.com/repos/rutvik2611/live-sport-plugin): metadata de rama/fecha y campo de licencia.
- README y documento legal enlazados arriba; [`Metegol manifest.js`](https://raw.githubusercontent.com/Geber-Dev0/Metegol/master/manifest.js) confirma recursos y catálogo del addon.
- Evidencia local: `config/stremio-addons.md`, `config/aiostreams/fubol.config.json`, `audit/15_ADDONS_AND_LATENCY.md`.

**Conclusión:** no incorporar MeteGol, SportsSphere ni live-sport-plugin; no probar sus streams. Priorizar feeds deportivos expresamente autorizados y diagnóstico por etapas sobre Sports Streams existente. Cobertura de fútbol argentino y disponibilidad real quedan sin verificar en este relevamiento.

## Diagnóstico nuevo del primary: aviso de reinstalación

Una consulta puntual al catálogo y al recurso de TNT SPORT 2 devolvió HTTP200, pero el elemento de `streams` era `name: Please reinstall the addon`, `behaviorHints.notWebReady: true` y `url: https://sports.highfly.to/configure`. Por eso el supuesto video devolvía HTML: era un aviso de instalación, no el HLS de un partido.

Se verificaron los manifests públicos del dominio nuevo (versión1.3.0) y una sola consulta equivalente en ese dominio: el template sin identidad personal devuelve el mismo aviso. La página oficial `https://sports.highfly.to/configure` requiere Turnstile y genera un manifest con `freeUserId` después del flujo normal. No se inventó esa identidad ni se omitió la verificación. Se abrió la página en el navegador para que el usuario complete ese paso.

El conector ahora reconoce ese aviso y responde409 `source_setup_required`; solo el administrador recibe el enlace oficial de configuración. No vuelve a presentarlo como HLS. El importador `scripts/apply-sports-manifest.mjs` lee el manifest generado desde `.secrets/sports-manifest.txt`, sin imprimirlo. Las dos configuraciones legacy de AIOStreams también pueden leer ese override privado. Los caches de fuentes/addons incluyen la URL/config actual para que una edición no conserve el recurso viejo.
