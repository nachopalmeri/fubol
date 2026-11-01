import { describe, expect, it } from "vitest";
import { AddonSetupRequired, usableAddonStreams } from "../src/lib/addons";

describe("provider notices are not playable streams", () => {
  const notice = { name: "Please reinstall the addon", title: "Get a new addon link", url: "https://sports.highfly.to/configure?private=hidden", behaviorHints: { notWebReady: true } };
  it("reports a setup requirement with a credential-free configure origin/path", () => {
    try {
      usableAddonStreams([notice]);
      throw new Error("Expected setup error");
    } catch (error) {
      expect(error).toBeInstanceOf(AddonSetupRequired);
      expect((error as AddonSetupRequired).status).toBe(409);
      expect((error as AddonSetupRequired).configureUrl).toBe("https://sports.highfly.to/configure");
      expect((error as Error).message).not.toContain("private");
    }
  });
  it("keeps real media when an addon appends an installation notice", () => {
    const media = { name: "HD", url: "https://media.example.test/live.m3u8" };
    expect(usableAddonStreams([notice, media])).toEqual([media]);
  });
  it("does not turn arbitrary external URLs into trusted setup links", () => {
    expect(() => usableAddonStreams([{ ...notice, url: "javascript:alert(1)" }])).toThrow(AddonSetupRequired);
    try { usableAddonStreams([{ ...notice, url: "javascript:alert(1)" }]); } catch (error) {
      expect((error as AddonSetupRequired).configureUrl).toBeNull();
    }
  });
  it("leaves ordinary empty responses empty", () => {
    expect(usableAddonStreams([])).toEqual([]);
  });
  it.each(["https://untrusted.example/configure", "https://sports.highfly.to/private-token/configure"])("never offers an untrusted setup destination: %s", (url) => {
    expect(() => usableAddonStreams([{ ...notice, url }])).toThrow(AddonSetupRequired);
    try { usableAddonStreams([{ ...notice, url }]); } catch (error) {
      expect((error as AddonSetupRequired).configureUrl).toBeNull();
      expect((error as Error).message).not.toContain(url);
    }
  });
});
