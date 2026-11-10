import { cacheGet, cacheSet } from "../cache";
import { env } from "../env";
import { getSetting } from "../state/settings";
import { fetchJson, fetchText } from "../http";
import { logger } from "../logger";
import { normalizeChannelName } from "./sources";
import type { Channel } from "./types";

export type FixtureStatus = "scheduled" | "live" | "finished" | "postponed";

/**
 * A football match plus stoppage, half time and the walk off is comfortably
 * over two hours; a cup tie with extra time and penalties runs past three. The
 * old fixed 130-minute window marked those as finished while they were still
 * being played, so they vanished from "Ahora en cancha".
 */
const LEAGUE_DURATION_MIN = 150;
const CUP_DURATION_MIN = 210;

/** Nobody opens the app four minutes before kickoff. */
const PRE_KICKOFF_MIN = 25;

/** How long a "not started" from the feed is believed after kickoff passes. */
const STALE_STATUS_GRACE_MIN = 15;

export interface Fixture {
  id: string;
  title: string;
  home: string;
  away: string;
  league: string;
  kickoff: number;
  status: FixtureStatus;
  /**
   * Status string exactly as the feed sent it. Kept so the status can be
   * re-derived later without throwing away what the upstream knew: the list
   * helpers used to recompute from the clock alone and reported postponed
   * matches as live.
   */
  rawStatus?: string;
  source: "thesportsdb" | "ics" | "channel";
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

/**
 * Upstream status codes, matched on whole tokens. The previous patterns were
 * bare substrings: `/ns/` and `/ft/` matched inside unrelated words, and
 * `/pen/` matched "Pending", so a pending match could read as finished.
 */
const STATUS_FINISHED = /^(ft|aet|pen|awd|wo)$/i;
const STATUS_FINISHED_WORDS = /\b(match finished|finished|full[- ]time|after extra time|after penalties)\b/i;
const STATUS_SCHEDULED = /^(ns|tbd|tba)$/i;
const STATUS_SCHEDULED_WORDS = /\b(not started|scheduled|to be decided)\b/i;
const STATUS_POSTPONED = /\b(postp|postponed|cancelled|canceled|suspended|abandoned|susp)\b/i;
const STATUS_LIVE_WORDS = /\b(1h|2h|ht|et|half[- ]time|in play|live|playing)\b/i;

function matchDurationMin(league: string | undefined): number {
  return league && CUPS.test(league) ? CUP_DURATION_MIN : LEAGUE_DURATION_MIN;
}

/**
 * Derives a status from the upstream value when there is one, and only falls
 * back to the clock when there is not. The clock alone cannot tell a postponed
 * match from one in progress, and it used to report both as live.
 */
function statusFor(
  kickoff: number,
  rawStatus: string | undefined,
  now = Date.now(),
  league?: string,
): FixtureStatus {
  const raw = rawStatus?.trim();
  if (raw) {
    if (STATUS_POSTPONED.test(raw)) return "postponed";
    if (STATUS_FINISHED.test(raw) || STATUS_FINISHED_WORDS.test(raw)) return "finished";
    if (STATUS_LIVE_WORDS.test(raw)) return "live";
    if (STATUS_SCHEDULED.test(raw) || STATUS_SCHEDULED_WORDS.test(raw)) {
      // TheSportsDB's free tier never updates a match once it starts, so "NS"
      // an hour past kickoff means "we stopped looking", not "it has not
      // started". After a grace period the clock wins; inside it the feed is
      // believed, which covers a genuinely delayed kickoff.
      if (now < kickoff + STALE_STATUS_GRACE_MIN * 60_000) return "scheduled";
      if (now <= kickoff + matchDurationMin(league) * 60_000) return "live";
      return "finished";
    }
  }
  const endsAt = kickoff + matchDurationMin(league) * 60_000;
  if (now >= kickoff - PRE_KICKOFF_MIN * 60_000 && now <= endsAt) return "live";
  if (now > endsAt) return "finished";
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
    status: statusFor(kickoff, event.strStatus, Date.now(), league),
    rawStatus: event.strStatus?.trim() || undefined,
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

async function icsFeeds(): Promise<IcsFeed[]> {
  const feeds: IcsFeed[] = [];
  const fromEnv = process.env.FUBOL_ICS_URLS?.split(",").map((url) => url.trim()).filter(Boolean) ?? [];
  for (const url of fromEnv) feeds.push({ name: "Calendario", url });
  const stored = await getSetting("fixtures.ics");
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
            status: statusFor(start, event.STATUS, Date.now(), event.CATEGORIES),
            rawStatus: event.STATUS?.trim() || undefined,
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
  const feeds = await icsFeeds();
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const cacheKey = `fixtures:ics:${feed.url}`;
      const cached = cacheGet<Fixture[]>(cacheKey);
      if (cached) return cached;
      const { text } = await fetchText(feed.url, { timeoutMs: 12_000, maxBytes: 2_000_000 });
      const parsed = parseIcs(text, env.timezone);
      cacheSet(cacheKey, parsed, 30 * 60_000);
      return parsed;
    }),
  );
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

/* ------------------------ Fixtures from channels ------------------------ */

/**
 * Live catalogs list individual matches as channels, named "Home vs Away".
 * Those entries are the only football the app can actually open, yet the
 * agenda used to be built solely from TheSportsDB — whose free key returned
 * three Argentine matches for an entire Sunday while the channel list held
 * twenty-one playable ones. The agenda now also reflects what is playable.
 */
const VERSUS = /\s+(?:vs\.?|v\.?|-|x)\s+/i;

/** Channel names that are a station, not a match. */
const NOT_A_MATCH =
  /\b(sky|espn|fox|tnt|tyc|dazn|bein|sport(s)?|premier|golf|tennis|cricket|news|hd|fhd|uhd|canal|tv)\b\s*$/i;

/**
 * Only groups that mean football. A generic "Live Now" catalog mixes NFL, NBA,
 * NHL and rugby into the same list, and this is a football agenda: those
 * entries stay reachable through the channel browser instead.
 */
const FOOTBALL_GROUP = /f[uú]tbol|football|soccer|calcio|liga|premier|libertadores|champions|copa|eredivisie|bundesliga|ligue/i;

/** Groups that name a different sport outright. */
const OTHER_SPORT_GROUP =
  /\b(nfl|nba|nhl|mlb|rugby|tennis|golf|cricket|boxing|ufc|mma|motogp|f1|formula|basket|hockey|baseball|american football)\b/i;

export function groupIsFootball(group: string | undefined): boolean {
  if (!group) return false;
  if (OTHER_SPORT_GROUP.test(group)) return false;
  return FOOTBALL_GROUP.test(group);
}

/**
 * Franchise nicknames from the North American leagues and rugby, used to keep
 * their fixtures out of a football agenda when the catalog group does not say
 * which sport it is. Restricting the agenda to football-named groups alone
 * also dropped real matches — Juventus vs Napoli sat in a mixed "Live Now"
 * list — so the match name gets a say too.
 *
 * MLS clubs are deliberately absent: they play football.
 */
const OTHER_SPORT_TEAMS = new RegExp(
  "\\b(" +
    // NFL
    "bills|ravens|bengals|titans|cowboys|cardinals|lions|vikings|jaguars|colts|jets|raiders|" +
    "steelers|browns|buccaneers|falcons|rams|chargers|broncos|chiefs|dolphins|patriots|" +
    "packers|bears|saints|seahawks|49ers|giants|eagles|commanders|texans|panthers|" +
    // NBA
    "magic|celtics|pacers|nets|lakers|knicks|bulls|heat|spurs|mavericks|nuggets|warriors|" +
    "clippers|grizzlies|pelicans|timberwolves|trail blazers|thunder|jazz|suns|kings|hornets|" +
    "cavaliers|pistons|raptors|76ers|bucks|hawks|wizards|rockets|" +
    // NHL
    "capitals|flyers|mammoth|bruins|canadiens|maple leafs|senators|sabres|penguins|" +
    "blackhawks|red wings|avalanche|golden knights|kraken|oilers|flames|canucks|" +
    "lightning|hurricanes|islanders|devils|blues|predators|ducks|sharks|coyotes|" +
    // MLB
    "yankees|red sox|dodgers|cubs|mets|astros|braves|phillies|padres|mariners|" +
    // Rugby
    "stade toulousain|section paloise|racing 92|saracens|harlequins|leinster|munster|crusaders" +
  ")\\b",
  "i",
);

export function nameLooksLikeOtherSport(name: string): boolean {
  return OTHER_SPORT_TEAMS.test(name);
}

function looksLikeMatchName(name: string): boolean {
  if (!VERSUS.test(name)) return false;
  const [home = "", away = ""] = name.split(VERSUS);
  if (home.trim().length < 3 || away.trim().length < 3) return false;
  // "SKY SPORTS PREMIER LEAGUE" has no separator, but guard anyway.
  return !NOT_A_MATCH.test(home.trim()) && !NOT_A_MATCH.test(away.trim());
}

/** Strips quality and provider decorations: "(FHD) : Getafe vs Sevilla". */
function cleanMatchName(name: string): string {
  return name
    .replace(/\((?:fhd|hd|uhd|sd|4k|1080p?|720p?)\)/gi, " ")
    .replace(/^\s*[a-z]{2,3}\s*:\s*/i, " ")
    .replace(/\s*:\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds agenda entries from live channels that name a specific match. These
 * carry no kickoff time from the provider, so they are treated as in progress:
 * a live catalog only lists a match while it is on.
 */
export function fixturesFromChannels(channels: Channel[], now = Date.now()): Fixture[] {
  const out: Fixture[] = [];
  const seen = new Set<string>();
  for (const channel of channels) {
    const name = cleanMatchName(channel.name ?? "");
    if (!looksLikeMatchName(name)) continue;
    // A football-named group is enough on its own; a mixed catalog has to get
    // past the other-sport check on the match name.
    if (!groupIsFootball(channel.group) && nameLooksLikeOtherSport(name)) continue;
    const [rawHome = "", rawAway = ""] = name.split(VERSUS);
    const home = rawHome.trim();
    const away = rawAway.trim();
    const key = `${normalizeChannelName(home)}|${normalizeChannelName(away)}`;
    if (!key.replace("|", "") || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `channel:${key}`,
      title: `${home} vs ${away}`,
      home,
      away,
      league: channel.group && !/^(live now|canales|addon)$/i.test(channel.group) ? channel.group : "Fútbol",
      kickoff: now,
      status: "live",
      rawStatus: "live",
      source: "channel",
    });
  }
  return out;
}

/* ---------------------------- Public API ---------------------------- */

/** A scheduled entry beats a channel-derived one: it knows the real kickoff. */
const SOURCE_RANK: Record<Fixture["source"], number> = { thesportsdb: 0, ics: 1, channel: 2 };

function dedupe(fixtures: Fixture[]): Fixture[] {
  const seen = new Map<string, Fixture>();
  // Team names alone, so the same match arriving from a calendar and from a
  // live channel collapses into one entry even though only one of them knows
  // the kickoff time.
  for (const fixture of [...fixtures].sort(
    (a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || a.kickoff - b.kickoff,
  )) {
    const key = `${normalizeChannelName(fixture.home)}|${normalizeChannelName(fixture.away)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, fixture);
      continue;
    }
    // Same teams more than a day apart is a different leg, not a duplicate.
    if (Math.abs(existing.kickoff - fixture.kickoff) > DAY_MS) {
      seen.set(`${key}|${Math.round(fixture.kickoff / DAY_MS)}`, fixture);
    }
  }
  return [...seen.values()].sort((a, b) => a.kickoff - b.kickoff);
}

export async function getFixtures(
  options: { daysBack?: number; daysForward?: number; channels?: Channel[] } = {},
): Promise<Fixture[]> {
  const timeZone = env.timezone;
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
  const fromChannels = options.channels ? fixturesFromChannels(options.channels, now) : [];
  return dedupe([...tsdb.flat(), ...ics, ...fromChannels]);
}

/**
 * Folds playable matches into an already-fetched agenda. Lets a page load the
 * schedule and the channel index in parallel and still end up with a single
 * list, instead of showing "no hay partidos" beside a column of live ones.
 */
export function mergeChannelFixtures(fixtures: Fixture[], channels: Channel[], now = Date.now()): Fixture[] {
  if (channels.length === 0) return fixtures;
  return dedupe([...fixtures, ...fixturesFromChannels(channels, now)]);
}

export function todaysFixtures(fixtures: Fixture[], now = Date.now()): Fixture[] {
  const timeZone = env.timezone;
  const today = dateKeyInTz(new Date(now), timeZone);
  return fixtures.filter((fixture) => dateKeyInTz(new Date(fixture.kickoff), timeZone) === today);
}

export function liveFixtures(fixtures: Fixture[], now = Date.now()): Fixture[] {
  return fixtures
    .filter((fixture) => statusFor(fixture.kickoff, fixture.rawStatus, now, fixture.league) === "live")
    .sort((a, b) => a.kickoff - b.kickoff);
}

/** Re-derives the status against the current clock, keeping upstream's word. */
export function currentStatus(fixture: Fixture, now = Date.now()): FixtureStatus {
  return statusFor(fixture.kickoff, fixture.rawStatus, now, fixture.league);
}

export function upcomingFixtures(fixtures: Fixture[], now = Date.now()): Fixture[] {
  return fixtures.filter((fixture) => fixture.kickoff > now).sort((a, b) => a.kickoff - b.kickoff);
}

export interface FixtureMatch {
  fixture: Fixture;
  channels: Channel[];
  score: number;
  /** True when the broadcaster was guessed because the feed had no TV data. */
  inferred: boolean;
}

// Argentine rights are split between these, and TheSportsDB often ships no TV
// station for a match. Ordered by how likely they are to carry a big match.
const AR_BROADCASTERS: Array<{ pattern: RegExp; rank: number }> = [
  { pattern: /espn premium/i, rank: 0 },
  { pattern: /tnt sports/i, rank: 1 },
  { pattern: /\bespn\b/i, rank: 2 },
  { pattern: /tyc sports/i, rank: 3 },
  { pattern: /fox sports/i, rank: 4 },
  { pattern: /deportv/i, rank: 5 },
  { pattern: /telefe|el trece|eltrece|tv p[uú]blica/i, rank: 6 },
];

function inferredBroadcasters(fixture: Fixture, channels: Channel[]): Channel[] {
  if (!ARGENTINE.test(fixture.league) && !CUPS.test(fixture.league)) return [];
  const ranked = channels
    .filter((channel) => /argentin/i.test(`${channel.group ?? ""} ${channel.name ?? ""}`))
    .map((channel) => {
      const name = normalizeChannelName(channel.name);
      const hit = AR_BROADCASTERS.find((candidate) => candidate.pattern.test(name));
      return hit ? { channel, rank: hit.rank } : null;
    })
    .filter((entry): entry is { channel: Channel; rank: number } => entry !== null)
    .sort((a, b) => a.rank - b.rank);
  return ranked.slice(0, 3).map((entry) => entry.channel);
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
  if (best === 0) {
    const inferred = inferredBroadcasters(fixture, channels);
    return { fixture, channels: inferred, score: 0, inferred: inferred.length > 0 };
  }
  return { fixture, channels: channelsForFixture, score: best, inferred: false };
}

export function formatKickoff(kickoff: number, locale = "es-AR", timeZone = env.timezone): string {
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
export function formatKickoffTime(kickoff: number, locale = "es-AR", timeZone = env.timezone): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(kickoff));
}

export { dateKeyInTz, statusFor, parseIcs, parseIcsDate };
