import { beforeEach, describe, expect, it, vi } from "vitest";

const load = vi.hoisted(() => vi.fn());
vi.mock("../../../../labs/layout/load-snapshot", () => ({
  loadLayoutLabSnapshot: load
}));
import { GET } from "./route";

const world = "01a107fb-4018-7fcb-8390-836a40fa91cc";
describe("isolated Layout Lab snapshot GET", () => {
  beforeEach(() => {
    load.mockReset();
  });

  it("validates World, revision and Time System before reading", async () => {
    for (const query of [
      "",
      "?world=../secret",
      `?world=${world}&revision=1.5`,
      `?world=${world}&revision=0`,
      `?world=${world}&timeSystem=bad`
    ]) {
      const response = await GET(
        new Request(`https://example.test/labs/layout/snapshot${query}`)
      );
      expect(response.status).toBe(400);
    }
    expect(load).not.toHaveBeenCalled();
  });

  it("returns a pinned public snapshot once and never caches mutable selection", async () => {
    load.mockResolvedValue({ worldId: world, servedRevision: 26 });
    const response = await GET(
      new Request(
        `https://example.test/labs/layout/snapshot?world=${world}&revision=26`
      )
    );
    expect(load).toHaveBeenCalledExactlyOnceWith(world, 26, undefined);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      worldId: world,
      servedRevision: 26
    });
  });

  it("reports revision mismatch instead of silently restoring another snapshot", async () => {
    load.mockRejectedValue(Error("lab_snapshot_revision_changed"));
    const response = await GET(
      new Request(
        `https://example.test/labs/layout/snapshot?world=${world}&revision=26`
      )
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "snapshot_revision_changed"
    });
  });

  it("fails closed without publishing internal errors", async () => {
    load.mockRejectedValue(Error("private store detail"));
    const response = await GET(
      new Request(`https://example.test/labs/layout/snapshot?world=${world}`)
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "snapshot_unavailable" });
  });
});
