#!/usr/bin/env node
/**
 * Publica el sincronizador de subtítulos y le avisa a la app dónde quedó.
 *
 * El sincronizador mide el desfase de un subtítulo contra el audio de la
 * película (ffsubsync). Corre en esta máquina y la app vive en Vercel, así
 * que necesita un túnel; como la URL del túnel cambia en cada arranque, la
 * dirección se guarda en el estado de la app en vez de en una variable de
 * entorno, que quedaba apuntando a un túnel que ya no existía.
 *
 *   node scripts/subsync-publish.mjs
 *
 * Cada publicación genera un token nuevo: el túnel es público, y sin token
 * cualquiera que diera con la URL podría pedirle al sincronizador que baje
 * audio por él.
 */
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { adminSession, APP_URL } from "./lib/admin.mjs";
import { startQuickTunnel, stopTunnelsFor, waitForPublic } from "./lib/tunnel.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMAGE = "fubol-subsync:latest";
const CONTAINER = "fubol-subsync-public";
const LOCAL_PORT = 8081;

const say = (...parts) => console.log(parts.join(" "));

function docker(args, options = {}) {
  return spawnSync("docker", args, { encoding: "utf8", stdio: "pipe", ...options });
}

function ensureImage() {
  if (docker(["image", "inspect", IMAGE]).status === 0 && !process.argv.includes("--build")) return;
  say("construyendo la imagen del sincronizador (la primera vez tarda unos minutos)…");
  execFileSync("docker", ["build", "-t", IMAGE, path.join(ROOT, "subsync")], { stdio: "inherit" });
}

function startContainer(token) {
  docker(["rm", "-f", CONTAINER]);
  const run = docker(
    [
      "run", "-d", "--name", CONTAINER, "--restart", "unless-stopped",
      "-p", `127.0.0.1:${LOCAL_PORT}:8080`,
      "-e", "SUBSYNC_AUDIO_WINDOW=420",
      "-e", "SUBSYNC_EXTRACT_TIMEOUT=170",
      // Sin valor: Docker lo toma del entorno de este proceso, así el token no
      // queda en la línea de comandos.
      "-e", "SUBSYNC_TOKEN",
      IMAGE,
    ],
    { env: { ...process.env, SUBSYNC_TOKEN: token } },
  );
  if (run.status !== 0) throw new Error(`no pude levantar ${CONTAINER}: ${run.stderr.trim()}`);
}

async function waitLocal() {
  return waitForPublic(`http://127.0.0.1:${LOCAL_PORT}/health`, { timeoutMs: 40_000, everyMs: 1500 });
}

const { cookie } = await adminSession();

ensureImage();
const token = crypto.randomBytes(32).toString("base64url");
startContainer(token);
if (!(await waitLocal())) throw new Error("el sincronizador no contestó en esta máquina");
say("sincronizador levantado en 127.0.0.1:" + LOCAL_PORT);

stopTunnelsFor(LOCAL_PORT);
const { url } = await startQuickTunnel(LOCAL_PORT, { detach: true });
say("túnel público:", url);
if (!(await waitForPublic(`${url}/health`))) {
  say("aviso: el túnel todavía no contesta desde afuera; guardo la dirección igual");
}

const saved = await fetch(`${APP_URL}/api/admin/subsync`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ url, token }),
});
const body = await saved.json().catch(() => ({}));
if (!saved.ok) throw new Error(`el panel rechazó el sincronizador: ${JSON.stringify(body)}`);
say("panel actualizado:", body.url, "· alcanzable:", String(body.reachable));
process.exit(0);
