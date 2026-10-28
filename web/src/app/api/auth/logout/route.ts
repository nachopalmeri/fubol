import { json, route } from "@/lib/api";
import { clearSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route("auth_logout", async () => {
  const response = json({ ok: true });
  clearSession(response);
  return response;
});
