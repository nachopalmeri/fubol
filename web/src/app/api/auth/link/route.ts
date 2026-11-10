import { json, readJson, route } from "@/lib/api";
import { attachLinkSession, validateLinkAccess } from "@/lib/auth";
import { lockoutRemainingMs, noteAuthFailure, noteAuthSuccess, rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route("auth_link", async (request) => {
  const ip = clientIp(request);
  if (!rateLimit(`link:${ip}`, 20, 60_000)) {
    return json({ error: "Demasiados intentos" }, { status: 429 });
  }
  const locked = lockoutRemainingMs(`link:${ip}`);
  if (locked > 0) {
    const seconds = Math.ceil(locked / 1000);
    return json(
      { error: `Demasiados intentos fallidos. Probá de nuevo en ${seconds} s.` },
      { status: 429, headers: { "retry-after": String(seconds) } },
    );
  }
  const body = await readJson<{ code?: string; pin?: string }>(request);
  if (!body.code) return json({ error: "Falta el código" }, { status: 400 });
  const result = await validateLinkAccess(body.code, body.pin ?? null);
  if (!result.ok) {
    noteAuthFailure(`link:${ip}`);
    return json(
      { error: result.reason === "pin" ? "PIN incorrecto" : "Link inválido" },
      { status: result.status },
    );
  }
  noteAuthSuccess(`link:${ip}`);
  const response = json({ ok: true });
  attachLinkSession(response, body.code, request);
  return response;
});
