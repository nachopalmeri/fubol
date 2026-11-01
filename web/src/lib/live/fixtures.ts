import { cacheGet, cacheSet, getSetting } from "../db";
import { fetchJson, fetchText } from "../http";
import { logger } from "../logger";
import { normalizeChannelName } from "./sources";
import type { Channel } from "./types";

export type FixtureStatus = "scheduled" | "live" | "finished";

export interface Fixture {
  id: string;
  title: string;
  home: string;
  away: string;
  league: string;
  kickoff: number;
  status: FixtureStatus;
  source: "thesportsdb" | "ics";
  venue?: string;
  tv?: string[];
  score?: string;
  art?: string;
}

interface TsdbEvent {
  idEvent?: string;
  strTimestamp?: string;
  strEvent?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strLeague?: string;
  strSport?: string;
  strTVStation?: string;
  strVenue?: string;
  strThumb?: string;
  strStatus?: string;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
}

const ARGENTINE =
  /argentin|liga profesional|primera nacional|primera b|primera c|federal a|federal b|copa argentina|supercopa argentina|torneo betano/i;
const CUPS =
  /libertadores|sudamericana|recopa|copa am[eé]rica|eliminatoria|world cup|mundial|finalissima|conmebol/i;
const INTERNATIONAL =
  /premier league|la liga|serie a|bundesliga|ligue 1|champions league|europa league|conference league|eredivisie|primeira liga|mls/i;

const DAY_MS = 86_400_000;

function dateKeyInTz(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function statusFor(kickoff: number, rawStatus: string | undefined, now = Date.now()): FixtureStatus {
  if (rawStatus && /finished|ft|aet|pen|after/i.test(rawStatus)) return "finished";
  if (rawStatus && /not started|ns|scheduled|tbd/i.test(rawStatus)) return "scheduled";
  if (now >= kickoff - 5 * 60_000 && now <= kickoff + 130 * 60_000) return "live";
  if (now > kickoff + 130 * 60_000) return "finished";
  return "scheduled";
}

function parseKickoff(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = /Z$|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function fixtureFromTsdb(event: TsdbEvent): Fixture | null {
  if (!event.strEvent || !event.strTimestamp) return null;
  const kickoff = parseKickoff(event.strTimestamp);
  if (!kickoff) return null;
  const league = event.strLeague ?? "Fútbol";
  const includeInternational = process.env.FUBOL_INCLUDE_INTERNATIONAL !== "0";
  if (!ARGENTINE.test(league) && !CUPS.test(league) && !(includeInternational && INTERNATIONAL.test(league))) {
    return null;
  }
  const home = event.strHomeTeam ?? event.strEvent.split(/\s+vs\.?\s+/i)[0] ?? "";
  const away = event.strAwayTeam ?? event.strEvent.split(/\s+vs\.?\s+/i)[1] ?? "";
  const tv = (event.strTVStation ?? "")
    .split(/[,|/]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const score =
    event.intHomeScore !== null &&
    event.intHomeScore !== undefined &&
    event.intAwayScore !== null &&
    event.intAwayScore !== undefined
      ? `${event.intHomeScore}-${event.intAwayScore}`
      : undefined;
  return {
    id: `tsdb:${event.idEvent ?? `${home}-${away}-${kickoff}`}`,
    title: event.strEvent,
    home: home.trim(),
    away: away.trim(),
    league: league.trim(),
    kickoff,
    status: statusFor(kickoff, event.strStatus),
    source: "thesportsdb",
    venue: event.strVenue || undefined,
    tv: tv.length ? tv : undefined,
    score,
    art: event.strThumb || undefined,
  };
}

async function fetchTsdbDay(date: string): Promise<Fixture[]> {
  const key = process.env.SPORTSDB_KEY?.trim() || "123";
  const url = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/eventsday.php?d=${date}&s=Soccer`;
  const cacheKey = `fixtures:tsdb:${date}`;
  const cached = cacheGet<Fixture[]>(cacheKey);
  if (cached) return cached;
  try {
    const { data } = await fetchJson<{ events?: TsdbEvent[] | null }>(url, { timeoutMs: 12_000 });
    const fixtures = (data.events ?? [])
      .map(fixtureFromTsdb)
      .filter((fixture): fixture is Fixture => fixture !== null);
    cacheSet(cacheKey, fixtures, 10 * 60_000);
    cacheSet(`fixtures:stale:${date}`, fixtures, 7 * 86_400_000);
    return fixtures;
  } catch (error) {
    const stale = cacheGet<Fixture[]>(`fixtures:stale:${date}`);
    logger.warn("fixtures_failed", { date, stale: Boolean(stale), error });
    return stale ?? [];
  }
}

/* ------------------------------- ICS ------------------------------- */

interface IcsFeed {
  name: string;
  url: string;
}

function icsFeeds(): IcsFeed[] {
  const feeds: IcsFeed[] = [];
  const fromEnv = process.env.FUBOL_ICS_URLS?.split(",").map((url) => url.trim()).filter(Boolean) ?? [];
  for (const url of fromEnv) feeds.push({ name: "Calendario", url });
  const stored = getSetting("fixtures.ics");
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as IcsFeed[];
      for (const feed of parsed) {
        if (feed?.url && !feeds.some((item) => item.url === feed.url)) feeds.push(feed);
      }
    } catch {
      // ignore malformed setting
    }
  }
  return feeds;
}

function unfoldIcs(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  return raw;
}

function parseIcsDate(value: string, timeZone: string): number | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00", utc] = match;
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
  if (utc) {
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  }
  // Convert wall-clock time in the configured zone to UTC using the zone offset.
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const formatted = formatter.formatToParts(new Date(guess));
  const get = (type: string) => Number(formatted.find((part) => part.type === type)?.value ?? 0);
  const asZoned = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = asZoned - guess;
  return guess - offset;
}

function parseIcs(text: string, timeZone: string): Fixture[] {
  const lines = unfoldIcs(text);
  const fixtures: Fixture[] = [];
  let event: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      event = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (event) {
        const summary = event.SUMMARY ?? "";
        const start = event.DTSTART ? parseIcsDate(event.DTSTART, timeZone) : null;
        if (summary && start) {
          const [home = summary, away = ""] = summary.split(/\s+(?:vs\.?|v\.?|-)\s+/i);
          fixtures.push({
            id: `ics:${event.UID ?? `${summary}-${start}`}`,
            title: summary,
            home: home.trim(),
            away: away.trim(),
            league: event.CATEGORIES ?? "Calendario",
            kickoff: start,
            status: statusFor(start, undefined),
            source: "ics",
            venue: event.LOCATION || undefined,
          });
        }
      }
      event = null;
      continue;
    }
    if (!event) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const rawKey = line.slice(0, colon);
    const key = rawKey.split(";")[0] ?? rawKey;
    event[key] = line.slice(colon + 1).trim();
  }
  return fixtures;
}

async function fetchIcsFixtures(): Promise<Fixture[]> {
  const feeds = icsFeeds();
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const cacheKey = `fixtures:ics:${feed.url}`;
      const cached = cacheGet<Fixture[]>(cacheKey);
      if (cached) return cached;
      const { text } = await fetchText(feed.url, { timeoutMs: 12_000, maxBytes: 2_000_000 });
      const parsed = parseIcs(text, process.env.TZ || "America/Argentina/Buenos_Aires");
      cacheSet(cacheKey, parsed, 30 * 60_000);
      return parsed;
    }),
  );
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

/* ---------------------------- Public API ---------------------------- */

function dedupe(fixtures: Fixture[]): Fixture[] {
  const seen = new Map<string, Fixture>();
  for (const fixture of fixtures.sort((a, b) => a.kickoff - b.kickoff)) {
    const key = `${normalizeChannelName(fixture.home)}|${normalizeChannelName(fixture.away)}|${Math.round(
      fixture.kickoff / (6 * 3600_000),
    )}`;
    if (!seen.has(key)) seen.set(key, fixture);
  }
  return [...seen.values()].sort((a, b) => a.kickoff - b.kickoff);
}

export async function getFixtures(options: { daysBack?: number; daysForward?: number } = {}): Promise<Fixture[]> {
  const timeZone = process.env.TZ || "America/Argentina/Buenos_Aires";
  const daysBack = options.daysBack ?? 0;
  const daysForward = options.daysForward ?? 1;
  const dates = new Set<string>();
  const now = Date.now();
  for (let offset = -daysBack; offset <= daysForward; offset++) {
    dates.add(dateKeyInTz(new Date(now + offset * DAY_MS), timeZone));
  }
  const [tsdb, ics] = await Promise.all([
    Promise.all([...dates].map((date) => fetchTsdbDay(date))),
    fetchIcsFixtures(),
  ]);
  return dedupe([...tsdb.flat(), ...ics]);
}

export function todaysFixtures(fixtures: Fixture[], now = Date.now()): Fixture[] {
  const timeZone = process.env.TZ || "America/Argentina/Buenos_Aires";
  const today = dateKeyInTz(new Date(now), timeZone);
  return fixtures.filter((fixture) => dateKeyInTz(new Date(fixture.kickoff), timeZone) === today);
}

export function liveFixtures(fixtures: Fixture[], now = Date.now()): Fixture[] {
  return fixtures
    .filter((fixture) => statusFor(fixture.kickoff, undefined, now) === "live")
    .sort((a, b) => a.kickoff - b.kickoff);
}

export function upcomingFixtures(fixtures: Fixture[], now = Date.now()): Fixture[] {
  return fixtures.filter((fixture) => fixture.kickoff > now).sort((a, b) => a.kickoff - b.kickoff);
}

export interface FixtureMatch {
  fixture: Fixture;
  channels: Channel[];
  score: number;
}

/** Matches a fixture to configured channels using team names and TV station. */
export function matchFixtureChannels(fixture: Fixture, channels: Channel[]): FixtureMatch {
  const teams = [fixture.home, fixture.away]
    .map((team) => normalizeChannelName(team))
    .filter((team) => team.length >= 3);
  const stationTokens = (fixture.tv ?? [])
    .map((station) => normalizeChannelName(station))
    .filter(Boolean);

  const scored = channels.map((channel) => {
    const name = normalizeChannelName(channel.name);
    let score = 0;
    for (const team of teams) {
      if (name.includes(team)) score += 45;
      else {
        const tokens = team.split(" ").filter((token) => token.length >= 4);
        if (tokens.some((token) => name.includes(token))) score += 18;
      }
    }
    for (const station of stationTokens) {
      if (station && (name.includes(station) || station.includes(name))) score += 55;
      else {
        const tokens = station.split(" ").filter((token) => token.length >= 3 && !/^(sports?|deportes|futbol|football|tv|live|hd)$/.test(token));
        if (tokens.some((token) => name.includes(token))) score += 30;
      }
    }
    return { channel, score };
  });

  const channelsForFixture = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((entry) => entry.channel);

  const best = scored.reduce((max, entry) => Math.max(max, entry.score), 0);
  return { fixture, channels: channelsForFixture, score: best };
}

export function formatKickoff(kickoff: number, locale = "es-AR", timeZone = process.env.TZ || "America/Argentina/Buenos_Aires"): string {
  const label = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(kickoff));
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

/** Compact clock for lists that already sit inside a single day. */
export function formatKickoffTime(kickoff: number, locale = "es-AR", timeZone = process.env.TZ || "America/Argentina/Buenos_Aires"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(kickoff));
}

export { dateKeyInTz, statusFor, parseIcs, parseIcsDate };
