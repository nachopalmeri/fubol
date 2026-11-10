import { json, readJson, route, clientIp } from "@/lib/api";
import { checkAdminPassword, attachAdminSession } from "@/lib/auth";
import { lockoutRemainingMs, noteAuthFailure, noteAuthSuccess, rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route("auth_admin", async (request) => {
  const ip = clientIp(request);
  if (!rateLimit(`admin:${ip}`, 10, 60_000)) {
    return json({ error: "Demasiados intentos. Esperá un minuto." }, { status: 429 });
  }
  const locked = lockoutRemainingMs(`admin:${ip}`);
  if (locked > 0) {
    const seconds = Math.ceil(locked / 1000);
    return json(
      { error: `Demasiados intentos fallidos. Probá de nuevo en ${seconds} s.` },
      { status: 429, headers: { "retry-after": String(seconds) } },
    );
  }
  const body = await readJson<{ password?: string }>(request);
  if (!body.password || !checkAdminPassword(body.password)) {
    const wait = noteAuthFailure(`admin:${ip}`);
    logger.warn("admin_login_failed", { ip, lockMs: wait });
    return json({ error: "Password incorrecta" }, { status: 401 });
  }
  noteAuthSuccess(`admin:${ip}`);
  const response = json({ ok: true });
  attachAdminSession(response, request);
  return response;
});
