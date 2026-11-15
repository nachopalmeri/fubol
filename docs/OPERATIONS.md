# Operación diaria

Qué corre dónde, qué se rompe y cómo se arregla. Pensado para el que
arranca la máquina y abre la app.

## Dónde vive cada cosa

| Pieza | Dónde | Si no está |
| --- | --- | --- |
| Front y back | Vercel (`https://fubol-five.vercel.app`) | Se deploya solo con cada push a `main`. |
| Estado (links, fuentes, addons, ajustes, sync) | Vercel Blob privado | No se pierde: vive en el proyecto, no en la máquina. |
| Resolver de torrents | Esta PC, contenedor `fubol-torrserver` | **Las películas P2P no se reproducen.** El fútbol, el catálogo y los subtítulos siguen. |
| Túnel hacia el resolver | Esta PC, `cloudflared` | Ídem: la URL del túnel cambia y la app queda apuntando a un sitio muerto. |
| Sidecar de sync por audio | Esta PC, contenedor `fubol-subsync-public` + su túnel | El sync por referencia (el automático, de un segundo) sigue; el del audio no. |

## Lo de todos los días

Un solo comando levanta todo (Docker, resolver, sincronizador, túneles y vigilante):

```powershell
node scriptsubol-start.mjs            # y abre la app
node scriptsubol-start.mjs --no-open  # sin abrir el navegador
```

Y uno solo dice si todo anda, addon por addon:

```powershell
node scriptsdoctor.mjs
```

El doctor le pide a la app lo mismo que el reproductor (fuentes y subtítulos
de una película y un episodio reales, los canales) y cuenta qué entregó cada
addon. Un manifest que responde no alcanza: sale con error si un addon
"responde pero no entrega" o "entrega pero la app no lo ofrece".

A mano, paso por paso:

```powershell
# 1. Docker (si no está corriendo)
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
# esperá a que docker info responda

# 2. Resolver + túnel, y publicar la dirección nueva en la app
$env:FUBOL_ADMIN_PASSWORD = "la del panel"
node scripts\torrent-resolver.mjs --admin https://fubol-five.vercel.app --detach

# 3. (opcional) Vigilar y reponer solo
node scripts\resolver-watchdog.mjs
```

El watchdog hace el paso 2 cada 5 minutos cuando el resolver no responde, y
vuelve a publicar el sincronizador de subtítulos (`scripts/subsync-publish.mjs`)
cuando la app deja de alcanzarlo.

## Qué se rompe y qué hacer

| Síntoma | Causa | Arreglo |
| --- | --- | --- |
| "El servidor que abre los torrents no responde" | El túnel o el contenedor sefellaron | `node scripts/torrent-resolver.mjs --admin https://fubol-five.vercel.app --detach` |
| Las películas dan "sin fuentes" | El resolver no está configurado | Panel → Addons VOD → *Resolver de torrents* → dirección + *Guardar y probar* |
| Salud dice "Sincronizador por audio: sin respuesta" | El túnel del sincronizador cambió de dirección o el contenedor no está | `node scripts/subsync-publish.mjs` (lo hace solo el lanzador y el watchdog) |
| Un addon dice "responde pero no entrega" | El manifest está bien pero el servidor del addon falla o la sesión venció | Esperar y volver a mirar; si sigue, renovar el manifest en *Configurar ↗* |
| Los subtítulos no están alineados | Se midió contra otra pista, no contra el audio | Se mide solo la primera vez; el resultado queda en el servidor. Para forzarlo: borrar el renglón de sync en el panel de Salud o esperar la medición por audio. |
| Un canal de fútbol no abre | El addon de Sports Streams necesita el manifest con tu verificación | Panel → Fuentes en vivo → Editar → Manifest URL (está en `.secrets/sports-manifest.txt`) |
| Un addon de subtítulos no trae pistas | El manifest público responde 404 hasta que te registrás | Panel → Addons VOD → *Manifest* → pegá la URL con tu sesión (ver `.secrets/subtitle-manifests.json`) |

## Cuentas y manifests

Todo lo que tiene sesión vive en `.secrets/` (ignorado por git):

- `.secrets/sports-manifest.txt` — manifest de Sports Streams con la verificación.
- `.secrets/subtitle-manifests.json` — manifest de SubDL, SubSense, Community Subtitles y
  OpenSubtitles PRO (SubSource quedó sin registrar: su alta pide un captcha a mano).
- `.secrets/torbox.password` — cuenta de TorBox creada para probar el camino con debrid.

## Lo que cuesta

Nada: el resolver es software libre y el túnel no pide cuenta. Lo único con
costo opcional es un debrid (TorBox ESSENTIAL, $3/mes) si querés que el VOD
funcione con la PC apagada. Con debrid, el panel arma el manifest configurado
solo: *Resolver P2P con tu cuenta*.

## Lo que NO depende de esta máquina

El fútbol en vivo (186 canales), el catálogo de películas y series, la búsqueda,
los subtítulos de OpenSubtitles v3 y el link familiar de la familia: todo eso
vive en Vercel y funciona con la PC apagada.
