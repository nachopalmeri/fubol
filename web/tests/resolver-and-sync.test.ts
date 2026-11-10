import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSync, setSync, syncKey } from "../src/lib/state/sync";
import { resolverStatus, setTorrentServerBase } from "../src/lib/vod/torrent";

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url?.startsWith("/settings")) {
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

afterAll(async () => {
  setTorrentServerBase(undefined);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("resolver status", () => {
  it("says it is not configured when there is no resolver", async () => {
    setTorrentServerBase(undefined);
    expect(await resolverStatus()).toEqual({ configured: false, reachable: false, url: null });
  });

  it("reports a resolver that does not answer", async () => {
    setTorrentServerBase("http://127.0.0.1:1");
    const status = await resolverStatus(1500);
    expect(status.configured).toBe(true);
    expect(status.reachable).toBe(false);
    expect(status.url).toBe("http://127.0.0.1:1");
  });

  it("reports a resolver that answers", async () => {
    setTorrentServerBase(base);
    const status = await resolverStatus();
    expect(status.reachable).toBe(true);
    expect(status.url).toBe(base);
  });
});

describe("shared subtitle alignment", () => {
  it("keeps the alignment per title and source", () => {
    expect(syncKey("tt0111161", "source-a")).not.toBe(syncKey("tt0111161", "source-b"));
    expect(syncKey("tt0111161", "source-a")).toBe("tt0111161:source-a");
  });

  it("serves the same measurement to every device", async () => {
    await setSync("tt0111161", "source-a", { offsetMs: -13500, confidence: 0.26, source: "audio" });
    const stored = await getSync("tt0111161", "source-a");
    expect(stored?.offsetMs).toBe(-13500);
    expect(stored?.confidence).toBe(0.26);
    expect(stored?.source).toBe("audio");
    // Another source of the same title is a different copy: no alignment.
    expect(await getSync("tt0111161", "source-b")).toBeNull();
  });
});
