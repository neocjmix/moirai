import { describe, expect, it } from "vitest";
import type { GraphShellChartPlaneEntity as Entity } from "../shared/contracts";
import {
  applyCanonOffset,
  filterStaticViewportEntities,
  getBandRange,
  mergeUniqueEntities
} from "./spatial-read";
import {
  expandWorldBoundsForViewportRequest,
  getVisibleWorldBounds,
  projectViewportPointToWorld,
  projectWorldPoint
} from "./components/chart-surface";

const base = (id: string) => ({
  id,
  eventId: id,
  canonId: "k1",
  label: id,
  validationState: "ok" as const,
  contains: [] as string[],
  diagnostics: [],
  viewportClass: "visible" as const
});
const point = (id: string, x: number, y: number): Entity => ({
  ...base(id),
  geometryKind: "point",
  position: { x, y }
});
const region = (id: string, contains: string[]): Entity => ({
  ...base(id),
  geometryKind: "region",
  contains,
  worldBounds: { minX: 100, maxX: 200, minY: 100, maxY: 200 }
});
const bbox = { minX: -10, maxX: 10, minY: -10, maxY: 10 };
const query = { canonIds: ["k1"], bbox, includeNeighbors: false };
const filter = (entities: Entity[], overrides = {}) =>
  filterStaticViewportEntities(
    {
      compatibilityKey: "test",
      timeSystemId: "test",
      entities,
      diagnostics: []
    },
    { ...query, ...overrides }
  );

describe("M4.6 pinned URDR spatial characterization", () => {
  it.each([
    [1, 1],
    [2.5, 0.125],
    [-2, -3]
  ])("inverts independent scales %s/%s", (scaleX, scaleY) => {
    const view = { x: 81, y: -33, scaleX, scaleY };
    const size = { width: 390, height: 844 };
    const world = { x: -150.5, y: 8219.25 };
    const screen = projectWorldPoint(view, size, world);
    expect(projectViewportPointToWorld(view, size, screen)).toEqual(world);
    const bounds = getVisibleWorldBounds(view, size);
    expect(bounds.minX).toBeLessThan(bounds.maxX);
    expect(bounds.minY).toBeLessThan(bounds.maxY);
  });

  it("pads each side by 1.5 spans (four times total extent)", () => {
    expect(expandWorldBoundsForViewportRequest(bbox)).toEqual({
      minX: -40,
      maxX: 40,
      minY: -40,
      maxY: 40
    });
  });

  it("uses floor across zero and includes the boundary band with asymmetric overscan", () => {
    expect(
      getBandRange({ viewportMinY: -1, viewportMaxY: 4096, bandSize: 4096 })
    ).toEqual({ startBand: -2, endBand: 3 });
    expect(
      getBandRange({
        viewportMinY: 4096,
        viewportMaxY: -1,
        bandSize: 4096,
        overscanAfter: 3
      })
    ).toEqual({ startBand: -2, endBand: 4 });
  });

  it("keeps crossing segment bounds even when both endpoints are outside", () => {
    const edge: Entity = {
      ...base("edge"),
      geometryKind: "segment",
      start: { x: -20, y: 0 },
      end: { x: 20, y: 0 }
    };
    expect(
      filter([point("inside", 10, 10), point("outside", 11, 0), edge]).map(
        (e) => e.id
      )
    ).toEqual(["inside", "edge"]);
  });

  it("retains offscreen selection, direct neighbors and nested parent/child regions", () => {
    const selected = { ...point("selected", 500, 500), containedBy: "inner" };
    const neighbor = { ...point("neighbor", 600, 600), contains: ["selected"] };
    const inner = { ...region("inner", ["selected"]), containedBy: "outer" };
    const outer = region("outer", ["inner", "sibling"]);
    const sibling = region("sibling", []);
    expect(
      filter([selected, neighbor, inner, outer, sibling], {
        selectedEntityId: "selected",
        includeNeighbors: true
      })
        .map((e) => e.id)
        .sort()
    ).toEqual(["inner", "neighbor", "outer", "selected", "sibling"]);
  });

  it("terminates region closure cycles and deduplicates presentation IDs", () => {
    const a = { ...region("a", ["b"]), worldBounds: bbox };
    const b = region("b", ["a"]);
    expect(filter([a, b]).map((e) => e.id)).toEqual(["a", "b"]);
    expect(mergeUniqueEntities([a, b, { ...a, label: "last" }])).toEqual([
      { ...a, label: "last" },
      b
    ]);
  });

  it("offsets all geometry without changing input or Y", () => {
    const shapes: Entity[] = [
      point("p", 1, 2),
      {
        ...base("s"),
        geometryKind: "segment",
        start: { x: 3, y: 4 },
        end: { x: 5, y: 6 }
      },
      region("r", [])
    ];
    const before = structuredClone(shapes);
    expect(shapes.map((e) => applyCanonOffset(e, 2040))).toMatchObject([
      { position: { x: 2041, y: 2 } },
      { start: { x: 2043, y: 4 }, end: { x: 2045, y: 6 } },
      { worldBounds: { minX: 2140, maxX: 2240, minY: 100, maxY: 200 } }
    ]);
    expect(shapes).toEqual(before);
    expect(applyCanonOffset(shapes[0]!, 0)).toBe(shapes[0]);
  });

  it("records original selection scope precondition, not an accepted Moirai scope policy", () => {
    const other = { ...point("other", 500, 500), canonId: "k2" };
    expect(filter([other])).toEqual([]);
    // The original helper searches selection globally. M4.6-D MUST scope its
    // input before calling it; do not expose this behavior as a Moirai API.
    expect(filter([other], { selectedEntityId: "other" })).toEqual([other]);
  });
});
