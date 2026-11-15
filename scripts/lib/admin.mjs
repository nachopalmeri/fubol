/**
 * Sesión de administrador para los scripts de operación.
 *
 * La contraseña sale del entorno o del archivo privado del repo, nunca de la
 * línea de comandos (cualquier proceso de la máquina puede leerla ahí) y nunca
 * se imprime.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

export const APP_URL = (
  process.env.FUBOL_APP_URL ??
  process.env.FUBOL_ADMIN_URL ??
  "https://fubol-five.vercel.app"
).replace(/\/+$/, "");

export function adminPassword() {
  const fromEnv = process.env.FUBOL_ADMIN_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  try {
    return fs.readFileSync(path.join(ROOT, ".secrets", "admin.password"), "utf8").trim();
  } catch {
    return "";
  }
}

/** Logs into the panel and returns the cookie header to send afterwards. */
export async function adminSession(appUrl = APP_URL) {
  const password = adminPassword();
  if (!password) {
    throw new Error("No encuentro la contraseña del panel (.secrets/admin.password o FUBOL_ADMIN_PASSWORD).");
  }
  const res = await fetch(`${appUrl}/api/auth/admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`el panel rechazó el login (${res.status})`);
  const cookie = (res.headers.getSetCookie?.() ?? []).map((entry) => entry.split(";")[0]).join("; ");
  return { cookie, password };
}
