import { describe, expect, it } from "vitest";
import {
  dateKeyInTz,
  formatKickoff,
  matchFixtureChannels,
  parseIcs,
  parseIcsDate,
  statusFor,
  todaysFixtures,
  type Fixture,
} from "../src/lib/live/fixtures";
import type { Channel } from "../src/lib/live/types";

const TZ = "America/Argentina/Buenos_Aires";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:match-1
SUMMARY:Boca Juniors vs River Plate
DTSTART:20260321T210000
CATEGORIES:Liga Profesional
LOCATION:La Bombonera
END:VEVENT
BEGIN:VEVENT
UID:match-2
SUMMARY:Racing Club vs Independiente
DTSTART:20260322T000000Z
CATEGORIES:Liga Profesional
END:VEVENT
END:VCALENDAR
`;

function channel(name: string, group = "Deportes"): Channel {
  return {
    id: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    group,
    sourceId: "src",
    sourceName: "Casa",
    kind: "m3u",
    urls: ["https://cdn.example/live.m3u8"],
  };
}

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: "test-1",
    title: "Boca Juniors vs River Plate",
    home: "Boca Juniors",
    away: "River Plate",
    league: "Liga Profesional",
    kickoff: Date.now(),
    status: "live",
    source: "ics",
    tv: ["ESPN Premium"],
    ...overrides,
  };
}

describe("date helpers", () => {
  it("builds date keys in the configured timezone", () => {
    expect(dateKeyInTz(new Date("2026-01-02T02:00:00Z"), TZ)).toBe("2026-01-01");
    expect(dateKeyInTz(new Date("2026-01-02T04:00:00Z"), TZ)).toBe("2026-01-02");
  });

  it("formats kickoff in Spanish", () => {
    const label = formatKickoff(Date.parse("2026-03-22T00:00:00Z"));
    expect(label.length).toBeGreaterThan(4);
    expect(label).toContain("21:00");
    expect(label).toContain("Sáb");
  });
});

describe("statusFor", () => {
  const kickoff = Date.parse("2026-03-21T21:00:00Z");

  it("derives live from the time window", () => {
    expect(statusFor(kickoff, undefined, kickoff + 30 * 60_000)).toBe("live");
  });

  it("keeps scheduled matches scheduled", () => {
    expect(statusFor(kickoff, undefined, kickoff - 60 * 60_000)).toBe("scheduled");
  });

  it("keeps a league match live through stoppage and the walk off", () => {
    // The old 130-minute window closed while matches were still being played.
    expect(statusFor(kickoff, undefined, kickoff + 140 * 60_000)).toBe("live");
    expect(statusFor(kickoff, undefined, kickoff + 160 * 60_000)).toBe("finished");
  });

  it("keeps a cup tie live through extra time and penalties", () => {
    const league = "Copa Libertadores";
    expect(statusFor(kickoff, undefined, kickoff + 170 * 60_000, league)).toBe("live");
    expect(statusFor(kickoff, undefined, kickoff + 220 * 60_000, league)).toBe("finished");
  });

  it("opens the live window before kickoff so the app is usable early", () => {
    expect(statusFor(kickoff, undefined, kickoff - 10 * 60_000)).toBe("live");
    expect(statusFor(kickoff, undefined, kickoff - 40 * 60_000)).toBe("scheduled");
  });

  it("respects explicit upstream status", () => {
    expect(statusFor(kickoff, "FT", kickoff + 60_000)).toBe("finished");
    expect(statusFor(kickoff, "Match Finished", kickoff + 60_000)).toBe("finished");
    expect(statusFor(kickoff, "Not Started", kickoff + 60_000)).toBe("scheduled");
    expect(statusFor(kickoff, "2H", kickoff + 60 * 60_000)).toBe("live");
  });

  it("reports a postponed match as postponed, never as live", () => {
    // The clock alone said "live" for a match that was called off.
    expect(statusFor(kickoff, "Postponed", kickoff + 30 * 60_000)).toBe("postponed");
    expect(statusFor(kickoff, "Suspended", kickoff + 30 * 60_000)).toBe("postponed");
    expect(statusFor(kickoff, "Cancelled", kickoff - 60_000)).toBe("postponed");
  });

  it("stops believing a stale 'not started' long after kickoff", () => {
    // The free feed never updates once a match begins, so "NS" two hours in
    // means nobody looked, not that the match has not started.
    expect(statusFor(kickoff, "NS", kickoff + 5 * 60_000)).toBe("scheduled");
    expect(statusFor(kickoff, "NS", kickoff + 60 * 60_000)).toBe("live");
    expect(statusFor(kickoff, "NS", kickoff + 300 * 60_000)).toBe("finished");
  });

  it("matches status codes as tokens, not as substrings", () => {
    // `/pen/` used to match "Pending" and report it as finished.
    expect(statusFor(kickoff, "Pending", kickoff - 60 * 60_000)).toBe("scheduled");
  });
});

describe("ICS parsing", () => {
  it("parses UTC and local times", () => {
    expect(parseIcsDate("20260322T000000Z", TZ)).toBe(Date.parse("2026-03-22T00:00:00Z"));
    expect(parseIcsDate("20260321T210000", TZ)).toBe(Date.parse("2026-03-22T00:00:00Z"));
    expect(parseIcsDate("not-a-date", TZ)).toBeNull();
  });

  it("extracts fixtures with teams, league and venue", () => {
    const fixtures = parseIcs(ICS, TZ);
    expect(fixtures).toHaveLength(2);
    const match = fixtures[0];
    expect(match?.id).toBe("ics:match-1");
    expect(match?.home).toBe("Boca Juniors");
    expect(match?.away).toBe("River Plate");
    expect(match?.league).toBe("Liga Profesional");
    expect(match?.venue).toBe("La Bombonera");
    expect(match?.kickoff).toBe(Date.parse("2026-03-22T00:00:00Z"));
    expect(fixtures[1]?.kickoff).toBe(Date.parse("2026-03-22T00:00:00Z"));
  });
});

describe("agenda helpers", () => {
  it("filters fixtures to today in Buenos Aires", () => {
    const now = Date.parse("2026-03-21T23:00:00Z");
    const today = fixture({ id: "today", kickoff: Date.parse("2026-03-21T18:00:00Z") });
    const tomorrow = fixture({ id: "tomorrow", kickoff: Date.parse("2026-03-22T18:00:00Z") });
    expect(todaysFixtures([today, tomorrow], now).map((item) => item.id)).toEqual(["today"]);
  });

  it("matches channels by TV station and team", () => {
    const match = matchFixtureChannels(
      fixture(),
      [channel("ESPN Premium"), channel("Boca TV"), channel("Cine", "Películas")],
    );
    expect(match.channels.map((item) => item.name)).toContain("Boca TV");
    expect(match.channels[0]?.name).toBe("ESPN Premium");
    expect(match.channels.some((item) => item.name === "Cine")).toBe(false);
    expect(match.score).toBeGreaterThan(40);
  });

  it("returns no channels when nothing matches", () => {
    const match = matchFixtureChannels(fixture({ home: "Zenit", away: "Rubin", tv: [] }), [
      channel("Cine", "Películas"),
    ]);
    expect(match.channels).toHaveLength(0);
    expect(match.score).toBe(0);
  });
  it("does not associate unrelated sports channels merely because they have a sports group", () => {
    const match = matchFixtureChannels(fixture({ home: "Santos", away: "Palmeiras", tv: [] }), [
      channel("Sky Sports Premier League", "Football"),
      channel("Panathinaikos vs Aris", "Sports Streams"),
    ]);
    expect(match.channels).toEqual([]);
    expect(match.score).toBe(0);
  });

  it("infers Argentine broadcasters when the feed has no TV station", () => {
    const match = matchFixtureChannels(
      fixture({ home: "Boca Juniors", away: "River Plate", tv: [] }),
      [
        channel("AR · DeporTV", "Argentina"),
        channel("AR · ESPN Premium (Argentina) HD", "Argentina"),
        channel("Cine", "Películas"),
        channel("US : FOX SPORTS 1", "USA"),
      ],
    );
    expect(match.inferred).toBe(true);
    expect(match.channels.map((item) => item.name)).toEqual([
      "AR · ESPN Premium (Argentina) HD",
      "AR · DeporTV",
    ]);
  });

  it("does not infer broadcasters for leagues outside Argentina", () => {
    const match = matchFixtureChannels(
      fixture({ home: "Zenit", away: "Rubin", tv: [], league: "Russian Premier League" }),
      [channel("AR · ESPN Premium (Argentina) HD", "Argentina")],
    );
    expect(match.inferred).toBe(false);
    expect(match.channels).toEqual([]);
  });

  it("does not mark a real TV match as inferred", () => {
    const match = matchFixtureChannels(fixture(), [channel("ESPN Premium")]);
    expect(match.inferred).toBe(false);
    expect(match.score).toBeGreaterThan(40);
  });
});
