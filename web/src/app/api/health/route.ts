import { json, route } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const started = Date.now();

export const GET = route("health", async () => {
  return json({
    ok: true,
    service: "fubol",
    uptime_s: Math.round((Date.now() - started) / 1000),
    time: new Date().toISOString(),
  });
});
