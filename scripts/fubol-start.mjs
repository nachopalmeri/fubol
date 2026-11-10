#!/usr/bin/env node
/**
 * Levanta Fubol de punta a punta y abre la app.
 *
 * Para la familia esto tiene que ser un clic: nada de acordarse de Docker, del
 * túnel, del resolver ni de la contraseña. Este script hace todo eso:
 *
 *   1. arranca Docker si no está corriendo y espera al daemon;
 *   2. levanta el resolver de torrents y el sidecar de sincronización;
 *   3. publica el resolver en internet y avisa a la app la dirección nueva
 *      (solo si no está contestando: si todo va bien no se toca la URL);
 *   4. deja el vigilante corriendo para que se reponga solo;
 *   5. abre el navegador en la app, ya con la sesión de la familia.
 *
 *   node scripts/fubol-start.mjs
 */
import { spawn, spawnSync, execFileSync, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SECRETS = path.join(ROOT, ".secrets");
const APP_URL = (process.env.FUBOL_APP_URL ?? "https://fubol-five.vercel.app").replace(/\/+$/, "");
const FAMILY_CODE = process.env.FUBOL_FAMILY_CODE ?? "EVSV8Q2U";
const DOCKER_DESKTOP = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
const TUNNEL_PORT = 11470;
const SUBSYNC_PORT = 8081;

const say = (...parts) => console.log("·", ...parts);

function adminPassword() {
  const fromEnv = process.env.FUBOL_ADMIN_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  try {
    return fs.readFileSync(path.join(SECRETS, "admin.password"), "utf8").trim();
  } catch {
    return "";
  }
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: "pipe", ...options });
}

function tryRun(command, args) {
  try {
    return run(command, args);
  } catch {
    return null;
  }
}

async function waitFor(check, timeoutMs, everyMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
}

async function dockerUp() {
  if (tryRun("docker", ["info", "--format", "{{.ServerVersion}}"])) return true;
  if (!fs.existsSync(DOCKER_DESKTOP)) {
    say("Docker no está instalado en", DOCKER_DESKTOP);
    return false;
  }
  say("arrancando Docker…");
  spawn(DOCKER_DESKTOP, { detached: true, stdio: "ignore" }).unref();
  const ready = await waitFor(
    async () => Boolean(tryRun("docker", ["info", "--format", "{{.ServerVersion}}"])),
    180_000,
    3000,
  );
  if (ready) say("Docker listo");
  return ready;
}

function containerRunning(name) {
  const out = tryRun("docker", ["ps", "--filter", `name=^${name}$`, "--format", "{{.Names}}"]);
  return Boolean(out && out.trim());
}

/** The resolver and the subtitle sidecar, started if they are not up. */
function containersUp() {
  if (!containerRunning("fubol-torrserver")) {
    say("levantando el resolver de torrents…");
    tryRun("docker", [
      "run", "-d", "--name", "fubol-torrserver", "--restart", "unless-stopped",
      "-p", `${TUNNEL_PORT}:${TUNNEL_PORT}`,
      "-e", "NO_CORS=1",
      "-v", "fubol-torrserver-data:/root/.stremio-server",
      "-v", `${path.join(ROOT, "config", "torrserver", "config.json")}:/root/.stremio-server/config.json:ro`,
      "stremio/server:v4.22.5",
    ]);
  }
  if (!containerRunning("fubol-subsync-public")) {
    say("levantando el sincronizador de subtítulos…");
    tryRun("docker", [
      "run", "-d", "--name", "fubol-subsync-public", "--restart", "unless-stopped",
      "-p", `127.0.0.1:${SUBSYNC_PORT}:8080`,
      "-e", "SUBSYNC_AUDIO_WINDOW=90",
      "-e", "SUBSYNC_EXTRACT_TIMEOUT=100",
      "fubol-subsync:latest",
    ]);
  }
}

/** Is the resolver the app knows about answering? */
async function resolverAlive(password) {
  try {
    const login = await fetch(`${APP_URL}/api/auth/admin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!login.ok) return false;
    const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const res = await fetch(`${APP_URL}/api/admin/torrent-server`, { headers: { cookie } });
    if (!res.ok) return false;
    const body = await res.json();
    if (!body.url) return false;
    const probe = await fetch(`${body.url}/settings`, { signal: AbortSignal.timeout(8000) });
    await probe.body?.cancel();
    return probe.ok;
  } catch {
    return false;
  }
}

function publishResolver(password) {
  say("publicando el resolver y avisando a la app…");
  const result = spawnSync("node", [path.join(ROOT, "scripts", "torrent-resolver.mjs"), "--admin", APP_URL, "--detach"], {
    cwd: ROOT,
    env: { ...process.env, FUBOL_ADMIN_PASSWORD: password },
    stdio: "inherit",
  });
  return result.status === 0;
}

function watchdogRunning() {
  const out = tryRun("wmic", ["process", "where", "name='node.exe'", "get", "CommandLine"]);
  if (out) return out.includes("resolver-watchdog");
  const list = tryRun("powershell", ["-NoProfile", "-Command", "(Get-CimInstance Win32_Process -Filter \\\"Name='node.exe'\\\" | Where-Object { $_.CommandLine -match 'resolver-watchdog' } | Measure-Object).Count"]);
  return Number(list ?? 0) > 0;
}

function startWatchdog(password) {
  if (watchdogRunning()) return true;
  const child = spawn("node", [path.join(ROOT, "scripts", "resolver-watchdog.mjs")], {
    cwd: ROOT,
    env: { ...process.env, FUBOL_ADMIN_PASSWORD: password },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return true;
}

function openApp() {
  const url = `${APP_URL}/f/${FAMILY_CODE}`;
  say("abriendo", url);
  execFile("cmd", ["/c", "start", "", url], { windowsHide: true });
}

const password = adminPassword();
if (!password) {
  console.error(
    "No encuentro la contraseña del panel. Ponla en .secrets/admin.password o en FUBOL_ADMIN_PASSWORD.",
  );
  process.exit(1);
}

if (!(await dockerUp())) {
  console.error("Docker no arrancó; no puedo levantar el resolver. Abrí Docker y volvé a apretar el acceso.");
  process.exit(1);
}

containersUp();

if (await resolverAlive(password)) {
  say("el resolver ya responde: no toco la dirección");
} else if (!publishResolver(password)) {
  console.error("No pude publicar el resolver.");
  process.exit(1);
}

startWatchdog(password);
openApp();
say("todo listo. Para terminar el día: cerrá esta ventana o la máquina cuando quieras.");
