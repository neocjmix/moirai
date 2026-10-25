import { describe, expect, it, vi } from "vitest";
import { readV5RenderFocus } from "./v5-render-focus";

type Generation = Parameters<typeof readV5RenderFocus>[0];
const make = (
  tiles: {
    key: string;
    level: number;
    minY: number;
    maxY: number;
    primitives?: unknown[];
    revision?: number;
  }[]
) => {
  const refs = tiles.map((t) => ({
    key: t.key,
    sha256: "digest",
    level: t.level,
    bounds: { minY: t.minY, maxY: t.maxY }
  }));
  const read = vi.fn(async (key: string) => {
    if (key === "manifest")
      return JSON.stringify({
        worldId: "world",
        revision: 62,
        timeSystemId: "time",
        tiles: refs
      });
    const tile = tiles.find((t) => t.key === key)!;
    return JSON.stringify({
      worldId: "world",
      revision: tile.revision ?? 62,
      timeSystemId: "time",
      primitives: tile.primitives ?? []
    });
  });
  const generation = {
    generation: "served-force",
    revision: 62,
    manifests: [
      { key: "manifest", sha256: "root-digest", timeSystemId: "time" }
    ],
    read
  } as Generation;
  return { generation, read };
};
const target = {
  entity: { kind: "event", id: "shared" },
  bounds: { minX: -447.7, maxX: -447.7, minY: 193258, maxY: 193258 }
};

describe("same-revision served Render focus", () => {
  it("finds the exact shared point outside the World midpoint camera using fixed Y only", async () => {
    const { generation, read } = make([
      {
        key: "unrelated-y",
        level: 12,
        minY: 180000,
        maxY: 180100,
        primitives: [target]
      },
      {
        key: "target-y",
        level: 12,
        minY: 193250,
        maxY: 193270,
        primitives: [target]
      }
    ]);
    expect(
      await readV5RenderFocus(generation, "time", "shared", {
        minY: 193258,
        maxY: 193258
      })
    ).toEqual({ x: -447.7, y: 193258 });
    expect(read.mock.calls.map(([key]) => key)).toEqual([
      "manifest",
      "target-y"
    ]);
  });
  it("uses coarse replicas for a long Composite without exceeding 64 asset reads", async () => {
    const { generation, read } = make([
      ...Array.from({ length: 65 }, (_, i) => ({
        key: `fine-${i}`,
        level: 12,
        minY: 193000,
        maxY: 194000
      })),
      {
        key: "coarse",
        level: 0,
        minY: 190000,
        maxY: 200000,
        primitives: [{ ...target, entity: { kind: "composite", id: "shared" } }]
      }
    ]);
    expect(
      await readV5RenderFocus(generation, "time", "shared", {
        minY: 193258,
        maxY: 193258
      })
    ).toEqual({ x: -447.7, y: 193258 });
    expect(read).toHaveBeenCalledTimes(2);
    const capped = make(
      Array.from({ length: 70 }, (_, i) => ({
        key: `level-${i}`,
        level: i,
        minY: 0,
        maxY: 2
      }))
    );
    expect(
      await readV5RenderFocus(capped.generation, "time", "missing", {
        minY: 1,
        maxY: 1
      })
    ).toBeNull();
    expect(capped.read).toHaveBeenCalledTimes(65);
  });
  it("fails on mismatched source rather than returning a different revision's coordinates", async () => {
    const { generation } = make([
      {
        key: "stale",
        level: 12,
        minY: 193250,
        maxY: 193270,
        revision: 61,
        primitives: [target]
      }
    ]);
    await expect(
      readV5RenderFocus(generation, "time", "shared", {
        minY: 193258,
        maxY: 193258
      })
    ).rejects.toThrow("render_focus_source_mismatch");
  });
});
