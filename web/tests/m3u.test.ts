import { describe, expect, it } from "vitest";
import { entriesToChannels, m3uChannelId, parseAttributes, parseM3u } from "../src/lib/live/m3u";

const PLAYLIST = `#EXTM3U
#EXTINF:-1 tvg-id="ESPN.ar" tvg-logo="https://logo.example/espn.png" group-title="Deportes, Fútbol",ESPN Premium HD
https://iptv.example/espn/index.m3u8
#EXTINF:-1 group-title="Cine",Película uno
#EXTVLCOPT:http-user-agent=FubolTest/1.0
#EXTVLCOPT:http-referrer=https://site.example/
https://iptv.example/movie.mp4
#EXTINF:-1,DRM channel
#KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha
https://iptv.example/drm/index.m3u8
#EXTINF:-1 group-title="Cine",Película uno (duplicado)
https://iptv.example/movie.mp4
`;

describe("parseM3u", () => {
  const entries = parseM3u(PLAYLIST);

  it("parses attributes and names with commas", () => {
    expect(entries).toHaveLength(4);
    const first = entries[0];
    expect(first?.name).toBe("ESPN Premium HD");
    expect(first?.group).toBe("Deportes, Fútbol");
    expect(first?.tvgId).toBe("ESPN.ar");
    expect(first?.logo).toBe("https://logo.example/espn.png");
    expect(first?.url).toBe("https://iptv.example/espn/index.m3u8");
  });

  it("maps EXTVLCOPT to request headers", () => {
    const second = entries[1];
    expect(second?.name).toBe("Película uno");
    expect(second?.headers).toEqual({
      "user-agent": "FubolTest/1.0",
      referer: "https://site.example/",
    });
  });

  it("flags DRM entries", () => {
    const drm = entries[2];
    expect(drm?.drm).toBe(true);
  });

  it("parses quoted and bare attributes", () => {
    expect(parseAttributes('a="one two" b=three c="x, y"')).toEqual({
      a: "one two",
      b: "three",
      c: "x, y",
    });
  });
});

describe("entriesToChannels", () => {
  const channels = entriesToChannels(parseM3u(PLAYLIST), { id: "src", name: "Casa" });

  it("drops DRM and duplicate URLs", () => {
    expect(channels).toHaveLength(2);
    expect(channels.every((channel) => channel.kind === "m3u")).toBe(true);
    expect(channels.some((channel) => channel.name.includes("DRM"))).toBe(false);
  });

  it("keeps source metadata and headers", () => {
    const movie = channels.find((channel) => channel.name.startsWith("Película"));
    expect(movie?.sourceId).toBe("src");
    expect(movie?.sourceName).toBe("Casa");
    expect(movie?.headers?.["user-agent"]).toBe("FubolTest/1.0");
  });

  it("builds stable ids", () => {
    const entry = parseM3u(PLAYLIST)[0];
    if (!entry) throw new Error("missing entry");
    const first = m3uChannelId("src", entry);
    const second = m3uChannelId("src", entry);
    expect(first).toBe(second);
    expect(first).toHaveLength(16);
    expect(first).not.toBe(m3uChannelId("other", entry));
  });
});
