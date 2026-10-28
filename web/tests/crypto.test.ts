import { describe, expect, it } from "vitest";
import {
  hashPin,
  normalizeCode,
  randomCode,
  safeEqualStr,
  sanitizeUrl,
  shortHash,
  signToken,
  verifyPin,
  verifyToken,
} from "../src/lib/crypto";

describe("tokens", () => {
  it("round-trips a signed payload", () => {
    const token = signToken({ role: "admin" }, 60_000);
    const payload = verifyToken<{ role: string }>(token);
    expect(payload?.role).toBe("admin");
    expect(payload?.exp).toBeGreaterThan(Date.now());
  });

  it("rejects tampered payloads and signatures", () => {
    const token = signToken({ role: "link" }, 60_000);
    const [body, signature] = token.split(".");
    expect(verifyToken(`${body}x.${signature}`)).toBeNull();
    expect(verifyToken(`${body}.${signature?.slice(0, -2)}aa`)).toBeNull();
    expect(verifyToken("garbage")).toBeNull();
    expect(verifyToken(undefined)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = signToken({ role: "admin" }, -5_000);
    expect(verifyToken(token)).toBeNull();
  });
});

describe("codes and hashes", () => {
  it("creates unambiguous codes of the requested length", () => {
    const code = randomCode(8);
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]+$/);
  });

  it("normalizes user input", () => {
    expect(normalizeCode(" ab-cd 12 ")).toBe("ABCD12");
  });

  it("verifies PINs with scrypt and constant-time comparison", () => {
    const stored = hashPin("4821");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPin("4821", stored)).toBe(true);
    expect(verifyPin("0000", stored)).toBe(false);
    expect(verifyPin("4821", null)).toBe(false);
    expect(verifyPin("4821", "plain$abc$def")).toBe(false);
  });

  it("compares strings safely", () => {
    expect(safeEqualStr("abc", "abc")).toBe(true);
    expect(safeEqualStr("abc", "abd")).toBe(false);
    expect(safeEqualStr("abc", "abcd")).toBe(false);
  });

  it("hashes deterministically", () => {
    expect(shortHash("hello", 8)).toBe(shortHash("hello", 8));
    expect(shortHash("hello", 8)).toHaveLength(8);
    expect(shortHash("hello", 8)).not.toBe(shortHash("hellO", 8));
  });
});

describe("sanitizeUrl", () => {
  it("removes credentials and query strings", () => {
    expect(sanitizeUrl("https://user:pass@example.com/live/index.m3u8?token=secret")).toBe(
      "https://example.com/live/index.m3u8",
    );
  });

  it("never throws on invalid input", () => {
    expect(sanitizeUrl("not a url")).toBe("[invalid-url]");
  });
});
