import { json, readJson, requireAdmin, route } from "@/lib/api";
import { baseUrl } from "@/lib/auth";
import { createShareLink, listShareLinks, type Permission } from "@/lib/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitize<T extends { pinHash: string | null }>(link: T): Omit<T, "pinHash"> & { hasPin: boolean } {
  const { pinHash, ...rest } = link;
  return { ...rest, hasPin: Boolean(pinHash) };
}

export const GET = route("admin_links", async () => {
  await requireAdmin();
  return json({ links: listShareLinks().map(sanitize) });
});

export const POST = route("admin_links_create", async (request) => {
  await requireAdmin();
  const body = await readJson<{
    label?: string;
    permissions?: string[];
    expiresInDays?: number | null;
    pin?: string | null;
  }>(request);
  const permissions = (body.permissions ?? ["live", "vod"]).filter(
    (permission): permission is Permission => permission === "live" || permission === "vod",
  );
  if (permissions.length === 0) {
    return json({ error: "Elegí al menos un permiso" }, { status: 400 });
  }
  if (body.pin && !/^\d{4,8}$/.test(body.pin)) {
    return json({ error: "El PIN debe tener 4 a 8 dígitos" }, { status: 400 });
  }
  const link = createShareLink({
    label: body.label?.slice(0, 60) || "Familia",
    permissions,
    expiresInDays: body.expiresInDays ?? null,
    pin: body.pin ?? null,
  });
  return json({ link: sanitize(link), url: `${baseUrl(request)}/f/${link.code}` });
});
