import { describe, expect, it } from "vitest";
import {
  buildV5SpatialIndex,
  spatialIntersects,
  type V5SpatialNode
} from "./v5-spatial-index.js";
import type { V5WorldLayout } from "./v5-world-layout.js";
import { readV5WorldViewport } from "./v5-spatial-read.js";

describe("offline v5 World spatial hierarchy", () => {
  it("bounds the root and reaches a distant local viewport without scanning 20k Events", () => {
    const layout: V5WorldLayout = {
      world_id: "world-1",
      revision: 31,
      time_system_id: "gregorian",
      algorithm_version: "v5-world-layout/1",
      temporal_digest: "digest",
      unplaced_event_ids: [],
      diagnostics: [],
      shapes: Array.from({ length: 20_000 }, (_, i) => ({
        event_id: `event-${String(i).padStart(6, "0")}`,
        kind: "point" as const,
        position: { x: 0, y: i * 100 }
      }))
    };
    const artifacts = buildV5SpatialIndex(layout);
    const root = JSON.parse(artifacts.manifest.body) as {
      entries: {
        key: string;
        bounds: { minX: number; maxX: number; minY: number; maxY: number };
      }[];
      shape_count: number;
    };
    expect(root.shape_count).toBe(20_000);
    expect(root.entries.length).toBeLessThanOrEqual(128);
    expect(artifacts.manifest.body.length).toBeLessThan(20_000);
    const map = new Map(
      artifacts.documents.map(({ key, body }) => [key, body])
    );
    const viewport = { minX: -1, maxX: 1, minY: 1_900_000, maxY: 1_900_010 };
    const found: string[] = [];
    let reads = 0;
    const descend = (ref: (typeof root.entries)[number]) => {
      if (!spatialIntersects(ref.bounds, viewport)) return;
      reads++;
      const node = JSON.parse(map.get(ref.key)!) as V5SpatialNode;
      if (node.kind === "branch")
        for (const next of node.entries) descend(next);
      else
        for (const item of node.entries)
          if (spatialIntersects(item.bounds, viewport))
            found.push(item.shape.event_id);
    };
    for (const ref of root.entries) descend(ref);
    expect(found).toEqual(["event-019000"]);
    expect(reads).toBeLessThanOrEqual(3);
    expect(artifacts.documents.length).toBeLessThan(200);
    expect(
      buildV5SpatialIndex({ ...layout, shapes: [...layout.shapes].reverse() })
    ).toEqual(artifacts);
  });
  it("rejects duplicate Event geometry and nonfinite coordinates", () => {
    const base: V5WorldLayout = {
      world_id: "w",
      revision: 1,
      time_system_id: "t",
      algorithm_version: "v5-world-layout/1",
      temporal_digest: "digest",
      unplaced_event_ids: [],
      diagnostics: [],
      shapes: [{ event_id: "e", kind: "point", position: { x: 0, y: 1 } }]
    };
    expect(() =>
      buildV5SpatialIndex({ ...base, shapes: [...base.shapes, ...base.shapes] })
    ).toThrow("v5_spatial_geometry_invalid");
    expect(() =>
      buildV5SpatialIndex({
        ...base,
        shapes: [
          { event_id: "e", kind: "point", position: { x: Infinity, y: 1 } }
        ]
      })
    ).toThrow("v5_spatial_geometry_invalid");
  });
  it("continues dense viewport pages under an object-read budget", async () => {
    const layout: V5WorldLayout = {
      world_id: "world-1",
      revision: 31,
      time_system_id: "gregorian",
      algorithm_version: "v5-world-layout/1",
      temporal_digest: "digest",
      unplaced_event_ids: [],
      diagnostics: [],
      shapes: Array.from({ length: 20_000 }, (_, i) => ({
        event_id: `event-${String(i).padStart(6, "0")}`,
        kind: "point" as const,
        position: { x: 0, y: i * 100 }
      }))
    };
    const artifacts = buildV5SpatialIndex(layout);
    const objects = new Map(
      artifacts.documents.map(({ key, body }) => [key, body])
    );
    const get = async (key: string) => objects.get(key) ?? null;
    const viewport = { minX: -1, maxX: 1, minY: 1_900_000, maxY: 1_940_000 };
    let cursor = null;
    const found: string[] = [];
    const sizes: number[] = [];
    do {
      const page = await readV5WorldViewport(
        artifacts.manifest.body,
        viewport,
        128,
        cursor,
        get
      );
      expect(page.node_reads).toBeLessThan(12);
      found.push(...page.shapes.map((item) => item.event_id));
      sizes.push(page.shapes.length);
      cursor = page.next_cursor;
    } while (cursor);
    expect(sizes).toEqual([128, 128, 128, 17]);
    expect(found).toHaveLength(401);
    expect(found[0]).toBe("event-019000");
    expect(found.at(-1)).toBe("event-019400");
    await expect(
      readV5WorldViewport(
        artifacts.manifest.body,
        { ...viewport, minY: 0 },
        128,
        { query_digest: "stale", pending: [] },
        get
      )
    ).rejects.toThrow("v5_viewport_cursor_invalid");
  });
});
