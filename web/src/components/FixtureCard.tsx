import Link from "next/link";
import type { CSSProperties } from "react";
import type { Fixture, FixtureMatch } from "@/lib/live/fixtures";
import { formatKickoff, formatKickoffTime } from "@/lib/live/fixtures";
import type { Channel } from "@/lib/live/types";
import { IconPlay, IconTv } from "./icons";

function initials(name: string): string {
  const clean = name
    .replace(/\b(club|atlético|atletico|de|del|la|el|los|las|ca|cf|fc|sc|afc|cd)\b/gi, " ")
    .trim();
  return clean
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function hue(name: string): number {
  let value = 0;
  for (const char of name) value = (value * 31 + char.charCodeAt(0)) % 360;
  return value;
}

function statusLabel(fixture: Fixture): { text: string; tone: string } {
  if (fixture.status === "live") return { text: "EN VIVO", tone: "live" };
  if (fixture.status === "finished") return { text: "FINAL", tone: "muted" };
  return { text: "PRÓXIMO", tone: "scheduled" };
}

export function TeamBadge({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={`team-badge team-badge-${size}`}
      style={{ "--hue": hue(name) } as CSSProperties}
      aria-hidden
    >
      {initials(name) || "?"}
    </span>
  );
}

function ChannelButtons({ channels, compact }: { channels: Channel[]; compact?: boolean }) {
  if (channels.length === 0) {
    return <span className="fixture-nosignal">Sin señal configurada</span>;
  }
  return (
    <div className="channel-buttons">
      {channels.slice(0, compact ? 2 : 3).map((channel) => (
        <Link
          key={channel.id}
          href={`/watch/live/${channel.id}`}
          className="btn btn-primary btn-xs"
          title={`${channel.name} · ${channel.sourceName}`}
        >
          <IconPlay size={13} />
          {channel.name.length > 18 ? `${channel.name.slice(0, 17)}…` : channel.name}
        </Link>
      ))}
      {channels.length > (compact ? 2 : 3) && (
        <span className="fixture-more">+{channels.length - (compact ? 2 : 3)}</span>
      )}
    </div>
  );
}

export default function FixtureCard({
  match,
  variant = "card",
}: {
  match: FixtureMatch;
  variant?: "card" | "row" | "hero";
}) {
  const { fixture, channels } = match;
  const status = statusLabel(fixture);
  const time = formatKickoff(fixture.kickoff);

  if (variant === "row") {
    return (
      <article className="fixture-row">
        <div className="fixture-row-time">
          <span className={`status-dot status-${status.tone}`} />
          <time dateTime={new Date(fixture.kickoff).toISOString()} title={time}>
            {formatKickoffTime(fixture.kickoff)}
          </time>
        </div>
        <div className="fixture-row-teams">
          <strong>{fixture.home}</strong>
          <span className="vs">vs</span>
          <strong>{fixture.away}</strong>
        </div>
        <div className="fixture-row-competition">{fixture.league}</div>
        <ChannelButtons channels={channels} compact />
      </article>
    );
  }

  return (
    <article className={`fixture-card fixture-${variant}`}>
      <header className="fixture-head">
        <span className="fixture-league">{fixture.league}</span>
        <span className={`status-pill status-${status.tone}`}>
          {status.tone === "live" && <i className="live-dot" />} {status.text}
        </span>
      </header>

      <div className="fixture-teams">
        <div className="fixture-team">
          <TeamBadge name={fixture.home} size="lg" />
          <span>{fixture.home}</span>
        </div>
        <div className="fixture-vs">
          {fixture.score ? <strong>{fixture.score}</strong> : <span>VS</span>}
        </div>
        <div className="fixture-team fixture-team-away">
          <TeamBadge name={fixture.away} size="lg" />
          <span>{fixture.away}</span>
        </div>
      </div>

      <footer className="fixture-foot">
        <div className="fixture-when">
          <time dateTime={new Date(fixture.kickoff).toISOString()}>{time}</time>
          <span className="tz">hora argentina</span>
        </div>
        <ChannelButtons channels={channels} />
      </footer>

      {fixture.tv && fixture.tv.length > 0 && (
        <div className="fixture-tv">
          <IconTv size={13} />
          {fixture.tv.slice(0, 3).join(" · ")}
        </div>
      )}
    </article>
  );
}
