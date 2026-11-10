#!/usr/bin/env node
/**
 * Vigila el resolver de torrents y lo levanta solo si se cae.
 *
 * El resolver corre en una máquina y se publica con un túnel sin cuenta: la
 * URL cambia cada vez que se reinicia y el proceso puede morir con la
 * máquina. Sin este vigilante, la app sigue respondiendo pero todos los
 * títulos P2P quedan mudos, y no hay forma de saber por qué.
 *
 *   $env:FUBOL_ADMIN_PASSWORD = "la del panel"
 *   node scripts/resolver-watchdog.mjs
 *
 * Cada ronda:
 *   1. pregunta a la app cuál es el resolver configurado y si responde;
 *   2. si no responde, vuelve a publicar el túnel y actualiza la dirección.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_URL = (process.env.FUBOL_ADMIN_URL ?? "https://fubol-five.vercel.app").replace(/\/+$/, "");
const INTERVAL_MIN = Number(process.env.FUBOL_WATCHDOG_MINUTES ?? 5) * 60_000;

/**
 * The panel password comes from the environment or from the private file.
 * It never goes on the command line, where any process on the machine could
 * read it.
 */
function adminPassword() {
  const fromEnv = process.env.FUBOL_ADMIN_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  const file = path.join(ROOT, ".secrets", "admin.password");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

const PASSWORD = adminPassword();

function say(...parts) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);
}

async function adminCookie() {
  const res = await fetch(`${ADMIN_URL}/api/auth/admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`el panel rechazó el login (${res.status})`);
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function resolverAlive(cookie) {
  const res = await fetch(`${ADMIN_URL}/api/admin/torrent-server`, { headers: { cookie } });
  if (!res.ok) return { alive: false, url: null };
  const body = await res.json();
  if (!body.url) return { alive: false, url: null };
  try {
    const probe = await fetch(`${body.url}/settings`, { signal: AbortSignal.timeout(8000) });
    await probe.body?.cancel();
    return { alive: probe.ok, url: body.url };
  } catch {
    return { alive: false, url: body.url };
  }
}

function republish() {
  return new Promise((resolve) => {
    say("el resolver no responde: republiqué el túnel");
    const child = spawn(
      process.execPath,
      [path.join(ROOT, "scripts", "torrent-resolver.mjs"), "--admin", ADMIN_URL, "--detach"],
      {
        cwd: ROOT,
        // The child has to be able to publish the new address: without the
        // password it would sit waiting for it and the resolver would stay
        // pointed at a tunnel that no longer exists.
        env: { ...process.env, FUBOL_ADMIN_PASSWORD: PASSWORD },
        stdio: "inherit",
      },
    );
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

if (!PASSWORD) {
  console.error("Falta FUBOL_ADMIN_PASSWORD con la contraseña del panel.");
  process.exit(1);
}

say("vigilando el resolver cada", Math.round(INTERVAL_MIN / 60000), "min");
for (;;) {
  try {
    const cookie = await adminCookie();
    const { alive, url } = await resolverAlive(cookie);
    if (alive) {
      say("resolver sano:", url);
    } else {
      await republish();
    }
  } catch (error) {
    say("no pude verificar el resolver:", error instanceof Error ? error.message : "error");
  }
  await new Promise((resolve) => setTimeout(resolve, INTERVAL_MIN));
}
