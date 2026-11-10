import { beforeEach, describe, expect, it } from "vitest";
import {
  lockoutRemainingMs,
  noteAuthFailure,
  noteAuthSuccess,
  rateLimit,
  resetRateLimits,
} from "../src/lib/rate-limit";
import { looksLikePlaylist, detectGate } from "../src/lib/http";

beforeEach(() => {
  resetRateLimits();
});

/**
 * A flat ten-per-minute limit still allows about fourteen thousand password
 * guesses a day. That is tolerable on a LAN and not tolerable the moment the
 * app is reachable from outside, which is on the roadmap.
 */
describe("progressive auth lockout", () => {
  it("allows a few mistakes before locking", () => {
    const key = "admin:10.0.0.5";
    expect(lockoutRemainingMs(key)).toBe(0);
    expect(noteAuthFailure(key)).toBe(0);
    expect(noteAuthFailure(key)).toBe(0);
    expect(noteAuthFailure(key)).toBe(0);
    expect(lockoutRemainingMs(key)).toBe(0);
  });

  it("doubles the wait on each further failure", () => {
    const key = "admin:10.0.0.6";
    for (let i = 0; i < 3; i++) noteAuthFailure(key);
    const first = noteAuthFailure(key);
    const second = noteAuthFailure(key);
    const third = noteAuthFailure(key);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it("caps the wait so a locked account is not locked forever", () => {
    const key = "admin:10.0.0.7";
    for (let i = 0; i < 40; i++) noteAuthFailure(key);
    expect(noteAuthFailure(key)).toBeLessThanOrEqual(15 * 60_000);
  });

  it("clears the lockout once the right password arrives", () => {
    const key = "admin:10.0.0.8";
    for (let i = 0; i < 6; i++) noteAuthFailure(key);
    expect(lockoutRemainingMs(key)).toBeGreaterThan(0);
    noteAuthSuccess(key);
    expect(lockoutRemainingMs(key)).toBe(0);
  });

  it("keeps separate budgets per caller", () => {
    for (let i = 0; i < 6; i++) noteAuthFailure("admin:a");
    expect(lockoutRemainingMs("admin:a")).toBeGreaterThan(0);
    expect(lockoutRemainingMs("admin:b")).toBe(0);
  });

  it("still enforces the fixed window limiter", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("x", 3, 60_000)).toBe(true);
    expect(rateLimit("x", 3, 60_000)).toBe(false);
  });
});

describe("playlist sniffing tolerates a byte order mark", () => {
  it("accepts a playlist served with a UTF-8 BOM", () => {
    // trimStart does not remove U+FEFF, so these sources were rejected as
    // "not a valid HLS" while being perfectly playable.
    expect(looksLikePlaylist("﻿#EXTM3U\n#EXT-X-TARGETDURATION:6\n")).toBe(true);
    expect(looksLikePlaylist("﻿\n  #EXTM3U\n")).toBe(true);
  });

  it("still rejects an HTML page", () => {
    expect(looksLikePlaylist("<!doctype html><html><body>login</body></html>")).toBe(false);
  });

  it("does not treat a BOM-prefixed playlist as a gate", () => {
    expect(detectGate("﻿#EXTM3U\n#EXTINF:6,\nseg0.ts\n")).toBeNull();
  });

  it("still detects a login interstitial", () => {
    expect(detectGate("<!doctype html><html><body>Please sign in</body></html>")).not.toBeNull();
  });
});
