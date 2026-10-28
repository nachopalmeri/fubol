import type { Metadata } from "next";
import Link from "next/link";
import LiveWatch from "@/components/LiveWatch";
import { requirePageSession } from "@/lib/auth";
import { getChannelById } from "@/lib/live/sources";
import { withTimeout } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ channelId: string }>;
}): Promise<Metadata> {
  const { channelId } = await params;
  const channel = await withTimeout(getChannelById(channelId), 8000, "canal").catch(() => undefined);
  return { title: channel?.name ?? "Canal en vivo" };
}

export default async function LiveWatchPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  await requirePageSession("live");
  const { channelId } = await params;
  const channel = await withTimeout(getChannelById(channelId), 10000, "canal").catch(() => undefined);

  return (
    <main className="watch-page">
      <header className="watch-head">
        <div>
          <Link href="/live" className="back-link">
            ← Volver a en vivo
          </Link>
          <h1>{channel?.name ?? "Canal en vivo"}</h1>
          <p>
            {channel
              ? `${channel.group} · ${channel.sourceName}`
              : "Si el canal no aparece en el índice, puede haber cambiado en la lista de origen."}
          </p>
        </div>
        <span className="chip chip-lime">failover automático</span>
      </header>

      <LiveWatch channelId={channelId} />
    </main>
  );
}
