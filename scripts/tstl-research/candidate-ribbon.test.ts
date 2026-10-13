import { beforeAll, describe, expect, it } from "vitest";
import type { TstlExperimentCandidate } from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";
import {
  loadHistorySnapshot,
  replayBaseline,
  type BaselineArtifact
} from "./baseline.js";
import {
  buildTstlComparison,
  TSTL_CASES,
  type TstlComparisonArtifact
} from "./candidate.js";
import {
  buildRibbonCandidate,
  constructRibbonRegion,
  RIBBON_PARAMETERS,
  temporalRibbonEnvelope
} from "./candidate-ribbon.js";
import {
  containsEvenOdd,
  ringArea,
  ringsSelfIntersect,
  validateRegionGeometry,
  type Box,
  type Point
} from "./smooth-regions.js";

function terminal(eventId: string, x: number, y: number) {
  return {
    eventId,
    point: { x, y },
    support: { minX: x - 2.5, maxX: x + 2.5, minY: y - 2.5, maxY: y + 2.5 }
  };
}
const serialized = (paths: Point[][]) =>
  JSON.parse(JSON.stringify(paths)) as Point[][];

describe("continuous rounded ribbon construction", () => {
  it("keeps positively wound transitions joined to overlapping temporal bands", () => {
    const members = [terminal("early", 0, 20), terminal("late", 80, 40)];
    const { paths, bands } = temporalRibbonEnvelope(members);
    const result = validateRegionGeometry(
      serialized(paths),
      members.map((member) => member.support),
      []
    );
    expect(bands).toBe(2);
    expect(result.components).toBe(1);
    expect(result.holes).toBe(0);
    expect(result.memberCoverage).toEqual([true, true]);
    expect(containsEvenOdd({ x: 40, y: 30 }, paths)).toBe(true);
    expect(ringsSelfIntersect(paths)).toBe(0);
  });

  it("forms a broad smooth continuous time ribbon across an empty temporal gap", () => {
    const members = [terminal("early", 0, 0), terminal("late", 100, 300)];
    const { paths } = constructRibbonRegion(members, []);
    const validation = validateRegionGeometry(
      serialized(paths),
      members.map((member) => member.support),
      []
    );
    expect(validation.components).toBe(1);
    expect(validation.memberCoverage).toEqual([true, true]);
    expect(containsEvenOdd({ x: 35, y: 150 }, paths)).toBe(true);
    expect(containsEvenOdd({ x: 65, y: 150 }, paths)).toBe(true);
    expect(paths.flat().length).toBeGreaterThan(20);
    expect(
      paths.some((path) =>
        path.some((point, index) => {
          const next = path[(index + 1) % path.length]!;
          return point.x !== next.x && point.y !== next.y;
        })
      )
    ).toBe(true);
  });

  it("retains a true enclosed hole for a nonmember instead of a background-colored mask", () => {
    const members = [terminal("left", -40, 0), terminal("right", 40, 0)];
    const obstacle = terminal("nonmember", 0, 0).support;
    const { paths } = constructRibbonRegion(members, [obstacle]);
    const validation = validateRegionGeometry(
      serialized(paths),
      members.map((member) => member.support),
      [obstacle]
    );
    expect(validation).toMatchObject({
      components: 1,
      holes: 1,
      nonmemberIntersections: 0,
      selfIntersections: 0
    });
    expect(validation.memberCoverage).toEqual([true, true]);
    expect(paths.some((path) => ringArea(path) < 0)).toBe(true);
    expect(containsEvenOdd({ x: 0, y: 0 }, paths)).toBe(false);
    expect(containsEvenOdd({ x: 0, y: 12 }, paths)).toBe(true);
  });

  it("reports a split when a genuine nonmember barrier disconnects the ribbon", () => {
    const members = [terminal("early", 0, 0), terminal("late", 0, 200)];
    const wall = { minX: -100, maxX: 100, minY: 80, maxY: 120 };
    const { paths } = constructRibbonRegion(members, [wall]);
    const validation = validateRegionGeometry(
      serialized(paths),
      members.map((member) => member.support),
      [wall]
    );
    expect(validation.components).toBe(2);
    expect(validation.memberCoverage).toEqual([true, true]);
    expect(validation.nonmemberIntersections).toBe(0);
    expect(containsEvenOdd({ x: 0, y: 100 }, paths)).toBe(false);
  });

  it("does not hide an impossible coincident-glyph inclusion behind smoothing", () => {
    const member = terminal("member", 0, 0);
    const { paths } = constructRibbonRegion([member], [member.support]);
    const validation = validateRegionGeometry(
      serialized(paths),
      [member.support],
      [member.support]
    );
    expect(validation.memberCoverage).toEqual([false]);
    expect(validation.nonmemberIntersections).toBe(0);
    expect(member.point).toEqual({ x: 0, y: 0 });
  });

  it("is deterministic under Event and obstacle ordering", () => {
    const members = [
      terminal("c", 30, 100),
      terminal("a", -20, 0),
      terminal("b", 40, 30)
    ];
    const obstacles = [
      terminal("x", 0, 10).support,
      terminal("y", 25, 80).support
    ];
    expect(
      constructRibbonRegion([...members].reverse(), [...obstacles].reverse())
    ).toEqual(constructRibbonRegion(members, obstacles));
  });
});

describe("r56 ribbon on exact compiled B0 positions", () => {
  let baseline: BaselineArtifact;
  let comparison: TstlComparisonArtifact;
  let candidate: TstlExperimentCandidate;
  let source: string;
  beforeAll(() => {
    baseline = replayBaseline().artifact;
    comparison = buildTstlComparison(loadHistorySnapshot(), baseline).artifact;
    source = JSON.stringify(baseline);
    candidate = buildRibbonCandidate(baseline, comparison);
  }, 120_000);

  it("preserves all compiled anchors, 109 semantic bounds, and exactly 1390 leaf memberships", () => {
    expect(JSON.stringify(baseline)).toBe(source);
    expect(Object.keys(candidate.xByEventId)).toHaveLength(539);
    expect(Object.keys(candidate.contoursByCompositeId)).toHaveLength(109);
    expect(Object.keys(candidate.worldBoundsByCompositeId)).toHaveLength(109);
    expect(candidate.fillRule).toBe("evenodd");
    for (const primitive of baseline.primitives) {
      if (
        primitive.entity.kind === "relation" ||
        primitive.entity.kind === "cluster"
      )
        continue;
      if (primitive.composite) {
        expect(candidate.xByEventId[primitive.entity.id]).toBe(
          primitive.composite.anchor!.x
        );
        expect(candidate.worldBoundsByCompositeId[primitive.entity.id]).toEqual(
          primitive.composite.worldBounds
        );
      } else if (primitive.geometry.kind === "point") {
        expect(candidate.xByEventId[primitive.entity.id]).toBe(
          primitive.geometry.xy.x
        );
      }
    }
    const pairs = candidate.memberships!.map(
      (membership) => `${membership.compositeId}:${membership.eventId}`
    );
    const expected = Object.entries(comparison.projection.leafMembers).flatMap(
      ([owner, members]) => members.map((eventId) => `${owner}:${eventId}`)
    );
    expect(pairs.sort()).toEqual(expected.sort());
    expect(new Set(pairs).size).toBe(1390);
    expect(
      candidate
        .memberships!.filter((membership) => membership.status === "list")
        .every((membership) => Boolean(membership.reason))
    ).toBe(true);
    expect(candidate.diagnostics).toMatchObject({
      leafMemberships: 1390,
      nonmemberIntersections: 0,
      selfIntersections: 0,
      rejectedGeometryOwners: 0
    });
  });

  it("validates the final world-coordinate glyph inclusion and holes for every owner", () => {
    const positions = new Map<string, Point>();
    for (const primitive of baseline.primitives)
      if (
        primitive.entity.kind !== "relation" &&
        primitive.entity.kind !== "cluster" &&
        primitive.geometry.kind === "point"
      )
        positions.set(primitive.entity.id, primitive.geometry.xy);
    const support = (id: string): Box => {
      const point = positions.get(id)!;
      return {
        minX: point.x - 2.5,
        maxX: point.x + 2.5,
        minY: point.y - 2.5 / RIBBON_PARAMETERS.yScale,
        maxY: point.y + 2.5 / RIBBON_PARAMETERS.yScale
      };
    };
    for (const owner of comparison.projection.compositeIds) {
      const memberIds = [...comparison.projection.leafMembers[owner]!].sort();
      const memberSet = new Set(memberIds);
      const nonmembers = comparison.projection.leafIds.filter(
        (id) => !memberSet.has(id)
      );
      const geometry = validateRegionGeometry(
        serialized(candidate.contoursByCompositeId[owner]!),
        memberIds.map(support),
        nonmembers.map(support)
      );
      expect(geometry.nonmemberIntersections).toBe(0);
      expect(geometry.selfIntersections).toBe(0);
      for (const [index, eventId] of memberIds.entries())
        expect(
          candidate.memberships!.find(
            (membership) =>
              membership.compositeId === owner && membership.eventId === eventId
          )!.status
        ).toBe(geometry.memberCoverage[index] ? "area" : "list");
    }
  }, 120_000);

  it("retains broad curved regions for all five real-history comparisons without Event wires", () => {
    expect(candidate.tracesByCompositeId).toBeUndefined();
    for (const owner of Object.values(TSTL_CASES)) {
      const rings = candidate.contoursByCompositeId[owner]!;
      expect(rings.some((path) => ringArea(path) > 0)).toBe(true);
      expect(rings.flat().length).toBeGreaterThan(20);
      expect(
        candidate.memberships!.some(
          (membership) =>
            membership.compositeId === owner && membership.status === "area"
        )
      ).toBe(true);
    }
    expect(candidate.limitations!.join(" ")).toContain(
      "not evidence of events"
    );
  });
});
