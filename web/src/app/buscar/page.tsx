import type { Metadata } from "next";
import SearchView from "@/components/SearchView";
import { requirePageSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buscar",
  description: "Buscá películas y series en los addons configurados.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePageSession("vod");
  const { q } = await searchParams;
  return (
    <main className="shell">
      <SearchView initialQuery={typeof q === "string" ? q : ""} />
    </main>
  );
}
