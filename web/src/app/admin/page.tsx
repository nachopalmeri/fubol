import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPanel, { type AdminTab } from "@/components/AdminPanel";
import { requirePageSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel",
  description: "Administración de Fubol.",
};

const TABS: AdminTab[] = ["links", "sources", "addons", "health"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requirePageSession();
  if (session.role !== "admin") redirect("/entrar?admin=1");
  const { tab } = await searchParams;
  const initialTab = TABS.find((value) => value === tab) ?? "links";
  return <AdminPanel initialTab={initialTab} />;
}
