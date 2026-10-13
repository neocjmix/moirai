import { beforeAll, describe, expect, it } from "vitest";
import {
  projectTstlSemantics,
  type TstlBox,
  type TstlPoint
} from "../../packages/graph-presentation/src/tstl-validator.js";
import { loadHistorySnapshot, replayBaseline } from "./baseline.js";
import {
  buildTstlComparison,
  TSTL_CASES,
  type TstlComparisonArtifact,
  type TstlComparisonEvent
} from "./candidate.js";
import {
  B_PARAMETERS,
  buildCandidateB,
  partitionBRectangles
} from "./candidate-b.js";
import type { TstlAlternativeGeometry } from "./candidate-bc-types.js";

const bounds = (points: readonly TstlPoint[]): TstlBox => ({
  minX: Math.min(...points.map((point) => point.x)),
  maxX: Math.max(...points.map((point) => point.x)),
  minY: Math.min(...points.map((point) => point.y)),
  maxY: Math.max(...points.map((point) => point.y))
});
const closedIntersection = (a: TstlBox, b: TstlBox) =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
const interiorIntersection = (a: TstlBox, b: TstlBox) =>
  a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

function fixture(
  positions: [string, number, number][],
  edges: [string, string][]
): TstlComparisonArtifact {
  const eventIds = [
    ...new Set([...positions.map(([id]) => id), ...edges.flat()])
  ];
  const projection = projectTstlSemantics({
    complete: true,
    events: eventIds.map((id) => ({ id })),
    contains: edges.map(([parentId, childId]) => ({ parentId, childId }))
  });
  const events: TstlComparisonEvent[] = positions.map(([eventId, x, y]) => ({
    eventId,
    title: eventId,
    x,
    sourceY: y,
    referenceY: y,
    role: "memberEventMark",
    collectionIds: [],
    support: { minX: x - 4, maxX: x + 4, minY: y - 4, maxY: y + 4 },
    baselineShape: { event_id: eventId, kind: "point", position: { x, y } }
  }));
  // B deliberately depends only on the fixed A events and semantic projection.
  return { projection, a: { events } } as TstlComparisonArtifact;
}

describe("Candidate B bounded terminal forests", () => {
  it("routes around a closed nonmember support and fills the actual rectilinear route", () => {
    const input = fixture(
      [
        ["left", -30, 0],
        ["right", 30, 0],
        ["other", 0, 0]
      ],
      [
        ["P", "left"],
        ["P", "right"]
      ]
    );
    const result = buildCandidateB(input);
    const trace = result.tracesByCompositeId.P![0]!;
    expect(trace.points[0]).toEqual({ x: -30, y: 0 });
    expect(trace.points.at(-1)).toEqual({ x: 30, y: 0 });
    expect(trace.points.some((point) => Math.abs(point.y) >= 10.5)).toBe(true);
    expect(result.diagnostics.bendCount).toBeGreaterThanOrEqual(2);
    expect(result.diagnostics.tubeSegments).toBeGreaterThan(0);
    expect(result.diagnostics.rejoinCycles).toBe(0);
    expect(
      result.memberships.every((membership) => membership.status === "route")
    ).toBe(true);
    const obstacle = input.a.events.find(
      (event) => event.eventId === "other"
    )!.support;
    for (const contour of result.contoursByCompositeId.P!)
      expect(closedIntersection(bounds(contour), obstacle)).toBe(false);
  });

  it("supports a multi-run same-Y set without moving or duplicating its terminals", () => {
    const input = fixture(
      [
        ["ab", 0, 0],
        ["ac", 20, 0],
        ["bc", 40, 0]
      ],
      [
        ["A", "ab"],
        ["B", "ab"],
        ["A", "ac"],
        ["C", "ac"],
        ["B", "bc"],
        ["C", "bc"]
      ]
    );
    const before = structuredClone(input);
    const result = buildCandidateB(input);
    expect(result.tracesByCompositeId.B!.length).toBeGreaterThan(0);
    expect(result.memberships).toHaveLength(6);
    expect(
      result.memberships.every((membership) => membership.status === "route")
    ).toBe(true);
    expect(result.contoursByCompositeId.B!.length).toBeGreaterThan(0);
    expect(result.diagnostics.semanticCertifiedAreas).toBe(0);
    expect(input).toEqual(before);
  });

  it("bounds graph allocation and search separately, preserving every fallback membership", () => {
    const input = fixture(
      [
        ["a", -30, 0],
        ["b", 30, 0]
      ],
      [
        ["P", "a"],
        ["P", "b"]
      ]
    );
    for (const options of [
      { maxGraphVertices: 0 },
      { expandedStateBudget: 0 }
    ]) {
      const result = buildCandidateB(input, options);
      expect(result.diagnostics.budgetWindows).toBe(1);
      expect(result.diagnostics.expandedStates).toBe(0);
      expect(result.memberships).toEqual([
        {
          compositeId: "P",
          eventId: "a",
          status: "list",
          reason: "UNKNOWN_BUDGET"
        },
        {
          compositeId: "P",
          eventId: "b",
          status: "list",
          reason: "UNKNOWN_BUDGET"
        }
      ]);
      expect(result.contoursByCompositeId.P).toHaveLength(2);
    }
  });

  it("reports geometric failure without painting a nonmember or dropping a membership", () => {
    const input = fixture(
      [
        ["a", 0, 0],
        ["b", 30, 0],
        ["other", 0, 0]
      ],
      [
        ["P", "a"],
        ["P", "b"]
      ]
    );
    const result = buildCandidateB(input);
    expect(result.memberships).toContainEqual({
      compositeId: "P",
      eventId: "a",
      status: "list",
      reason: "mesh-disconnected-or-nonmember-clearance"
    });
    expect(result.diagnostics.rejectedTerminalCells).toBe(1);
    expect(result.diagnostics.budgetWindows).toBe(0);
    for (const contour of result.contoursByCompositeId.P!)
      expect(
        closedIntersection(bounds(contour), input.a.events[2]!.support)
      ).toBe(false);
  });

  it("counts an isolated seed as a local-cell list fallback when its search budget ends", () => {
    const input = fixture(
      [
        ["a", -30, 0],
        ["b", 30, 0]
      ],
      [
        ["P", "a"],
        ["P", "b"]
      ]
    );
    const result = buildCandidateB(input, { expandedStateBudget: 1 });
    expect(result.tracesByCompositeId.P).toEqual([]);
    expect(result.contoursByCompositeId.P).toHaveLength(2);
    expect(result.memberships).toEqual([
      {
        compositeId: "P",
        eventId: "a",
        status: "list",
        reason: "LOCAL_CELL_ONLY"
      },
      {
        compositeId: "P",
        eventId: "b",
        status: "list",
        reason: "UNKNOWN_BUDGET"
      }
    ]);
    expect(result.diagnostics).toMatchObject({
      routedMemberships: 0,
      listMemberships: 2,
      localCellOnlyMemberships: 1,
      expandedStates: 1
    });
  });

  it("preserves a singleton terminal cell without claiming a nonexistent route", () => {
    const result = buildCandidateB(fixture([["a", 0, 0]], [["P", "a"]]));
    expect(result.tracesByCompositeId.P).toEqual([]);
    expect(result.contoursByCompositeId.P).toHaveLength(1);
    expect(result.memberships).toEqual([
      {
        compositeId: "P",
        eventId: "a",
        status: "list",
        reason: "LOCAL_CELL_ONLY"
      }
    ]);
    expect(result.diagnostics).toMatchObject({
      routedMemberships: 0,
      listMemberships: 1,
      localCellOnlyMemberships: 1,
      budgetWindows: 0
    });
  });

  it("records bounded forest partitioning and deterministic source-order independence", () => {
    const input = fixture(
      [
        ["a", 0, 0],
        ["b", 20, 20],
        ["c", 40, 40],
        ["d", 60, 60]
      ],
      [
        ["P", "a"],
        ["P", "b"],
        ["P", "c"],
        ["P", "d"]
      ]
    );
    const first = buildCandidateB(input, { maxWindowTerminals: 2 });
    const reordered = structuredClone(input);
    reordered.a.events.reverse();
    reordered.projection.leafIds.reverse();
    reordered.projection.leafMembers.P!.reverse();
    expect(buildCandidateB(reordered, { maxWindowTerminals: 2 })).toEqual(
      first
    );
    expect(first.diagnostics.partitionedComposites).toBe(1);
    expect(first.diagnostics.routeWindows).toBe(2);
    expect(first.tracesByCompositeId.P).toHaveLength(2);
    expect(first.diagnostics.rejoinCycles).toBe(0);
  });

  it("partitions overlapping tube rectangles without opacity overlap or lost area", () => {
    const rectangles = partitionBRectangles([
      { minX: 0, maxX: 10, minY: 0, maxY: 4 },
      { minX: 6, maxX: 10, minY: 0, maxY: 10 },
      { minX: 0, maxX: 10, minY: 0, maxY: 4 }
    ]).map(bounds);
    expect(
      rectangles.reduce(
        (area, rectangle) =>
          area +
          (rectangle.maxX - rectangle.minX) * (rectangle.maxY - rectangle.minY),
        0
      )
    ).toBe(64);
    for (let i = 0; i < rectangles.length; i++)
      for (let j = i + 1; j < rectangles.length; j++)
        expect(interiorIntersection(rectangles[i]!, rectangles[j]!)).toBe(
          false
        );
  });
});

describe("Candidate B history-r56 replay", () => {
  let comparison: TstlComparisonArtifact;
  let candidate: TstlAlternativeGeometry;
  beforeAll(() => {
    comparison = buildTstlComparison(
      loadHistorySnapshot(),
      replayBaseline().artifact
    ).artifact;
    candidate = buildCandidateB(comparison);
  }, 120_000);

  it("covers all 109 owners and exact leaf memberships, including national and shared-history forests", () => {
    expect(Object.keys(candidate.contoursByCompositeId)).toHaveLength(109);
    const expected = Object.entries(comparison.projection.leafMembers)
      .flatMap(([compositeId, members]) =>
        members.map((eventId) => `${compositeId}:${eventId}`)
      )
      .sort();
    expect(
      candidate.memberships
        .map(({ compositeId, eventId }) => `${compositeId}:${eventId}`)
        .sort()
    ).toEqual(expected);
    for (const id of Object.values(TSTL_CASES)) {
      expect(candidate.contoursByCompositeId[id]!.length).toBeGreaterThan(0);
      expect(candidate.tracesByCompositeId[id]!.length).toBeGreaterThan(0);
    }
    expect(candidate.diagnostics.expandedStates).toBeLessThanOrEqual(
      B_PARAMETERS.expandedStateBudget
    );
    expect(candidate.diagnostics.rejectedTubeSegments).toBe(0);
    expect(candidate.diagnostics.semanticCertifiedAreas).toBe(0);
    expect(candidate.diagnostics.rejoinCycles).toBe(0);
  });

  it("keeps every filled fragment outside every owner's nonmember glyph support", () => {
    const events = new Map(
      comparison.a.events.map((event) => [event.eventId, event])
    );
    for (const [compositeId, contours] of Object.entries(
      candidate.contoursByCompositeId
    )) {
      const members = new Set(comparison.projection.leafMembers[compositeId]);
      const obstacles = comparison.projection.leafIds
        .filter((id) => !members.has(id))
        .map((id) => events.get(id)!.support);
      for (const contour of contours) {
        const box = bounds(contour);
        expect(
          obstacles.some((obstacle) => closedIntersection(box, obstacle))
        ).toBe(false);
      }
    }
  });

  it("replays byte-equivalent geometry and memberships without mutating A's XY or source", () => {
    const original = JSON.stringify(comparison);
    const reverse = structuredClone(comparison);
    reverse.a.events.reverse();
    reverse.projection.compositeIds.reverse();
    reverse.projection.leafIds.reverse();
    for (const members of Object.values(reverse.projection.leafMembers))
      members.reverse();
    expect(buildCandidateB(reverse)).toEqual(candidate);
    expect(JSON.stringify(comparison)).toBe(original);
  }, 120_000);
});
