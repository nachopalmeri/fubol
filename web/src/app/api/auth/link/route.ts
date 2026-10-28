import { json, readJson, route } from "@/lib/api";
import { attachLinkSession, validateLinkAccess } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route("auth_link", async (request) => {
  const ip = clientIp(request);
  if (!rateLimit(`link:${ip}`, 20, 60_000)) {
    return json({ error: "Demasiados intentos" }, { status: 429 });
  }
  const body = await readJson<{ code?: string; pin?: string }>(request);
  if (!body.code) return json({ error: "Falta el código" }, { status: 400 });
  const result = validateLinkAccess(body.code, body.pin ?? null);
  if (!result.ok) {
    return json(
      { error: result.reason === "pin" ? "PIN incorrecto" : "Link inválido" },
      { status: result.status },
    );
  }
  const response = json({ ok: true });
  attachLinkSession(response, body.code, request);
  return response;
});
