import { describe, expect, it, vi } from "vitest";
import { createDrill } from "./clotho-oidc-drill.js";

const endpoint =
  "https://desirable-vitality-production-eb95.up.railway.app/mcp";
const start = 1_800_000_000_000;
// Deliberately unsigned fixture: only the deployed server can authenticate it.
const token = `fixture.${Buffer.from(JSON.stringify({ exp: start / 1000 + 3600 })).toString("base64url")}.unsigned`;
const enabled = () => Response.json({ resource: endpoint });
const disabled = () =>
  Response.json({ error: "oauth_not_configured" }, { status: 503 });
const success = () =>
  Response.json({
    result: {
      structuredContent: {
        result: {
          world: { id: "01995c2a-7b00-7000-8000-000000000101" },
          publication: { currentRevision: 17 }
        }
      }
    }
  });
function mockFetch(responses: Response[]) {
  return vi.fn<typeof fetch>(async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  });
}

describe("OAuth emergency drill evidence", () => {
  it("requires normal, denied and restored reads using the exact same token", async () => {
    const request = mockFetch([
      enabled(),
      success(),
      disabled(),
      Response.json({ error: "unauthorized" }, { status: 401 }),
      enabled(),
      success()
    ]);
    const drill = createDrill(token, request, () => start);
    await expect(drill.probe("blocked")).rejects.toThrow("out of order");
    expect(request).not.toHaveBeenCalled();
    expect((await drill.probe("baseline")).complete).toBe(false);
    expect((await drill.probe("blocked")).restoration_required).toBe(true);
    expect((await drill.probe("restored")).complete).toBe(true);
    const calls = request.mock.calls.filter(
      ([, init]) => init?.method === "POST"
    );
    expect(calls).toHaveLength(3);
    for (const [url, init] of calls) {
      expect(url).toBe(endpoint);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${token}`
      );
      expect(JSON.parse(String(init?.body)).params.name).toBe("world_get");
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it("does not mistake token expiry for emergency denial", async () => {
    let time = start;
    const request = mockFetch([enabled(), success()]);
    const drill = createDrill(token, request, () => time);
    await drill.probe("baseline");
    time += 3_500_000;
    await expect(drill.probe("blocked")).rejects.toThrow("lifetime");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("rejects an application error inside HTTP 200", async () => {
    const request = mockFetch([
      enabled(),
      Response.json({ result: { isError: true } })
    ]);
    await expect(
      createDrill(token, request, () => start).probe("baseline")
    ).rejects.toThrow("not confirmed");
  });
  it("does not count metadata shutdown without an actual HTTP denial", async () => {
    const request = mockFetch([enabled(), success(), disabled(), success()]);
    const drill = createDrill(token, request, () => start);
    await drill.probe("baseline");
    await expect(drill.probe("blocked")).rejects.toThrow("Expected HTTP 401");
    await expect(drill.probe("restored")).rejects.toThrow("out of order");
  });
  it("redacts transport errors and response bodies", async () => {
    const request = vi.fn<typeof fetch>(async () => {
      throw new Error(token);
    });
    await expect(
      createDrill(token, request, () => start).probe("baseline")
    ).rejects.toThrow("Probe transport failed; no evidence recorded");
  });
});
