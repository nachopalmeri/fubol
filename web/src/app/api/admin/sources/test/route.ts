import { json, readJson, requireAdmin, route } from "@/lib/api";
import { probeSource } from "@/lib/live/probe";
import { sanitizeHeaders } from "@/lib/stream-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route("admin_sources_test", async (request) => {
  await requireAdmin();
  const body = await readJson<{ url?: string; headers?: Record<string, string> }>(request);
  if (!body.url) return json({ error: "Falta la URL" }, { status: 400 });
  const result = await probeSource(body.url, {
    headers: sanitizeHeaders(body.headers),
    timeoutMs: 10_000,
  });
  return json({ result });
});
