import { beforeAll, describe, expect, it } from "vitest";
import { projectTstlSemantics } from "../../packages/graph-presentation/src/tstl-validator.js";
import {
  replayBaseline,
  loadHistorySnapshot,
  type BaselineArtifact
} from "./baseline.js";
import {
  buildTstlComparison,
  type TstlComparisonArtifact,
  TSTL_CASES
} from "./candidate.js";
import {
  buildBubbleCandidate,
  bubbleSkeleton,
  BUBBLE_PARAMETERS
} from "./candidate-bubble.js";
import {
  baselineCandidateCoordinates,
  boxRing,
  containsEvenOdd,
  ringArea,
  roundRegionPaths,
  subtractRegionObstacles,
  unionRegionPaths,
  validateRegionGeometry
} from "./smooth-regions.js";
import type { TstlExperimentCandidate } from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";

describe("smooth region geometry", () => {
  it("extracts one actual exterior from touching tiles and rounds that exterior", () => {
    const raw = unionRegionPaths([
      boxRing({ minX: 0, maxX: 20, minY: 0, maxY: 20 }),
      boxRing({ minX: 20, maxX: 40, minY: 0, maxY: 20 })
    ]);
    expect(raw).toHaveLength(1);
    expect(raw[0]).toHaveLength(4);
    const rounded = roundRegionPaths(raw, 4);
    expect(rounded).toHaveLength(1);
    expect(rounded[0]!.length).toBeGreaterThan(8);
    expect(containsEvenOdd({ x: 20, y: 10 }, rounded)).toBe(true);
  });
  it("keeps an explicit hole empty in both point and polygon-coverage checks", () => {
    const outer = boxRing({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    const obstacle = { minX: 40, maxX: 60, minY: 40, maxY: 60 };
    const result = subtractRegionObstacles([outer], [obstacle]);
    expect(result).toHaveLength(2);
    expect(result.filter((path) => ringArea(path) < 0)).toHaveLength(1);
    expect(containsEvenOdd({ x: 50, y: 50 }, result)).toBe(false);
    expect(containsEvenOdd({ x: 10, y: 10 }, result)).toBe(true);
    expect(
      validateRegionGeometry(
        result,
        [{ minX: 5, maxX: 15, minY: 5, maxY: 15 }, obstacle],
        [obstacle]
      )
    ).toMatchObject({
      memberCoverage: [true, false],
      nonmemberIntersections: 0,
      components: 1,
      holes: 1,
      selfIntersections: 0
    });
  });
  it("does not treat a bow-tie outline as a simple verified region", () => {
    expect(
      validateRegionGeometry(
        [
          [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
            { x: 10, y: 0 }
          ]
        ],
        [],
        []
      ).selfIntersections
    ).toBe(1);
  });
  it("builds one deterministic global skeleton beyond the previous32terminal boundary", () => {
    const points = Array.from({ length: 65 }, (_, i) => ({
      id: `p${String(i).padStart(2, "0")}`,
      point: { x: (i % 7) * 20, y: i * 10 }
    }));
    const edges = bubbleSkeleton(points);
    expect(edges).toHaveLength(64);
    expect(new Set(edges.flatMap((edge) => [edge.from, edge.to])).size).toBe(
      65
    );
    expect(bubbleSkeleton([...points].reverse())).toEqual(edges);
  });
});

describe("Bubble inspired fixed B0 regions", () => {
  it("detours and unions a rounded connected region around an unrelated Event", () => {
    const positions = {
      P: { x: 0, y: 200 },
      left: { x: -40, y: 0 },
      right: { x: 40, y: 0 },
      other: { x: 0, y: 0 }
    };
    const projection = projectTstlSemantics({
      complete: true,
      events: Object.keys(positions).map((id) => ({ id })),
      contains: [
        { parentId: "P", childId: "left" },
        { parentId: "P", childId: "right" }
      ]
    });
    const baseline = {
      bounds: { minX: -50, maxX: 50, minY: -50, maxY: 250 },
      primitives: Object.entries(positions).map(([id, xy]) => ({
        id,
        entity: { kind: id === "P" ? "composite" : "event", id },
        geometry: { kind: "point", xy },
        bounds: { minX: xy.x, maxX: xy.x, minY: xy.y, maxY: xy.y },
        ...(id === "P"
          ? {
              composite: {
                anchor: xy,
                worldBounds: { minX: -40, maxX: 40, minY: 0, maxY: 0 }
              }
            }
          : {})
      }))
    } as unknown as BaselineArtifact;
    const comparison = { projection } as TstlComparisonArtifact;
    const result = buildBubbleCandidate(baseline, comparison);
    expect(result.fillRule).toBe("evenodd");
    expect(result.diagnostics).toMatchObject({
      leafAreaMemberships: 2,
      leafListMemberships: 0,
      connectedComposites: 1,
      nonmemberIntersections: 0,
      selfIntersections: 0
    });
    expect(
      containsEvenOdd(positions.other, result.contoursByCompositeId.P!)
    ).toBe(false);
    expect(
      containsEvenOdd(positions.left, result.contoursByCompositeId.P!)
    ).toBe(true);
    expect(
      result.contoursByCompositeId.P!.some((ring) => ring.length > 8)
    ).toBe(true);
    expect(
      result.contoursByCompositeId.P!.some(
        (ring) => ringArea(ring) < 0 && ring.length > 4
      )
    ).toBe(true);
  });
});

describe("Bubble actual history-r56", () => {
  let baseline: BaselineArtifact,
    comparison: TstlComparisonArtifact,
    candidate: TstlExperimentCandidate;
  let before: string;
  beforeAll(() => {
    baseline = replayBaseline().artifact;
    comparison = buildTstlComparison(loadHistorySnapshot(), baseline).artifact;
    before = JSON.stringify({ baseline, comparison });
    candidate = buildBubbleCandidate(baseline, comparison);
  }, 120_000);
  it("preserves exact compiled B0 positions and semantic world bounds for all539Events", () => {
    const coordinates = baselineCandidateCoordinates(baseline);
    expect(Object.keys(candidate.xByEventId)).toHaveLength(539);
    expect(candidate.xByEventId).toEqual(coordinates.xByEventId);
    expect(candidate.worldBoundsByCompositeId).toEqual(
      coordinates.worldBoundsByCompositeId
    );
    for (const primitive of baseline.primitives) {
      if (
        primitive.entity.kind === "relation" ||
        primitive.entity.kind === "cluster"
      )
        continue;
      if (primitive.composite?.anchor)
        expect(candidate.xByEventId[primitive.entity.id]).toBe(
          primitive.composite.anchor.x
        );
      if (primitive.geometry.kind === "point")
        expect(coordinates.positionsByEventId[primitive.entity.id]).toEqual(
          primitive.geometry.xy
        );
    }
    expect(JSON.stringify({ baseline, comparison })).toBe(before);
  });
  it("retains every leafmembership with measured area coverage or explicit fallback", () => {
    const expected = Object.entries(comparison.projection.leafMembers)
      .flatMap(([owner, ids]) => ids.map((id) => `${owner}:${id}`))
      .sort();
    expect(
      candidate.memberships!.map((m) => `${m.compositeId}:${m.eventId}`).sort()
    ).toEqual(expected);
    expect(candidate.diagnostics!.leafMemberships).toBe(1390);
    expect(
      candidate.diagnostics!.leafAreaMemberships! +
        candidate.diagnostics!.leafListMemberships!
    ).toBe(1390);
    expect(
      candidate
        .memberships!.filter((m) => m.status === "list")
        .every((m) => Boolean(m.reason))
    ).toBe(true);
    expect(candidate.diagnostics!.segmentChecks).toBeLessThanOrEqual(
      BUBBLE_PARAMETERS.segmentCheckBudget
    );
    for (const id of Object.values(TSTL_CASES))
      expect(candidate.contoursByCompositeId[id]!.length).toBeGreaterThan(0);
  });
  it("validates final world contours and renders outer boundaries with separate holes", () => {
    expect(candidate.fillRule).toBe("evenodd");
    expect(candidate.diagnostics).toMatchObject({
      nonmemberIntersections: 0,
      selfIntersections: 0,
      semanticCertifiedAreas: 0
    });
    expect(candidate.diagnostics!.holes).toBeGreaterThan(0);
    expect(candidate.diagnostics!.connectedComposites).toBeGreaterThan(50);
    expect(candidate.diagnostics!.components).toBeLessThan(250);
    const coordinates = baselineCandidateCoordinates(baseline);
    for (const owner of [TSTL_CASES.korea, TSTL_CASES.imjin]) {
      const memberSet = new Set(comparison.projection.leafMembers[owner]);
      const nonmembers = comparison.projection.leafIds
        .filter((id) => !memberSet.has(id))
        .map((id) => {
          const p = coordinates.positionsByEventId[id]!;
          return {
            minX: p.x - 2.5,
            maxX: p.x + 2.5,
            minY: p.y - 12.5,
            maxY: p.y + 12.5
          };
        });
      expect(
        validateRegionGeometry(
          candidate.contoursByCompositeId[owner]!,
          [],
          nonmembers
        ).nonmemberIntersections
      ).toBe(0);
    }
  });
  it("replays identical exterior geometry after source traversal is reversed", () => {
    const reordered = structuredClone(comparison);
    reordered.projection.compositeIds.reverse();
    reordered.projection.leafIds.reverse();
    for (const ids of Object.values(reordered.projection.leafMembers))
      ids.reverse();
    const second = buildBubbleCandidate(
      { ...baseline, primitives: [...baseline.primitives].reverse() },
      reordered
    );
    expect(second.contoursByCompositeId).toEqual(
      candidate.contoursByCompositeId
    );
    expect(second.memberships).toEqual(candidate.memberships);
    expect(second.diagnostics).toEqual(candidate.diagnostics);
  }, 120_000);
});
