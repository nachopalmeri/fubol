import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSession } from "@/lib/auth";
import { GET as stream } from "@/app/api/stream/route";
import { GET as subtitles } from "@/app/api/subtitles/proxy/route";
import { signStreamUrl, signSubtitleUrl } from "@/lib/stream-token";

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/http", async (original) => ({
  ...await original<typeof import("@/lib/http")>(),
  fetchUpstream: vi.fn(async () => ({ res: new Response("test media", { headers: { "content-type": "video/mp4" } }), finalUrl: "https://media.example.test/file.mp4", ms: 1 })),
}));

beforeEach(() => vi.mocked(getSession).mockReset());

describe("media requires a current family session, not just a signed URL", () => {
  it("rejects an unauthenticated or revoked session even with a valid video token", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const response = await stream(new Request(`http://localhost${signStreamUrl("https://media.example.test/file.mp4", { kind: "vod" })}`));
    expect(response.status).toBe(401);
  });
  it("rejects VOD tokens for live-only family links", async () => {
    vi.mocked(getSession).mockResolvedValue({ role: "link", code: "test", linkId: 1, label: "Test", permissions: ["live"] });
    const response = await stream(new Request(`http://localhost${signStreamUrl("https://media.example.test/file.mp4", { kind: "vod" })}`));
    expect(response.status).toBe(403);
  });
  it("allows current matching permissions without public proxy caching", async () => {
    vi.mocked(getSession).mockResolvedValue({ role: "link", code: "test", linkId: 1, label: "Test", permissions: ["vod"] });
    const response = await stream(new Request(`http://localhost${signStreamUrl("https://media.example.test/file.mp4", { kind: "vod" })}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("protects subtitle downloads after session revocation", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const response = await subtitles(new Request(`http://localhost${signSubtitleUrl("https://subs.example.test/file.srt")}`));
    expect(response.status).toBe(401);
  });
});
