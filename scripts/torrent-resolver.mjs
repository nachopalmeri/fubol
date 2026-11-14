#!/usr/bin/env node
/**
 * Levanta el resolver de torrents y lo deja apuntando en la app.
 *
 * El camino gratis para reproducir lo que los addons devuelven como
 * `infoHash`: el servidor de streaming de Stremio se une al enjambre y
 * re-sirve el archivo por HTTP (y lo remuxea a HLS cuando el release es MKV o
 * HEVC, que el navegador no decodifica). Es el mismo mecanismo que usan
 * Stremio y Nuvio con estos mismos addons, sin pagar un debrid.
 *
 * Para el despliegue en Vercel hace falta que el resolver sea alcanzable
 * desde internet: por eso se publica con un túnel de Cloudflare sin cuenta
 * (URL aleatoria, sin garantía de uptime) y la dirección se guarda en el
 * estado de la app, que es donde la lee.
 *
 *   node scripts/torrent-resolver.mjs --admin https://fubol-five.vercel.app
 *
 * La contraseña de administrador sale de FUBOL_ADMIN_PASSWORD; si no está, se
 * pide. No se imprime.
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONFIG_DIR = path.join(ROOT, "config", "torrserver");
const CLOUDFLARED = path.join(ROOT, "tools", "cloudflared.exe");
const IMAGE = "stremio/server:v4.22.5";
const CONTAINER = "fubol-torrserver";
const LOCAL_PORT = 11470;
const MEDIA_BASE = `http://127.0.0.1:${LOCAL_PORT}`;

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const adminUrl = arg("admin", process.env.FUBOL_ADMIN_URL ?? "https://fubol-five.vercel.app").replace(/\/+$/, "");

function say(...parts) {
  console.log(parts.join(" "));
}

async function askSecret(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim();
}

function docker(args, options = {}) {
  return execFileSync("docker", args, { stdio: "inherit", ...options });
}

function ensureConfig() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const file = path.join(CONFIG_DIR, "config.json");
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          port: LOCAL_PORT,
          torrentio: "https://torrentio.strem.fun",
          torrents: { torrentio: { enabled: true, url: "https://torrentio.strem.fun" } },
        },
        null,
        2,
      ),
    );
    say("config creado:", file);
  }
}

function ensureContainer() {
  // Another container may already hold the port (a previous run of this
  // script, or the compose stack): free it before taking it.
  try {
    const users = execFileSync(
      "docker",
      ["ps", "--filter", `publish=${LOCAL_PORT}`, "--format", "{{.Names}}"],
      { encoding: "utf8" },
    )
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const name of users) {
      say("liberando el puerto", LOCAL_PORT, "de", name);
      docker(["rm", "-f", name], { stdio: "ignore" });
    }
  } catch {
    // no containers publishing it
  }
  try {
    docker(["rm", "-f", CONTAINER], { stdio: "ignore" });
  } catch {
    // no existía
  }
  docker([
    "run", "-d", "--name", CONTAINER, "--restart", "unless-stopped",
    "-p", `${LOCAL_PORT}:${LOCAL_PORT}`,
    "-e", "NO_CORS=1",
    // The runtime state goes to a Docker volume; only the configuration file
    // comes from the repo, so the working tree stays clean while the server
    // writes its own settings.
    "-v", "fubol-torrserver-data:/root/.stremio-server",
    "-v", `${path.join(CONFIG_DIR, "config.json")}:/root/.stremio-server/config.json:ro`,
    IMAGE,
  ]);
  say("contenedor", CONTAINER, "levantado en 127.0.0.1:" + LOCAL_PORT);
}

async function startTunnel(detach) {
  if (!fs.existsSync(CLOUDFLARED)) {
    throw new Error(
      `falta cloudflared. Descargalo de https://github.com/cloudflare/cloudflared/releases a ${CLOUDFLARED}`,
    );
  }
  const child = spawn(CLOUDFLARED, ["tunnel", "--url", `http://127.0.0.1:${LOCAL_PORT}`, "--no-autoupdate"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: detach,
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
    // Cloudflare a veces tarda más de un minuto en asignar el nombre del
    // túnel cuando hay congestión. Dos minutos evita que el acceso de un clic
    // falle justo cuando la familia lo necesita.
    const timer = setTimeout(
      () => finish(() => reject(new Error("el túnel no dio una URL a tiempo"))),
      120000,
    );
    child.stderr.on("data", onData);
    child.stdout.on("data", onData);
    child.on("error", (error) => finish(() => reject(error)));
    child.on("exit", (code) => finish(() => reject(new Error(`el túnel terminó con código ${code}`))));
  });
  if (detach) {
    // The tunnel has to outlive this script: a quick tunnel without a process
    // behind it dies with the shell and leaves the app pointing at a dead
    // address.
    child.unref();
    child.stdout.destroy();
    child.stderr.destroy();
  }
  return { child, url };
}

async function publish(url) {
  const password = process.env.FUBOL_ADMIN_PASSWORD ?? (await askSecret("Contraseña de administrador: "));
  const login = await fetch(`${adminUrl}/api/auth/admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!login.ok) throw new Error("no se pudo iniciar sesión en el panel");
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const saved = await fetch(`${adminUrl}/api/admin/torrent-server`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ url, mediaBase: MEDIA_BASE }),
  });
  const body = await saved.json();
  if (!saved.ok) throw new Error(`el panel rechazó el resolver: ${JSON.stringify(body)}`);
  say("panel actualizado:", body.url, "· alcanzable:", body.reachable, body.detail ?? "");
}

ensureConfig();
ensureContainer();
const { child, url } = await startTunnel(process.argv.includes("--detach"));
say("túnel público:", url);
await publish(url);
say("");
say("El resolver quedó publicado. La app ya reproduce los títulos por P2P.");
if (!process.argv.includes("--detach")) {
  say("Este túnel es efímero: si se reinicia, la URL cambia. Volvé a correr este script.");
  say("Dejando el túnel vivo (Ctrl+C para cortarlo). El contenedor sigue funcionando.");
  process.on("SIGINT", () => {
    child.kill();
    process.exit(0);
  });
  await new Promise(() => {});
} else {
  say("El túnel quedó detachmentado: sobrevive a la salida de este script.");
}
