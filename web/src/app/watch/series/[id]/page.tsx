import type { Metadata } from "next";
import Link from "next/link";
import VodWatch from "@/components/VodWatch";
import { IconArrowRight } from "@/components/icons";
import { requirePageSession } from "@/lib/auth";
import { withTimeout } from "@/lib/http";
import { getVodMeta } from "@/lib/vod/service";
import { listProgress } from "@/lib/state/progress";
import type { AddonMeta } from "@/lib/addons";

export const dynamic = "force-dynamic";

type Episode = NonNullable<AddonMeta["videos"]>[number];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = await withTimeout(getVodMeta("series", id), 9000, "metadata").catch(() => null);
  return { title: meta?.name ?? "Serie" };
}

function episodeCode(episode: Episode): string {
  return `S${String(episode.season ?? 0).padStart(2, "0")}E${String(episode.episode ?? 0).padStart(2, "0")}`;
}

export default async function SeriesWatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ep?: string }>;
}) {
  const session = await requirePageSession("vod");
  const { id } = await params;
  const { ep } = await searchParams;
  const meta = await withTimeout(getVodMeta("series", id), 15000, "metadata").catch(() => null);

  const episodes = [...(meta?.videos ?? [])].sort(
    (a, b) =>
      (a.season ?? 0) - (b.season ?? 0) ||
      (a.episode ?? 0) - (b.episode ?? 0) ||
      (a.released ?? "").localeCompare(b.released ?? ""),
  );
  const requested = typeof ep === "string" ? ep : null;
  const selected = episodes.find((episode) => episode.id === requested) ?? episodes[0];
  const streamId = requested ?? selected?.id ?? id;
  const index = selected ? episodes.findIndex((episode) => episode.id === selected.id) : -1;
  const previous = index > 0 ? episodes[index - 1] : undefined;
  const next = index >= 0 && index < episodes.length - 1 ? episodes[index + 1] : undefined;

  const name = meta?.name ?? "Serie";
  // Where this episode was left, on any device.
  const scope = session.role === "admin" ? "admin" : session.code;
  const resumeFrom =
    (await listProgress(scope)).find(
      (item) => item.type === "series" && item.id === id && (item.episode ?? "") === streamId,
    )?.position ?? 0;
  const subtitle = selected
    ? `${episodeCode(selected)}${selected.title ? ` · ${selected.title}` : ""}`
    : requested
      ? `Episodio ${requested}`
      : "Episodio";

  return (
    <main className="watch-page">
      <header className="watch-head">
        <div>
          <Link href={`/series/${encodeURIComponent(id)}`} className="back-link">
            ← Volver a la serie
          </Link>
          <h1>{name}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="page-actions">
          {previous && (
            <Link
              href={`/watch/series/${encodeURIComponent(id)}?ep=${encodeURIComponent(previous.id)}`}
              className="btn btn-ghost btn-sm"
            >
              ← {episodeCode(previous)}
            </Link>
          )}
          {next && (
            <Link
              href={`/watch/series/${encodeURIComponent(id)}?ep=${encodeURIComponent(next.id)}`}
              className="btn btn-primary btn-sm"
            >
              {episodeCode(next)} <IconArrowRight size={14} />
            </Link>
          )}
        </div>
      </header>

      <VodWatch
        type="series"
        id={streamId}
        title={name}
        poster={meta?.background ?? meta?.poster}
        subtitle={subtitle}
        storageKey={`series:${streamId}`}
        resumeFrom={resumeFrom}
        seriesId={id}
        isAdmin={session.role === "admin"}
      />

      {requested && !selected && (
        <p className="watch-note" style={{ marginTop: 14 }}>
          El episodio pedido no está en la metadata. Se intenta reproducir igual con el id{" "}
          <code>{requested}</code>.
        </p>
      )}
    </main>
  );
}
