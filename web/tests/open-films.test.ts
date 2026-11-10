import { describe, expect, it } from "vitest";
import { OPEN_FILM_SEEDS, parseOpenFilm, type ArchiveMetadata } from "../src/lib/vod/open-films";

const seed = OPEN_FILM_SEEDS[0]!;
const metadata: ArchiveMetadata = {
  metadata: { mediatype: "movies", licenseurl: "http://creativecommons.org/licenses/publicdomain/" },
  files: [
    { name: "Night.mp4", format: "h.264", size: "596399542", length: "5731.83", width: "640", height: "480" },
    { name: "Night.asr.srt", format: "SubRip", size: "52611" },
  ],
};

describe("curated open-film metadata", () => {
  it("pairs only the exact seeded video and ASR caption asset", () => {
    const film = parseOpenFilm(seed, metadata);
    expect(film?.meta.id).toBe("tt0063350");
    expect(film?.sources[0]?.url).toBe("https://archive.org/download/night_of_the_living_dead_dvd/Night.mp4");
    expect(film?.captions[0]?.url).toContain("/Night.asr.srt");
    expect(film?.captions[0]?.addonName).toContain("ASR");
  });
  it("fails closed if the rights metadata is missing or is not the accepted source statement", () => {
    expect(parseOpenFilm(seed, { ...metadata, metadata: { mediatype: "movies" } })).toBeNull();
    expect(parseOpenFilm(seed, { ...metadata, metadata: { mediatype: "movies", licenseurl: "https://example.test/anything" } })).toBeNull();
  });
  it("accepts the CC public-domain deeds Archive actually publishes", () => {
    const file = metadata.files![0]!;
    for (const licenseurl of [
      "http://creativecommons.org/publicdomain/zero/1.0/",
      "http://creativecommons.org/publicdomain/mark/1.0/",
      "https://creativecommons.org/licenses/publicdomain/",
    ]) {
      const film = parseOpenFilm(seed, { metadata: { mediatype: "movies", licenseurl }, files: [file] });
      expect(film?.sources[0]?.url).toBe("https://archive.org/download/night_of_the_living_dead_dvd/Night.mp4");
    }
  });
  it("does not substitute an unrelated encode or a short clip for a feature", () => {
    expect(parseOpenFilm(seed, { ...metadata, files: [{ ...metadata.files![0], name: "Other.mp4" }] })).toBeNull();
    expect(parseOpenFilm(seed, { ...metadata, files: [{ ...metadata.files![0], length: "90" }] })).toBeNull();
  });
  it("never claims a missing caption file exists", () => {
    expect(parseOpenFilm(seed, { ...metadata, files: [metadata.files![0]!] })?.captions).toEqual([]);
  });
});
