import { afterEach, describe, expect, it } from "vitest";
import { verifyPin } from "../src/lib/crypto";
import { baseUrl } from "../src/lib/auth";
import {
  createShareLink,
  getShareLink,
  linkIsActive,
  listShareLinks,
  revokeShareLink,
  touchShareLink,
} from "../src/lib/links";

describe("share links", () => {
  it("creates a link with permissions, expiry and PIN", async () => {
    const link = await createShareLink({
      label: "Familia test",
      permissions: ["live"],
      expiresInDays: 2,
      pin: "4821",
    });
    expect(link.code).toHaveLength(8);
    expect(link.permissions).toEqual(["live"]);
    expect(link.expiresAt).toBeGreaterThan(Date.now());

    const stored = await getShareLink(link.code.toLowerCase());
    expect(stored?.label).toBe("Familia test");
    expect(stored?.permissions).toEqual(["live"]);
    expect(stored?.expiresAt).toBe(link.expiresAt);
    expect(verifyPin("4821", stored?.pinHash ?? null)).toBe(true);
    expect(linkIsActive(stored!)).toBe(true);
  });

  it("defaults to both permissions and no expiry", async () => {
    const link = await createShareLink({ label: "", permissions: [] });
    const stored = await getShareLink(link.code);
    expect(stored?.label).toBe("Familia");
    expect(stored?.permissions).toEqual(["live", "vod"]);
    expect(stored?.expiresAt).toBeNull();
    expect(stored?.pinHash).toBeNull();
  });

  it("lists newest first", async () => {
    const before = (await listShareLinks()).length;
    await createShareLink({ label: "Listado", permissions: ["vod"] });
    expect((await listShareLinks()).length).toBe(before + 1);
    expect((await listShareLinks())[0]?.label).toBe("Listado");
  });

  it("touches and revokes a link immediately", async () => {
    const link = await createShareLink({ label: "Revocable", permissions: ["live", "vod"] });
    await touchShareLink(link.code);
    expect((await getShareLink(link.code))?.lastSeenAt).not.toBeNull();

    expect(await revokeShareLink(link.id)).toBe(true);
    expect(await revokeShareLink(link.id)).toBe(false);
    const revoked = await getShareLink(link.code);
    expect(revoked?.revokedAt).not.toBeNull();
    expect(linkIsActive(revoked!)).toBe(false);
  });

  it("returns undefined for unknown or empty codes", async () => {
    expect(await getShareLink("ZZZZZZZZ")).toBeUndefined();
    expect(await getShareLink("")).toBeUndefined();
  });
});

describe("baseUrl", () => {
  afterEach(() => {
    delete process.env.FUBOL_BASE_URL;
    delete process.env.FUBOL_TRUST_PROXY;
  });

  it("uses the Host header instead of the container bind address", () => {
    const request = new Request("http://0.0.0.0:3001/f/abcd1234", {
      headers: { host: "192.168.0.122:3001" },
    });
    expect(baseUrl(request)).toBe("http://192.168.0.122:3001");
  });

  it("prefers a forwarded host when a trusted proxy terminates the connection", () => {
    process.env.FUBOL_TRUST_PROXY = "1";
    const request = new Request("http://0.0.0.0:3001/", {
      headers: {
        host: "192.168.0.122:3001",
        "x-forwarded-host": "fubol.example.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(baseUrl(request)).toBe("https://fubol.example.com");
  });

  it("ignores a forwarded host when no proxy is trusted", () => {
    // Port 3001 is published directly, so any LAN client can set this header.
    // Believing it turned every redirect built from baseUrl into an open
    // redirect to a host of the caller's choosing.
    const request = new Request("http://0.0.0.0:3001/f/abcd1234", {
      headers: {
        host: "192.168.0.122:3001",
        "x-forwarded-host": "atacante.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(baseUrl(request)).toBe("http://192.168.0.122:3001");
  });

  it("lets an explicitly configured base URL win", () => {
    process.env.FUBOL_BASE_URL = "https://fubol.example.com/";
    const request = new Request("http://0.0.0.0:3001/", { headers: { host: "10.0.0.5:3001" } });
    expect(baseUrl(request)).toBe("https://fubol.example.com");
  });
});
