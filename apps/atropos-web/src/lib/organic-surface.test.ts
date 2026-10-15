import { describe, expect, it } from "vitest";
import { areaD } from "clipper2-ts";
import {
  buildOrganicSurfaces,
  DEFAULT_ORGANIC_SURFACE_PARAMETERS,
  normalizeOrganicSurfaceParameters,
  padOrganicSurfaceContours,
  serializeOrganicSurfaceParameters,
  type OrganicSurfacePoint as Point
} from "./organic-surface";
import type { ResolvedRenderPrimitive } from "./v5-render-density";

const world = (p: Point) => ({ x: p.x, y: p.y * 5 });
function event(
  id: string,
  x: number,
  y: number,
  ancestors = ["P"]
): ResolvedRenderPrimitive {
  return {
    id: `event:${id}`,
    entity: { kind: "event", id },
    geometry: { kind: "point", xy: world({ x, y }) },
    label: id,
    bounds: { minX: x, maxX: x, minY: y * 5, maxY: y * 5 },
    collectionIds: ["collection"],
    ancestorCompositeIds: ancestors,
    lod: { visible: [0, 20], groupId: id }
  };
}
function owner(
  id: string,
  members: string[],
  profile = [{ minY: -1000, maxY: 1000, depth: 1 }]
): ResolvedRenderPrimitive {
  const bounds = { minX: -1000, maxX: 1000, minY: -5000, maxY: 5000 };
  return {
    id: `composite:${id}`,
    entity: { kind: "composite", id },
    geometry: { kind: "polygon", rings: [] },
    label: id,
    bounds,
    collectionIds: [id],
    composite: {
      childEventIds: members,
      supportComplete: true,
      worldBounds: bounds,
      depth: Math.max(...profile.map((b) => b.depth)),
      paddingProfile: profile.map((b) => ({
        ...b,
        minY: b.minY * 5,
        maxY: b.maxY * 5
      }))
    },
    lod: { visible: [0, 20], groupId: id }
  };
}
function relation(
  id: string,
  a: string,
  b: string,
  points: Point[]
): ResolvedRenderPrimitive {
  return {
    id: `relation:${id}`,
    entity: { kind: "relation", id },
    geometry: { kind: "line", paths: [points.map(world)] },
    label: "precedes",
    bounds: { minX: -1000, maxX: 1000, minY: -5000, maxY: 5000 },
    collectionIds: ["collection"],
    endpointIds: [a, b],
    lod: { visible: [0, 20], groupId: id }
  };
}
const contains = (p: Point, rings: Point[][]) => {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!,
        b = ring[j]!;
      if (
        a.y > p.y !== b.y > p.y &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
      )
        inside = !inside;
    }
  return inside;
};
const metric = (rings: Point[][]) =>
  rings.map((ring) => ring.map((p) => ({ x: p.x, y: p.y / 5 })));
const rectangle = (
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): Point[] => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: maxX, y: maxY },
  { x: minX, y: maxY }
];
const parameters = {
  radiusX: 30,
  radiusY: 50,
  levelScale: 0,
  paddingScale: 0,
  relationWidth: 14,
  sampleStep: 1,
  smoothing: 2
};

describe("Organic Surface immutable field geometry", () => {
  it("produces a dense smooth anisotropic final boundary and preserves input", () => {
    const primitives = [event("a", 0, 0), owner("P", ["a"])];
    const before = JSON.stringify(primitives);
    const result = buildOrganicSurfaces({ primitives, parameters });
    expect(JSON.stringify(primitives)).toBe(before);
    expect(result.composites[0]!.baseComponents).toBe(1);
    expect(result.composites[0]!.baseMissingMemberIds).toEqual([]);
    const ring = metric(result.baseContoursByCompositeId.P!)[0]!;
    const width =
      Math.max(...ring.map((p) => p.x)) - Math.min(...ring.map((p) => p.x));
    const height =
      Math.max(...ring.map((p) => p.y)) - Math.min(...ring.map((p) => p.y));
    expect(height / width).toBeCloseTo(50 / 30, 2);
    expect(ring.length).toBeGreaterThan(300);
    expect(
      Math.max(
        ...ring.map((a, i) =>
          Math.hypot(
            a.x - ring[(i + 1) % ring.length]!.x,
            a.y - ring[(i + 1) % ring.length]!.y
          )
        )
      )
    ).toBeLessThan(0.6);
  });

  it("keeps distant unlinked islands and uses the actual bent Relation support", () => {
    const primitives = [
      event("a", -120, 0),
      event("b", 120, 0),
      owner("P", ["a", "b"])
    ];
    const separate = buildOrganicSurfaces({ primitives, parameters });
    expect(separate.composites[0]!.baseComponents).toBe(2);
    const linked = buildOrganicSurfaces({
      primitives: [
        ...primitives,
        relation("long", "a", "b", [
          { x: -120, y: 0 },
          { x: -120, y: 90 },
          { x: 120, y: 90 },
          { x: 120, y: 0 }
        ])
      ],
      parameters
    });
    expect(linked.composites[0]!.baseComponents).toBe(1);
    expect(
      contains(world({ x: 0, y: 90 }), linked.baseContoursByCompositeId.P!)
    ).toBe(true);
    expect(
      contains(world({ x: 0, y: 0 }), linked.baseContoursByCompositeId.P!)
    ).toBe(false);
    expect(linked.composites[0]!.relationIds).toEqual(["long"]);
    const off = buildOrganicSurfaces({
      primitives: [
        ...primitives,
        relation("long", "a", "b", [
          { x: -120, y: 0 },
          { x: 120, y: 0 }
        ])
      ],
      parameters: { ...parameters, relationStrength: 0 }
    });
    expect(off.baseContoursByCompositeId).toEqual(
      separate.baseContoursByCompositeId
    );
  });

  it("represents branches, rejoining paths, a hole and a detached island together", () => {
    const nodes = [
      event("top", 0, -100),
      event("left", -80, 0),
      event("right", 80, 0),
      event("bottom", 0, 100),
      event("island", 260, 0)
    ];
    const positions: Record<string, Point> = {
      top: { x: 0, y: -100 },
      left: { x: -80, y: 0 },
      right: { x: 80, y: 0 },
      bottom: { x: 0, y: 100 }
    };
    const edges = [
      ["top", "left"],
      ["top", "right"],
      ["left", "bottom"],
      ["right", "bottom"]
    ].map(([a, b], i) =>
      relation(`r${i}`, a!, b!, [positions[a!]!, positions[b!]!])
    );
    const result = buildOrganicSurfaces({
      primitives: [
        ...nodes,
        ...edges,
        owner(
          "P",
          nodes.map((n) => n.entity.id)
        )
      ],
      parameters
    });
    expect(result.composites[0]!.baseComponents).toBe(2);
    expect(result.composites[0]!.baseHoles).toBe(1);
    expect(
      contains(world({ x: 0, y: 0 }), result.baseContoursByCompositeId.P!)
    ).toBe(false);
    expect(result.composites[0]!.baseMissingMemberIds).toEqual([]);
    expect(result.composites[0]!.baseVertices).toBeGreaterThan(1000);
  });

  it("retains shared-event overlap between Collections and excludes nonmember glyphs", () => {
    const primitives = [
      event("shared", 0, 0, ["P", "Q"]),
      event("onlyP", -20, 0, ["P"]),
      event("onlyQ", 20, 0, ["Q"]),
      event("obstacle", 0, 18, []),
      owner("P", ["shared", "onlyP"]),
      owner("Q", ["shared", "onlyQ"])
    ];
    const result = buildOrganicSurfaces({ primitives, parameters });
    for (const id of ["P", "Q"]) {
      expect(
        contains(world({ x: 0, y: 0 }), result.baseContoursByCompositeId[id]!)
      ).toBe(true);
      expect(
        contains(world({ x: 0, y: 18 }), result.baseContoursByCompositeId[id]!)
      ).toBe(false);
    }
    expect(result.diagnostics.nonmemberIntersections).toBe(0);
    expect(result.diagnostics.memberCoverageFailures).toBe(0);
  });

  it("reports unavoidable coincident member/nonmember glyph conflicts instead of moving data", () => {
    const result = buildOrganicSurfaces({
      primitives: [
        event("a", 0, 0),
        event("other", 0, 0, []),
        owner("P", ["a"])
      ],
      parameters: { ...parameters, paddingScale: 1 }
    });
    expect(result.composites[0]!.baseMissingMemberIds).toEqual(["a"]);
    expect(result.composites[0]!.paddedMissingMemberIds).toEqual(["a"]);
    expect(result.memberships).toContainEqual({
      compositeId: "P",
      eventId: "a",
      status: "list",
      reason: "FIXED_GLYPH_SUPPORT_CONFLICT"
    });
    expect(result.diagnostics.nonmemberIntersections).toBe(0);
  });

  it("applies structural local levels and keeps padding independent of kernel footprint", () => {
    const primitives = [
      event("a", 0, 0),
      owner("P", ["a"], [{ minY: -30, maxY: 30, depth: 3 }])
    ];
    const noPadding = buildOrganicSurfaces({ primitives, parameters });
    const padded = buildOrganicSurfaces({
      primitives,
      parameters: { ...parameters, paddingScale: 1 }
    });
    expect(padded.baseContoursByCompositeId).toEqual(
      noPadding.baseContoursByCompositeId
    );
    expect(padded.paddedContoursByCompositeId).not.toEqual(
      padded.baseContoursByCompositeId
    );
    const level = buildOrganicSurfaces({
      primitives,
      parameters: { ...parameters, levelScale: 0.3 }
    });
    const area = (rings: Point[][]) =>
      rings.reduce((sum, ring) => sum + areaD(ring), 0);
    expect(area(level.baseContoursByCompositeId.P!)).toBeGreaterThan(
      area(noPadding.baseContoursByCompositeId.P!) * 2
    );
  });

  it("resolves descendant leaves from complete child lists when only direct parents exist", () => {
    const child = { ...owner("C", ["leaf"]), parentCompositeIds: ["P"] };
    const result = buildOrganicSurfaces({
      primitives: [event("leaf", 0, 0, ["C"]), child, owner("P", ["C"])],
      parameters
    });
    expect(
      result.composites.find((c) => c.compositeId === "P")!.memberEventIds
    ).toEqual(["leaf"]);
    expect(
      result.composites.find((c) => c.compositeId === "P")!.baseMissingMemberIds
    ).toEqual([]);
  });

  it("is deterministic under primitive ordering and supports exact parameter serialization", () => {
    const primitives = [
      event("a", -5, 0),
      event("b", 15, 20),
      owner("P", ["a", "b"])
    ];
    expect(buildOrganicSurfaces({ primitives, parameters })).toEqual(
      buildOrganicSurfaces({
        primitives: [...primitives].reverse(),
        parameters
      })
    );
    expect(
      JSON.parse(
        serializeOrganicSurfaceParameters(DEFAULT_ORGANIC_SURFACE_PARAMETERS)
      )
    ).toEqual(DEFAULT_ORGANIC_SURFACE_PARAMETERS);
    expect(() => normalizeOrganicSurfaceParameters({ sampleStep: 99 })).toThrow(
      /out_of_range/
    );
    expect(() => normalizeOrganicSurfaceParameters({ radiusX: NaN })).toThrow(
      /out_of_range/
    );
  });
});

describe("Organic Surface independent local nesting offset", () => {
  it("verifies the requested constant clearance on the final offset, including rounded corners", () => {
    const result = padOrganicSurfaceContours([rectangle(0, 40, 0, 100)], [], 1);
    expect(result).toHaveLength(1);
    for (const point of result[0]!) {
      const dx = Math.max(0, -point.x, point.x - 40);
      const dy = Math.max(0, -point.y, point.y - 100);
      expect(Math.hypot(dx, dy)).toBeCloseTo(11, 4);
    }
  });

  it("uses 6 + 5*local max depth, retains every island, and keeps deep sections local", () => {
    const base = [rectangle(0, 40, 0, 200), rectangle(180, 220, 0, 200)];
    const padded = padOrganicSurfaceContours(
      base,
      [
        { minY: 0, maxY: 200, depth: 1 },
        { minY: 80, maxY: 100, depth: 3 }
      ],
      1
    );
    expect(padded.filter((r) => areaD(r) > 0)).toHaveLength(2);
    expect(contains({ x: -20, y: 90 }, padded)).toBe(true);
    expect(contains({ x: -20, y: 160 }, padded)).toBe(false);
    expect(contains({ x: -10, y: 160 }, padded)).toBe(true);
    expect(contains({ x: 200, y: 90 }, padded)).toBe(true);
    const repeated = padOrganicSurfaceContours(
      base,
      [
        { minY: 0, maxY: 200, depth: 1 },
        { minY: 80, maxY: 100, depth: 3 },
        { minY: 80, maxY: 100, depth: 3 }
      ],
      1
    );
    expect(repeated).toEqual(padded);
  });

  it("lets constant-distance padding join islands and close holes visibly", () => {
    const islands = [rectangle(0, 20, 0, 20), rectangle(35, 55, 0, 20)];
    expect(
      padOrganicSurfaceContours(islands, [], 1).filter((r) => areaD(r) > 0)
    ).toHaveLength(1);
    const donut = [
      rectangle(0, 100, 0, 100),
      rectangle(42, 58, 42, 58).reverse()
    ];
    expect(contains({ x: 50, y: 50 }, donut)).toBe(false);
    expect(
      contains({ x: 50, y: 50 }, padOrganicSurfaceContours(donut, [], 1))
    ).toBe(true);
  });

  it("keeps zero-height padding on the upper boundary and at a point tangent", () => {
    const top = padOrganicSurfaceContours(
      [rectangle(0, 40, 0, 200)],
      [{ minY: 200, maxY: 200, depth: 4 }],
      1
    );
    expect(contains({ x: -25, y: 200 }, top)).toBe(true);
    expect(contains({ x: 20, y: 225 }, top)).toBe(true);
    const tangent = padOrganicSurfaceContours(
      [
        [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 20, y: 100 }
        ]
      ],
      [{ minY: 100, maxY: 100, depth: 4 }],
      1
    );
    expect(contains({ x: 20, y: 125 }, tangent)).toBe(true);
    expect(contains({ x: -4, y: 100 }, tangent)).toBe(true);
  });

  it("preserves closed zero-height depth bands as geometric interval support", () => {
    const base = [rectangle(0, 40, 0, 200)];
    const padded = padOrganicSurfaceContours(
      base,
      [{ minY: 50, maxY: 50, depth: 4 }],
      1
    );
    expect(contains({ x: -25, y: 50 }, padded)).toBe(true);
    expect(contains({ x: -25, y: 150 }, padded)).toBe(false);
  });
});
