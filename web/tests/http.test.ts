import { describe, expect, it, vi } from "vitest";
import {
  assertSafeUrl,
  fetchUpstream,
  detectGate,
  looksLikePlaylist,
  mapLimit,
  readTextLimited,
  UpstreamError,
  withTimeout,
} from "../src/lib/http";

describe("SSRF guard", () => {
  it("checks redirect targets before making a request to a private host", async () => {
    const fake = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
    vi.stubGlobal("fetch", fake);
    try {
      await expect(fetchUpstream("https://1.1.1.1/start")).rejects.toThrow("privado");
      expect(fake).toHaveBeenCalledTimes(1);
      expect(fake.mock.calls[0]?.[1]?.redirect).toBe("manual");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("rejects non-http protocols and invalid URLs", async () => {
    await expect(assertSafeUrl("ftp://example.com/a")).rejects.toThrow("http/https");
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow("http/https");
    await expect(assertSafeUrl("not a url")).rejects.toThrow("URL inválida");
  });

  it("blocks loopback, private, link-local and IPv6 ranges", async () => {
    const blocked = [
      "http://127.0.0.1/a",
      "http://localhost/a",
      "http://10.0.0.1/a",
      "http://172.16.4.2/a",
      "http://192.168.1.20/a",
      "http://169.254.169.254/latest/meta-data",
      "http://100.64.0.1/a",
      "http://[::1]/a",
      "http://[fd00::1]/a",
    ];
    for (const url of blocked) {
      await expect(assertSafeUrl(url), url).rejects.toBeInstanceOf(UpstreamError);
    }
  });

  it("allows public addresses without DNS", async () => {
    const url = await assertSafeUrl("https://1.1.1.1/live.m3u8");
    expect(url.hostname).toBe("1.1.1.1");
  });

  it("honors the LAN opt-in", async () => {
    const previous = process.env.FUBOL_ALLOW_PRIVATE_SOURCES;
    process.env.FUBOL_ALLOW_PRIVATE_SOURCES = "1";
    try {
      const url = await assertSafeUrl("http://192.168.1.20/live.m3u8");
      expect(url.hostname).toBe("192.168.1.20");
    } finally {
      if (previous === undefined) delete process.env.FUBOL_ALLOW_PRIVATE_SOURCES;
      else process.env.FUBOL_ALLOW_PRIVATE_SOURCES = previous;
    }
  });
});

describe("gate detection", () => {
  it("accepts playlists", () => {
    expect(detectGate("#EXTM3U\n#EXTINF:6,\nseg.ts")).toBeNull();
    expect(looksLikePlaylist("  #EXTM3U\n")).toBe(true);
    expect(looksLikePlaylist("<html></html>")).toBe(false);
  });

  it("detects captcha, login, DRM and HTML interstitials", () => {
    expect(detectGate("<html>Just a moment... captcha</html>")).toBe("captcha");
    expect(detectGate("<html>Iniciar sesión</html>")).toBe("login");
    expect(detectGate("Widevine license required")).toBe("drm");
    expect(detectGate("<!doctype html><title>Hola</title>")).toBe("html");
    expect(detectGate("texto plano")).toBeNull();
  });
});

describe("small async helpers", () => {
  it("reads a response up to the byte cap", async () => {
    const text = await readTextLimited(new Response("abcdefgh"), 4);
    expect(text).toBe("abcd");
  });

  it("times out with an upstream error", async () => {
    await expect(withTimeout(new Promise((resolve) => setTimeout(resolve, 50)), 10, "lento")).rejects.toThrow(
      "lento",
    );
  });

  it("preserves order and caps concurrency", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, index) => index);
    const results = await mapLimit(items, 3, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item * 2;
    });
    expect(results).toEqual(items.map((item) => item * 2));
    expect(peak).toBeLessThanOrEqual(3);
  });
});
