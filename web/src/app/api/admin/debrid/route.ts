import { json, readJson, requireAdmin, route } from "@/lib/api";
import { getManifest, getStreams } from "@/lib/addons";
import { listAddonRows, updateAddon } from "@/lib/vod/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Providers that the stream addons accept in their manifest path, with the
 * key each one uses. Torrentio spells them `provider=token`; the others take
 * a base64 settings blob, so the panel offers a plain "manifest URL" for
 * those and only builds this format where it is unambiguous.
 */
const PROVIDERS: { id: string; label: string }[] = [
  { id: "torbox", label: "TorBox" },
  { id: "realdebrid", label: "Real-Debrid" },
  { id: "premiumize", label: "Premiumize" },
  { id: "alldebrid", label: "AllDebrid" },
  { id: "debridlink", label: "DebridLink" },
  { id: "easydebrid", label: "EasyDebrid" },
  { id: "offcloud", label: "Offcloud" },
  { id: "putio", label: "Put.io" },
  { id: "highway", label: "Highway" },
];

const TORRENTIO = "https://torrentio.strem.fun";

function maskToken(token: string): string {
  if (token.length <= 6) return "•".repeat(token.length);
  return `${token.slice(0, 2)}•${"•".repeat(Math.max(4, token.length - 6))}${token.slice(-4)}`;
}

export const GET = route("admin_debrid_providers", async () => {
  await requireAdmin();
  return json({ providers: PROVIDERS });
});

export const POST = route("admin_debrid", async (request) => {
  await requireAdmin();
  const body = await readJson<{
    provider?: string;
    token?: string;
    manifestUrl?: string;
    apply?: boolean;
  }>(request);

  const provider = (body.provider ?? "").trim().toLowerCase();
  const token = (body.token ?? "").trim();
  const customUrl = (body.manifestUrl ?? "").trim();

  let manifestUrl: string;
  let masked: string;
  if (customUrl) {
    if (!/^https:\/\//i.test(customUrl)) {
      return json({ error: "La URL del manifest tiene que ser https" }, { status: 400 });
    }
    manifestUrl = customUrl;
    masked = "el manifest que pegaste";
  } else {
    if (!PROVIDERS.some((item) => item.id === provider)) {
      return json({ error: "Elegí un proveedor" }, { status: 400 });
    }
    if (!token) return json({ error: "Falta el token" }, { status: 400 });
    manifestUrl = `${TORRENTIO}/${provider}=${encodeURIComponent(token)}/manifest.json`;
    masked = `${provider}=${maskToken(token)}`;
  }

  // The manifest answering is not the same as the token working: the addon
  // serves the manifest either way and only fails when it asks the provider.
  let resources: string[] = [];
  try {
    const manifest = await getManifest(manifestUrl, 15_000);
    resources = (manifest.resources ?? []).map((resource) =>
      typeof resource === "string" ? resource : resource.name,
    );
  } catch (error) {
    return json(
      { error: `El manifest no respondió: ${error instanceof Error ? error.message : "error"}` },
      { status: 400 },
    );
  }

  // Ask for a title every provider knows and count what comes back.
  let direct = 0;
  let p2p = 0;
  try {
    const streams = await getStreams(
      { id: "debrid-check", name: "Chequeo", url: manifestUrl, kind: "vod" },
      "movie",
      "tt0111161",
      { fresh: true },
    );
    direct = streams.filter((stream) => stream.url && /^https?:/i.test(stream.url)).length;
    p2p = streams.filter((stream) => !stream.url && stream.infoHash).length;
  } catch (error) {
    return json(
      { error: `El addon no respondió el pedido de fuentes: ${error instanceof Error ? error.message : "error"}` },
      { status: 400 },
    );
  }

  const applied: string[] = [];
  if (body.apply) {
    const addons = await listAddonRows(undefined, true);
    const host = (() => {
      try {
        return new URL(manifestUrl).host;
      } catch {
        return null;
      }
    })();
    // The addons that point at the same provider without a token are the ones
    // this configuration replaces: Torrentio's public manifest, or the same
    // host with a different configuration.
    const targets = addons.filter((addon) => {
      if (!host) return false;
      try {
        const addonHost = new URL(addon.url).host;
        if (addonHost !== host) return false;
        return !addon.url.includes("=");
      } catch {
        return false;
      }
    });
    for (const addon of targets) {
      await updateAddon(addon.id, { url: manifestUrl });
      applied.push(addon.name);
    }
  }

  return json({
    manifestUrl,
    masked,
    resources,
    direct,
    p2p,
    ok: direct > 0,
    applied,
  });
});
