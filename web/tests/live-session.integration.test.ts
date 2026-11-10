import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildLiveSession } from "../src/lib/live/session";
import { getAllChannels, upsertLiveSource } from "../src/lib/live/sources";

const previousAllowPrivate = process.env.FUBOL_ALLOW_PRIVATE_SOURCES;
let server: http.Server;
let base: string;

beforeAll(async () => {
  process.env.FUBOL_ALLOW_PRIVATE_SOURCES = "1";
  server = http.createServer((request, response) => {
    if (request.url === "/valid.m3u8") {
      response.setHeader("content-type", "application/vnd.apple.mpegurl");
      response.end("#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n");
    } else if (request.url === "/unavailable") {
      response.writeHead(503).end("Unavailable");
    } else {
      response.setHeader("content-type", "text/html");
      response.end("<!doctype html><html><body>Not a video</body></html>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (previousAllowPrivate === undefined) delete process.env.FUBOL_ALLOW_PRIVATE_SOURCES;
  else process.env.FUBOL_ALLOW_PRIVATE_SOURCES = previousAllowPrivate;
});

async function sessionFor(path: string) {
  const source = await upsertLiveSource({ kind: "hls", name: `Fixture ${path}`, url: `${base}${path}` });
  const channel = (await getAllChannels()).find((item) => item.sourceId === source.id);
  if (!channel) throw new Error("Fixture channel missing");
  return buildLiveSession(channel.id);
}

describe("live session source validation", () => {
  it.each(["/html", "/fake.m3u8", "/unavailable"])("never offers rejected %s as playable HLS", async (path) => {
    const session = await sessionFor(path);
    expect(session.failed).toBeGreaterThan(0);
    expect(session.sources).toEqual([]);
    // The note must exist and must not be the bare "nothing responded" the
    // screen used to show: in practice the addon answers an unavailable match
    // with a placeholder page, and the viewer needs to know which it was.
    expect(session.notes.length).toBeGreaterThan(0);
    expect(session.notes.join(" ")).not.toBe("Ninguna fuente respondió");
  });

  it("says a web page is an agenda entry, not a signal", async () => {
    const session = await sessionFor("/html");
    expect(session.notes.join(" ")).toMatch(/página web|no son video|agenda/i);
  });

  it("suggests retrying when the origin merely failed to answer", async () => {
    const session = await sessionFor("/unavailable");
    expect(session.notes.join(" ")).toMatch(/Reanalizar|momentáneo|no respondieron/i);
  });

  it("keeps verified HLS available", async () => {
    const session = await sessionFor("/valid.m3u8");
    expect(session.sources).toHaveLength(1);
    expect(session.sources[0]).toMatchObject({ kind: "hls", proxied: true });
  });
  it("routes a relay-enabled source through the local compatibility relay", async () => {
    const source = await upsertLiveSource({
      id: "relay-session-test",
      kind: "hls",
      name: "Relay source",
      url: `${base}/valid.m3u8`,
      config: { relay: true, relayHeight: 720, group: "Argentina" },
    });
    const channel = (await getAllChannels()).find((item) => item.sourceId === source.id);
    expect(channel?.group).toBe("Argentina");
    const session = await buildLiveSession(channel!.id);
    expect(session.sources).toHaveLength(1);
    expect(session.sources[0]?.url).toMatch(/^\/api\/relay\//);
    expect(session.sources[0]?.label).toContain("relay");
    expect(session.sources[0]?.note).toContain("Re-encode");
  });
  it("invalidates cached channel data immediately when a source is edited", async () => {
    await upsertLiveSource({ id: "cache-revision-test", kind: "hls", name: "Old source", url: `${base}/html` });
    const old = (await getAllChannels()).find((channel) => channel.sourceId === "cache-revision-test");
    expect(old?.name).toBe("Old source");
    await upsertLiveSource({ id: "cache-revision-test", kind: "hls", name: "Updated source", url: `${base}/valid.m3u8` });
    const updated = (await getAllChannels()).find((channel) => channel.sourceId === "cache-revision-test");
    expect(updated?.name).toBe("Updated source");
    expect(updated?.urls).toEqual([`${base}/valid.m3u8`]);
  });
});
