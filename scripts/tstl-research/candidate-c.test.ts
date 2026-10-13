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
  buildCandidateC,
  candidateCSpinePositions,
  C_PARAMETERS,
  constructCandidateC
} from "./candidate-c.js";
import type { TstlAlternativeGeometry } from "./candidate-bc-types.js";

function fixture(
  coordinates: Record<string, [number, number]>,
  edges: [string, string][],
  referenceX: Record<string, number> = {}
) {
  const projection = projectTstlSemantics({
    events: Object.keys(coordinates).map((id) => ({ id })),
    contains: edges.map(([parentId, childId]) => ({ parentId, childId })),
    complete: true
  });
  const events: TstlComparisonEvent[] = Object.entries(coordinates).map(
    ([eventId, [x, y]]) => ({
      eventId,
      title: eventId,
      x,
      referenceY: y,
      sourceY: y,
      role: projection.children[eventId]!.length
        ? "compositeHeader"
        : "memberEventMark",
      support: { minX: x - 4, maxX: x + 4, minY: y - 4, maxY: y + 4 },
      baselineShape: { event_id: eventId, kind: "point", position: { x, y } },
      collectionIds: []
    })
  );
  return {
    projection,
    events,
    referenceX: Object.fromEntries(
      events.map((event) => [
        event.eventId,
        referenceX[event.eventId] ?? event.x
      ])
    )
  };
}

/** Independent segment/AABB oracle, used only for orthogonal output. */
function hits(a: TstlPoint, b: TstlPoint, box: TstlBox) {
  return !(
    Math.max(a.x, b.x) < box.minX ||
    Math.min(a.x, b.x) > box.maxX ||
    Math.max(a.y, b.y) < box.minY ||
    Math.min(a.y, b.y) > box.maxY
  );
}
function padded(box: TstlBox, padding: number): TstlBox {
  return {
    minX: box.minX - padding,
    maxX: box.maxX + padding,
    minY: box.minY - padding,
    maxY: box.maxY + padding
  };
}

describe("Candidate C line-first geometry", () => {
  it("uses root-reference member medians, stable ID ties and nominal spacing", () => {
    const f = fixture(
      { P: [100, 100], Q: [100, 200], e: [0, 0] },
      [
        ["P", "e"],
        ["Q", "e"]
      ],
      { e: 40 }
    );
    expect(candidateCSpinePositions(f.projection, f.referenceX)).toEqual({
      P: 33,
      Q: 47
    });
    const before = JSON.stringify(f.events);
    const c = constructCandidateC(f.projection, f.events, f.referenceX);
    expect(JSON.stringify(f.events)).toBe(before);
    expect(c.memberships).toEqual([
      { compositeId: "P", eventId: "e", status: "route" },
      { compositeId: "Q", eventId: "e", status: "route" }
    ]);
    expect(c.contoursByCompositeId.P).toEqual(c.contoursByCompositeId.Q);
    expect(c.contoursByCompositeId.P).toHaveLength(1);
    const permuted = {
      ...f.projection,
      compositeIds: [...f.projection.compositeIds].reverse(),
      eventIds: [...f.projection.eventIds].reverse(),
      leafIds: [...f.projection.leafIds].reverse()
    };
    expect(
      constructCandidateC(permuted, [...f.events].reverse(), f.referenceX)
    ).toEqual(c);
  });

  it("leaves a nonmember gap in the time spine and uses bounded two-bend links", () => {
    const f = fixture(
      {
        P: [100, 100],
        e1: [0, 0],
        e2: [0, 40],
        obstacle: [20, 20],
        barrier: [20, 0]
      },
      [
        ["P", "e1"],
        ["P", "e2"]
      ],
      { e1: 20, e2: 20 }
    );
    const c = constructCandidateC(f.projection, f.events, f.referenceX);
    const spines = c.tracesByCompositeId.P!.filter(
      (trace) => trace.kind === "spine"
    );
    expect(spines).toHaveLength(2);
    for (const spine of spines)
      for (const id of ["obstacle", "barrier"])
        expect(
          hits(
            spine.points[0]!,
            spine.points[1]!,
            padded(f.events.find((event) => event.eventId === id)!.support, 3)
          )
        ).toBe(false);
    const link = c.tracesByCompositeId.P!.find(
      (trace) => trace.eventId === "e1"
    )!;
    expect(link.points).toHaveLength(4);
    expect(c.memberships.every((entry) => entry.status === "route")).toBe(true);
    expect(c.diagnostics.detourRoutes).toBeGreaterThan(0);
    expect(c.memberships.some((entry) => entry.eventId === "obstacle")).toBe(
      false
    );
  });

  it("retains exact list membership when no two-bend path fits and omits conflicting cells", () => {
    const f = fixture(
      { P: [100, 100], e: [0, 0], obstacle: [12, 0] },
      [["P", "e"]],
      { e: 40 }
    );
    const c = constructCandidateC(f.projection, f.events, f.referenceX);
    expect(c.memberships).toEqual([
      {
        compositeId: "P",
        eventId: "e",
        status: "list",
        reason: "NO_TWO_BEND_PATH"
      }
    ]);
    expect(c.contoursByCompositeId.P).toEqual([]);
    expect(c.diagnostics.omittedAtomCells).toBe(2);
    expect(c.diagnostics.budgetExhausted).toBe(0);
  });

  it("folds crowded side contacts into exact lists without inventing marks or relations", () => {
    const owners = Array.from({ length: 5 }, (_, index) => `P${index}`);
    const f = fixture(
      Object.fromEntries([
        ...owners.map((owner, index) => [
          owner,
          [100, 100 + index * 20] as [number, number]
        ]),
        ["e", [0, 0] as [number, number]]
      ]),
      owners.map((owner) => [owner, "e"]),
      { e: 40 }
    );
    const c = constructCandidateC(f.projection, f.events, f.referenceX);
    expect(c.memberships).toHaveLength(5);
    expect(c.diagnostics.densePortMemberships).toBe(2);
    expect(
      c.memberships
        .filter((entry) => entry.status === "list")
        .map((entry) => entry.reason)
    ).toEqual(["DENSE_MEMBERSHIP_PORTS", "DENSE_MEMBERSHIP_PORTS"]);
    expect(
      Object.values(c.tracesByCompositeId)
        .flat()
        .filter((trace) => trace.eventId)
        .every((trace) => trace.eventId === "e")
    ).toBe(true);
    expect(c.limitations.join(" ")).toContain(
      "Crossings do not assert relations"
    );
  });

  it("fails on incomplete projection instead of filling guessed memberships", () => {
    const f = fixture({ P: [100, 100], e: [0, 0] }, [["P", "e"]]);
    expect(() =>
      constructCandidateC(
        { ...f.projection, status: "PARTIAL" },
        f.events,
        f.referenceX
      )
    ).toThrow("tstl_c_incomplete_or_invalid_input");
  });

  it("retains obstacle exclusion for long supports beyond the spatial bin cap", () => {
    const f = fixture(
      { P: [100, 100], e: [0, 24], obstacle: [12, 24] },
      [["P", "e"]],
      { e: 40 }
    );
    const obstacle = f.events.find((event) => event.eventId === "obstacle")!;
    obstacle.support.minY = -1000;
    obstacle.support.maxY = 1000;
    const c = constructCandidateC(f.projection, f.events, f.referenceX);
    expect(c.memberships).toEqual([
      {
        compositeId: "P",
        eventId: "e",
        status: "list",
        reason: "NO_TWO_BEND_PATH"
      }
    ]);
    expect(
      c.tracesByCompositeId.P!.every((trace) => trace.kind === "spine")
    ).toBe(true);
  });
});

describe("Candidate C on unchanged history-r56", () => {
  let comparison: TstlComparisonArtifact;
  let c: TstlAlternativeGeometry;
  let beforeEvents: string;
  beforeAll(() => {
    comparison = buildTstlComparison(
      loadHistorySnapshot(),
      replayBaseline().artifact
    ).artifact;
    beforeEvents = JSON.stringify(comparison.a.events);
    c = buildCandidateC(comparison);
  }, 120_000);

  it("preserves 539 Event positions and every ancestor membership for all 109 owners", () => {
    expect(JSON.stringify(comparison.a.events)).toBe(beforeEvents);
    expect(c.diagnostics.totalEvents).toBe(539);
    expect(Object.keys(c.tracesByCompositeId)).toHaveLength(109);
    expect(Object.keys(c.contoursByCompositeId)).toHaveLength(109);
    const expected = Object.entries(comparison.projection.ancestors)
      .flatMap(([eventId, owners]) =>
        owners.map((compositeId) => `${eventId}:${compositeId}`)
      )
      .sort();
    const actual = c.memberships
      .map((entry) => `${entry.eventId}:${entry.compositeId}`)
      .sort();
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
    expect(c.diagnostics.routedMemberships).toBeGreaterThan(0);
    expect(c.diagnostics.budgetExhausted).toBe(0);
    for (const owner of Object.values(TSTL_CASES))
      expect(
        c.memberships.some(
          (entry) => entry.compositeId === owner && entry.status === "route"
        )
      ).toBe(true);
    expect(c.diagnostics.obstacleChecks).toBeLessThanOrEqual(
      C_PARAMETERS.obstacleCheckBudget
    );
    expect(
      c.memberships
        .filter((entry) => entry.status === "list")
        .every((entry) => Boolean(entry.reason))
    ).toBe(true);
  });

  it("keeps membership links clear of every other glyph and gaps every nonmember spine crossing", () => {
    for (const [owner, traces] of Object.entries(c.tracesByCompositeId))
      for (const trace of traces) {
        const obstacles = comparison.a.events.filter((event) =>
          trace.kind === "spine"
            ? event.eventId !== owner &&
              !comparison.projection.descendants[owner]!.includes(event.eventId)
            : event.eventId !== trace.eventId
        );
        if (trace.kind === "membership")
          expect(trace.points.length).toBeLessThanOrEqual(4);
        for (let index = 1; index < trace.points.length; index++) {
          const a = trace.points[index - 1]!;
          const b = trace.points[index]!;
          expect(a.x === b.x || a.y === b.y).toBe(true);
          for (const obstacle of obstacles)
            if (hits(a, b, padded(obstacle.support, C_PARAMETERS.clearance)))
              throw Error(
                `C trace invaded glyph ${owner}/${trace.eventId ?? "spine"}/${obstacle.eventId}`
              );
        }
      }
  });

  it("fills only isolated leaf cells with that leaf's exact ancestor signature", () => {
    const ownerSets = new Map<string, string[]>();
    for (const [owner, contours] of Object.entries(c.contoursByCompositeId))
      for (const contour of contours) {
        expect(contour).toHaveLength(4);
        const key = JSON.stringify(contour);
        ownerSets.set(key, [...(ownerSets.get(key) ?? []), owner]);
      }
    expect(ownerSets.size).toBeGreaterThan(0);
    for (const [key, owners] of ownerSets) {
      const contour = JSON.parse(key) as TstlPoint[];
      const box = {
        minX: contour[0]!.x,
        minY: contour[0]!.y,
        maxX: contour[2]!.x,
        maxY: contour[2]!.y
      };
      const witnesses = comparison.a.events.filter(
        (event) =>
          event.support.minX >= box.minX &&
          event.support.maxX <= box.maxX &&
          event.support.minY >= box.minY &&
          event.support.maxY <= box.maxY
      );
      expect(witnesses).toHaveLength(1);
      expect(owners.sort()).toEqual(
        comparison.projection.ancestors[witnesses[0]!.eventId]
      );
      expect(comparison.projection.leafIds).toContain(witnesses[0]!.eventId);
    }
  });
});
