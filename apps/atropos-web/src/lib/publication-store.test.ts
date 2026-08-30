import { beforeEach, describe, expect, it, vi } from "vitest";

const { getObject, putObject } = vi.hoisted(() => ({
  getObject: vi.fn(),
  putObject: vi.fn()
}));

vi.mock("./s3", () => ({ getObject, putObject }));

import { rebuildSyntheticPublication } from "./publication-store";

describe("synthetic publication rebuild", () => {
  beforeEach(() => {
    getObject
      .mockReset()
      .mockResolvedValue(new Response(null, { status: 404 }));
    putObject
      .mockReset()
      .mockResolvedValue(new Response(null, { status: 200 }));
  });

  it("writes immutable revision artifacts before atomically replacing current", async () => {
    await rebuildSyntheticPublication();

    expect(putObject).toHaveBeenNthCalledWith(
      1,
      "worlds/world_m0_synthetic/revisions/0/snapshot.json",
      expect.stringContaining('"world_id":"world_m0_synthetic"'),
      { immutable: true }
    );
    expect(putObject).toHaveBeenNthCalledWith(
      2,
      "worlds/world_m0_synthetic/revisions/0/manifest.json",
      expect.stringContaining('"revision":0'),
      { immutable: true }
    );
    expect(putObject).toHaveBeenNthCalledWith(
      3,
      "worlds/world_m0_synthetic/current.json",
      expect.stringContaining('"served_revision":0')
    );
  });
});
