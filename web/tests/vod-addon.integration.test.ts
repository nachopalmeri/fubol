import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addAddon, listAddonRows } from "../src/lib/vod/store";
import { getVodStreams } from "../src/lib/vod/service";

const previousAllowPrivate = process.env.FUBOL_ALLOW_PRIVATE_SOURCES;
let server: http.Server;
let manifestUrl: string;

beforeAll(async () => {
  process.env.FUBOL_ALLOW_PRIVATE_SOURCES = "1";
  server = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/manifest.json") {
      response.end(
        JSON.stringify({
          id: "org.fubol.fixture",
          version: "1.0.0",
          name: "Fubol test fixture",
          types: ["movie"],
          resources: ["stream"],
        }),
      );
      return;
    }
    if (request.url === "/stream/movie/tt-fixture.json") {
      response.end(
        JSON.stringify({
          streams: [
            {
              url: "https://media.example.test/fixture-1080.mp4",
              name: "1080p",
              title: "Fixture legal 1080p",
            },
            { infoHash: "0123456789abcdef0123456789abcdef01234567", title: "P2P sin URL" },
          ],
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  manifestUrl = `http://127.0.0.1:${address.port}/manifest.json`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (previousAllowPrivate === undefined) delete process.env.FUBOL_ALLOW_PRIVATE_SOURCES;
  else process.env.FUBOL_ALLOW_PRIVATE_SOURCES = previousAllowPrivate;
});

describe("VOD addon integration", () => {
  it("validates a local manifest and returns playable direct streams", async () => {
    const addon = await addAddon({ url: manifestUrl, kind: "vod" });
    expect(addon.name).toBe("Fubol test fixture");
    expect(listAddonRows("vod").some((row) => row.id === addon.id && row.enabled)).toBe(true);

    const result = await getVodStreams("movie", "tt-fixture");
    expect(result.addonsTried).toBeGreaterThanOrEqual(1);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      addonName: "Fubol test fixture",
      title: "Fixture legal 1080p",
      quality: "1080p",
      url: "https://media.example.test/fixture-1080.mp4",
    });
  });
});
