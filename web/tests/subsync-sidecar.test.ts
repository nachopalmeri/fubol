import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setSetting } from "../src/lib/state/settings";
import { SUBSYNC_TOKEN_KEY, SUBSYNC_URL_KEY, subsyncStatus, subsyncTarget } from "../src/lib/subs/sidecar";

/**
 * The audio-alignment sidecar sits behind a tunnel whose address changes on
 * every restart. The address used to come from an environment variable, which
 * kept pointing at a tunnel that no longer existed.
 */

let server: http.Server;
let base: string;
const previousUrl = process.env.SUBSYNC_URL;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await setSetting(SUBSYNC_URL_KEY, null);
  await setSetting(SUBSYNC_TOKEN_KEY, null);
  if (previousUrl === undefined) delete process.env.SUBSYNC_URL;
  else process.env.SUBSYNC_URL = previousUrl;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("subsync sidecar address", () => {
  it("says it is not configured when nothing points at it", async () => {
    delete process.env.SUBSYNC_URL;
    expect(await subsyncTarget()).toBeNull();
    expect(await subsyncStatus()).toEqual({ configured: false, reachable: false, url: null });
  });

  it("falls back to the environment for a fixed deployment", async () => {
    process.env.SUBSYNC_URL = `${base}/`;
    expect(await subsyncTarget()).toEqual({ base, token: null });
    expect(await subsyncStatus()).toEqual({ configured: true, reachable: true, url: base });
  });

  it("prefers the published address over a stale environment variable", async () => {
    process.env.SUBSYNC_URL = "http://127.0.0.1:1";
    await setSetting(SUBSYNC_URL_KEY, base);
    await setSetting(SUBSYNC_TOKEN_KEY, "a-token-with-enough-length");
    expect(await subsyncTarget()).toEqual({ base, token: "a-token-with-enough-length" });
    expect((await subsyncStatus()).reachable).toBe(true);
  });

  it("reports a sidecar that does not answer", async () => {
    delete process.env.SUBSYNC_URL;
    await setSetting(SUBSYNC_URL_KEY, "http://127.0.0.1:1");
    const status = await subsyncStatus(1500);
    expect(status).toEqual({ configured: true, reachable: false, url: "http://127.0.0.1:1" });
  });
});
