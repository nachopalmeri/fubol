import { json, readJson, requireAdmin, route } from "@/lib/api";
import { getSetting, setSetting } from "@/lib/state/settings";
import { setTorrentServerBase, setTorrentServerMediaBase, syncTorrentServerSettings, torrentServerBase } from "@/lib/vod/torrent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The torrent resolver (Stremio's streaming server) is what turns the
 * `infoHash` the addons return into bytes a browser can play. It is a
 * long-lived process with a swarm connection, so it cannot live inside a
 * serverless function: it runs next to the app (container) or somewhere
 * reachable from it, and the panel is where the address is set.
 */
export const GET = route("admin_torrent_server_get", async () => {
  await requireAdmin();
  // The address is read from the shared state, so the instance has to pick it
  // up before it can report it.
  await syncTorrentServerSettings();
  const stored = await getSetting("torrentServer");
  const mediaBase = await getSetting("torrentServerMediaBase");
  return json({
    url: stored ?? torrentServerBase() ?? null,
    mediaBase: mediaBase ?? null,
    fromEnv: Boolean(process.env.FUBOL_TORRENT_SERVER?.trim()),
    enabled: Boolean(torrentServerBase()),
  });
});

export const POST = route("admin_torrent_server_set", async (request) => {
  await requireAdmin();
  const body = await readJson<{ url?: string; mediaBase?: string }>(request);
  const raw = (body.url ?? "").trim();

  // The address the resolver uses for itself, used to build the media path of
  // the HLS endpoint. It is the resolver's own view of itself, not the public
  // one the app reaches it at.
  if (typeof body.mediaBase === "string") {
    const media = body.mediaBase.trim();
    if (media) {
      try {
        const parsed = new URL(media);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return json({ error: "La dirección interna tiene que ser http o https" }, { status: 400 });
        }
      } catch {
        return json({ error: "La dirección interna no es una URL válida" }, { status: 400 });
      }
    }
    await setSetting("torrentServerMediaBase", media || null);
    setTorrentServerMediaBase(media || undefined);
  }

  if (!raw) {
    await setSetting("torrentServer", null);
    setTorrentServerBase(undefined);
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

  // Reachability before saving: a resolver that is down turns every torrent
  // source into a dead link, and the failure would show up minutes later as
  // "no reproduce".
  let reachable = false;
  let detail = "";
  try {
    const res = await fetch(parsed.toString(), { signal: AbortSignal.timeout(5000) });
    reachable = true;
    detail = `HTTP ${res.status}`;
    await res.body?.cancel();
  } catch (error) {
    detail = error instanceof Error ? error.message : "no respondió";
  }

  const normalized = parsed.toString().replace(/\/+$/, "");
  await setSetting("torrentServer", normalized);
  setTorrentServerBase(normalized);

  return json({ ok: true, url: normalized, reachable, detail });
});
