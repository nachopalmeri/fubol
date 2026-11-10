import { json, readJson, requireSession, route } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { clearProgress, listProgress, saveProgress } from "@/lib/state/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Each viewer has its own history: the admin does not see what the family watched. */
async function scopeOf(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  return session.role === "admin" ? "admin" : session.code;
}

export const GET = route("progress_list", async () => {
  await requireSession();
  const scope = await scopeOf();
  if (!scope) return json({ items: [] });
  return json({ items: await listProgress(scope) });
});

export const POST = route("progress_save", async (request) => {
  await requireSession();
  const scope = await scopeOf();
  if (!scope) return json({ error: "Sin sesión" }, { status: 401 });
  const body = await readJson<{
    type?: "movie" | "series" | "live";
    id?: string;
    episode?: string;
    name?: string;
    poster?: string;
    position?: number;
    duration?: number;
  }>(request);
  if (!body.id || !body.name || typeof body.position !== "number") {
    return json({ error: "Faltan datos" }, { status: 400 });
  }
  await saveProgress(scope, {
    type: body.type === "series" ? "series" : body.type === "live" ? "live" : "movie",
    id: body.id,
    episode: body.episode,
    name: body.name.slice(0, 120),
    poster: body.poster?.slice(0, 500),
    position: Math.round(body.position),
    duration: Math.round(body.duration ?? 0),
  });
  return json({ ok: true });
});

export const DELETE = route("progress_clear", async (request) => {
  await requireSession();
  const scope = await scopeOf();
  if (!scope) return json({ error: "Sin sesión" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "movie";
  const id = params.get("id");
  if (!id) return json({ error: "Falta el id" }, { status: 400 });
  await clearProgress(scope, type, id, params.get("ep") ?? undefined);
  return json({ ok: true });
});
