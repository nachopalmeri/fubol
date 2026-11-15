/**
 * Túneles rápidos de Cloudflare (sin cuenta) hacia un puerto local.
 *
 * Lo comparten el resolver de torrents y el sincronizador de subtítulos: los
 * dos corren en esta máquina y la app, que vive en Vercel, tiene que poder
 * alcanzarlos. La URL es aleatoria y cambia en cada arranque, por eso quien
 * publica el túnel también le avisa a la app la dirección nueva.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const CLOUDFLARED = path.join(ROOT, "tools", process.platform === "win32" ? "cloudflared.exe" : "cloudflared");

/**
 * Corta los túneles que ya apuntan a ese puerto.
 *
 * Cada publicación crea una URL nueva y la app pasa a usar esa: el túnel
 * anterior queda vivo, sin que nadie lo mire, hasta que se apaga la máquina.
 * Después de unos días de caídas y reposiciones eran varios procesos de más.
 */
export function stopTunnelsFor(port) {
  const target = `127.0.0.1:${port}`;
  if (process.platform === "win32") {
    spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -like '*${target}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ],
      { stdio: "ignore", windowsHide: true },
    );
    return;
  }
  spawnSync("pkill", ["-f", `cloudflared.*${target}`], { stdio: "ignore" });
}

/**
 * Abre un túnel hacia el puerto y devuelve la URL pública.
 *
 * Con `detach`, el túnel sobrevive a la salida del script: un túnel rápido sin
 * proceso detrás muere con la consola y deja a la app apuntando a una
 * dirección muerta.
 */
export async function startQuickTunnel(port, { detach = false, timeoutMs = 120_000 } = {}) {
  if (!fs.existsSync(CLOUDFLARED)) {
    throw new Error(
      `falta cloudflared. Descargalo de https://github.com/cloudflare/cloudflared/releases a ${CLOUDFLARED}`,
    );
  }
  const child = spawn(CLOUDFLARED, ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: detach,
    windowsHide: true,
  });
  const url = await new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const onData = (chunk) => {
      buffer += chunk.toString();
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buffer);
      if (match) finish(() => resolve(match[0]));
    };
    // Si el túnel no llega a tiempo, el proceso tampoco puede quedar vivo:
    // un cloudflared huérfano crea otro túnel que nadie vuelve a mirar.
    const fail = (error) =>
      finish(() => {
        child.kill();
        reject(error);
      });
    // Cloudflare a veces tarda más de un minuto en asignar el nombre del
    // túnel cuando hay congestión.
    const timer = setTimeout(() => fail(new Error("el túnel no dio una URL a tiempo")), timeoutMs);
    child.stderr.on("data", onData);
    child.stdout.on("data", onData);
    child.on("error", fail);
    child.on("exit", (code) => fail(new Error(`el túnel terminó con código ${code}`)));
  });
  if (detach) {
    child.unref();
    child.stdout.destroy();
    child.stderr.destroy();
  }
  return { child, url };
}

/**
 * Espera a que la URL pública conteste.
 *
 * El nombre de un túnel recién creado tarda unos segundos en resolver: avisarle
 * a la app antes de eso hace que la primera prueba de alcance diga que no anda.
 */
export async function waitForPublic(url, { timeoutMs = 60_000, everyMs = 2500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      await res.body?.cancel();
      if (res.ok) return true;
    } catch {
      // todavía no resuelve o no contesta
    }
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
}
