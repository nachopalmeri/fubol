import { json, requireSession, route } from "@/lib/api";
import { searchVod } from "@/lib/vod/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("vod_search", async (request) => {
  await requireSession("vod");
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchVod(query);
  return json({ query, results });
});
