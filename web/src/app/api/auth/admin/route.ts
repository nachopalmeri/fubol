import { json, readJson, route, clientIp } from "@/lib/api";
import { checkAdminPassword, attachAdminSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route("auth_admin", async (request) => {
  const ip = clientIp(request);
  if (!rateLimit(`admin:${ip}`, 10, 60_000)) {
    return json({ error: "Demasiados intentos. Esperá un minuto." }, { status: 429 });
  }
  const body = await readJson<{ password?: string }>(request);
  if (!body.password || !checkAdminPassword(body.password)) {
    logger.warn("admin_login_failed", { ip });
    return json({ error: "Password incorrecta" }, { status: 401 });
  }
  const response = json({ ok: true });
  attachAdminSession(response, request);
  return response;
});
