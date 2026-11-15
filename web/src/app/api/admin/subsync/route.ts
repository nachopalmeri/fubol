import { json, readJson, requireAdmin, route } from "@/lib/api";
import { setSetting } from "@/lib/state/settings";
import { SUBSYNC_TOKEN_KEY, SUBSYNC_URL_KEY, subsyncStatus } from "@/lib/subs/sidecar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Address of the audio-alignment sidecar.
 *
 * Like the torrent resolver, it is a long-lived process that cannot live in a
 * serverless function, and its tunnel address changes whenever it restarts.
 * The launcher posts the new address here each time it publishes the tunnel.
 */
export const GET = route("admin_subsync_get", async () => {
  await requireAdmin();
  return json(await subsyncStatus());
});

export const POST = route("admin_subsync_set", async (request) => {
  await requireAdmin();
  const body = await readJson<{ url?: string; token?: string }>(request);
  const raw = (body.url ?? "").trim();

  if (!raw) {
    await setSetting(SUBSYNC_URL_KEY, null);
    await setSetting(SUBSYNC_TOKEN_KEY, null);
    return json({ ok: true, url: null, reachable: false });
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return json({ error: "La URL no es válida" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return json({ error: "La URL tiene que ser http o https" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token && !/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    return json({ error: "El token del sincronizador no es válido" }, { status: 400 });
  }

  const normalized = parsed.toString().replace(/\/+$/, "");
  await setSetting(SUBSYNC_URL_KEY, normalized);
  await setSetting(SUBSYNC_TOKEN_KEY, token || null);

  // Measured after saving: a tunnel that was just published may need a moment,
  // and the address is still the right one to keep.
  const status = await subsyncStatus();
  return json({ ok: true, url: normalized, reachable: status.reachable });
});
