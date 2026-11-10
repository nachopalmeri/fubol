import { describe, expect, it } from "vitest";
import {
  fixturesFromChannels,
  groupIsFootball,
  nameLooksLikeOtherSport,
  mergeChannelFixtures,
  type Fixture,
} from "../src/lib/live/fixtures";
import type { Channel } from "../src/lib/live/types";

function channel(name: string, group = "Football"): Channel {
  return {
    id: `id-${name}`,
    name,
    group,
    sourceId: "sports",
    sourceName: "Sports Streams · Fútbol",
    kind: "addon",
    urls: [],
  };
}

/**
 * The live catalog listed twenty-one playable matches while the agenda, built
 * only from the schedule provider, showed three. The home screen said "no hay
 * partidos en curso" next to a column of matches being played.
 */
describe("agenda derived from playable channels", () => {
  it("turns match-shaped channel names into agenda entries", () => {
    const fixtures = fixturesFromChannels([
      channel("Getafe vs Sevilla"),
      channel("Lazio vs Cagliari"),
      channel("Trabzonspor vs Gaziantep"),
    ]);
    expect(fixtures).toHaveLength(3);
    expect(fixtures[0]?.home).toBe("Getafe");
    expect(fixtures[0]?.away).toBe("Sevilla");
    expect(fixtures[0]?.status).toBe("live");
    expect(fixtures[0]?.source).toBe("channel");
  });

  it("strips provider and quality decorations from the name", () => {
    const [fixture] = fixturesFromChannels([channel("(FHD) : Eldense vs Granada")]);
    expect(fixture?.home).toBe("Eldense");
    expect(fixture?.away).toBe("Granada");
  });

  it("keeps other sports out of a football agenda", () => {
    // A generic "Live Now" catalog mixes NFL, NBA, NHL and rugby into the same
    // list. Those entries stay reachable in the channel browser.
    const fixtures = fixturesFromChannels([
      channel("Buffalo Bills vs Baltimore Ravens", "Live Now"),
      channel("Orlando Magic vs Boston Celtics", "Live Now"),
      channel("Washington Capitals vs Minnesota Wild", "Live Now"),
      channel("Section Paloise vs Stade Toulousain", "Live Now"),
      channel("Juventus vs Napoli", "Football"),
    ]);
    expect(fixtures.map((fixture) => fixture.title)).toEqual(["Juventus vs Napoli"]);
  });

  it("still keeps football that sits in a mixed catalog", () => {
    // Restricting to football-named groups alone dropped real matches:
    // Juventus vs Napoli and Athletic Bilbao vs Real Sociedad were both
    // listed under "Live Now" beside the NFL.
    const fixtures = fixturesFromChannels([
      channel("Juventus vs Napoli", "Live Now"),
      channel("Athletic Bilbao vs Real Sociedad", "Live Now"),
      channel("Dallas Cowboys vs Arizona Cardinals", "Live Now"),
    ]);
    expect(fixtures.map((fixture) => fixture.title)).toEqual([
      "Juventus vs Napoli",
      "Athletic Bilbao vs Real Sociedad",
    ]);
  });

  it("does not mistake MLS clubs for another sport", () => {
    const fixtures = fixturesFromChannels([
      channel("Vancouver Whitecaps vs Seattle Sounders", "Live Now"),
      channel("Atlanta United vs Toronto FC", "Live Now"),
    ]);
    expect(fixtures).toHaveLength(2);
  });

  it("flags other-sport franchises by name", () => {
    expect(nameLooksLikeOtherSport("Detroit Lions vs Minnesota Vikings")).toBe(true);
    expect(nameLooksLikeOtherSport("Indiana Pacers vs Brooklyn Nets")).toBe(true);
    expect(nameLooksLikeOtherSport("Philadelphia Flyers vs Utah Mammoth")).toBe(true);
    expect(nameLooksLikeOtherSport("Getafe vs Sevilla")).toBe(false);
    expect(nameLooksLikeOtherSport("Newell's Old Boys vs Unión")).toBe(false);
  });

  it("accepts the football group under several spellings", () => {
    expect(groupIsFootball("Football")).toBe(true);
    expect(groupIsFootball("Fútbol")).toBe(true);
    expect(groupIsFootball("Soccer")).toBe(true);
    expect(groupIsFootball("Liga Profesional")).toBe(true);
    expect(groupIsFootball("Live Now")).toBe(false);
    expect(groupIsFootball("NFL")).toBe(false);
    expect(groupIsFootball(undefined)).toBe(false);
  });

  it("ignores stations, which are channels and not matches", () => {
    const fixtures = fixturesFromChannels([
      channel("(FHD) : SKY SPORTS PREMIER LEAGUE", "Live Now"),
      channel("US : FOX SPORTS 1", "Live Now"),
      channel("AR · ESPN Premium (Argentina) HD", "Argentina"),
      channel("Demo técnica · Big Buck Bunny (no es TV)", "Canales"),
    ]);
    expect(fixtures).toEqual([]);
  });

  it("drops duplicates of the same match from several channels", () => {
    const fixtures = fixturesFromChannels([
      channel("Getafe vs Sevilla"),
      channel("Getafe vs Sevilla"),
      channel("(FHD) : Getafe vs Sevilla"),
    ]);
    expect(fixtures).toHaveLength(1);
  });

  it("keeps the scheduled entry when both sources know the same match", () => {
    const scheduled: Fixture = {
      id: "tsdb:1",
      title: "Boca Juniors vs River Plate",
      home: "Boca Juniors",
      away: "River Plate",
      league: "Argentinian Primera Division",
      kickoff: Date.now() + 30 * 60_000,
      status: "scheduled",
      source: "thesportsdb",
    };
    const merged = mergeChannelFixtures([scheduled], [channel("Boca Juniors vs River Plate")]);
    expect(merged).toHaveLength(1);
    // The schedule entry knows the real kickoff; the channel one does not.
    expect(merged[0]?.source).toBe("thesportsdb");
    expect(merged[0]?.kickoff).toBe(scheduled.kickoff);
  });

  it("adds a playable match the schedule provider never returned", () => {
    const scheduled: Fixture = {
      id: "tsdb:1",
      title: "Belgrano vs Barracas Central",
      home: "Belgrano",
      away: "Barracas Central",
      league: "Argentinian Primera Division",
      kickoff: Date.now() + 8 * 3600_000,
      status: "scheduled",
      source: "thesportsdb",
    };
    // The free key returned three Argentine matches for a whole Sunday of
    // world football while La Liga and Serie A were being played.
    const merged = mergeChannelFixtures([scheduled], [
      channel("Getafe vs Sevilla"),
      channel("Lazio vs Cagliari"),
    ]);
    expect(merged).toHaveLength(3);
    expect(merged.filter((fixture) => fixture.status === "live")).toHaveLength(2);
  });

  it("leaves the agenda untouched when there are no channels", () => {
    const fixtures: Fixture[] = [];
    expect(mergeChannelFixtures(fixtures, [])).toBe(fixtures);
  });
});
