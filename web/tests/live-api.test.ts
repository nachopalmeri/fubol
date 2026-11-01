import { describe, expect, it, vi } from "vitest";
import { requireSession } from "@/lib/api";
import { AddonSetupRequired } from "@/lib/addons";
import { buildLiveSession } from "@/lib/live/session";
import { GET } from "@/app/api/live/session/route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireSession: vi.fn() }));
vi.mock("@/lib/live/session", () => ({ buildLiveSession: vi.fn() }));

describe("provider setup state on the live session API", () => {
  it("returns409 with an action URL for the administrator", async () => {
    vi.mocked(requireSession).mockResolvedValue({ role: "admin" });
    vi.mocked(buildLiveSession).mockRejectedValue(new AddonSetupRequired("https://sports.highfly.to/configure"));
    const response = await GET(new Request("http://localhost/api/live/session?channel=test"), undefined);
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.code).toBe("source_setup_required");
    expect(data.configureUrl).toBe("https://sports.highfly.to/configure");
  });
  it("does not expose provider setup details to a family member", async () => {
    vi.mocked(requireSession).mockResolvedValue({ role: "link", code: "fixture", linkId: 1, label: "Family", permissions: ["live"] });
    vi.mocked(buildLiveSession).mockRejectedValue(new AddonSetupRequired("https://sports.highfly.to/configure"));
    const response = await GET(new Request("http://localhost/api/live/session?channel=test"), undefined);
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.configureUrl).toBeUndefined();
    expect(data.error).not.toContain("highfly");
  });
});
