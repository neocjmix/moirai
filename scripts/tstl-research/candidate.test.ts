import { beforeAll, describe, expect, it } from "vitest";
import {
  projectTstlSemantics,
  validateTstlGeometry,
  validateTstlRenderCommands
} from "../../packages/graph-presentation/src/tstl-validator.js";
import { loadHistorySnapshot, replayBaseline } from "./baseline.js";
import {
  A_PARAMETERS,
  buildTstlComparison,
  constructSingleRunContours,
  orderTstlRoots,
  solveFixedYQp,
  type TstlComparisonArtifact,
  type TstlComparisonEvent
} from "./candidate.js";

function syntheticEvent(
  eventId: string,
  x: number,
  y: number
): TstlComparisonEvent {
  return {
    eventId,
    title: eventId,
    x,
    sourceY: y,
    referenceY: y,
    role: "memberEventMark",
    collectionIds: [],
    support: { minX: x - 4, maxX: x + 4, minY: y - 4, maxY: y + 4 },
    baselineShape: { event_id: eventId, kind: "point", position: { x, y } }
  };
}
function project(ids: string[], edges: [string, string][]) {
  return projectTstlSemantics({
    events: ids.map((id) => ({ id })),
    contains: edges.map(([parentId, childId]) => ({ parentId, childId })),
    complete: true
  });
}

describe("restricted Candidate A order and fixed-Y QP", () => {
  it("uses normalized root incidence independent of source ordering, names, and view selection", () => {
    const p = project(
      ["A", "B", "C", "ab", "ac", "abc", "solo"],
      [
        ["A", "ab"],
        ["B", "ab"],
        ["A", "ac"],
        ["C", "ac"],
        ["A", "abc"],
        ["B", "abc"],
        ["C", "abc"]
      ]
    );
    const reversed = project(
      [...p.eventIds].reverse(),
      Object.entries(p.children)
        .flatMap(([id, children]) =>
          children.map((child) => [id, child] as [string, string])
        )
        .reverse()
    );
    expect(orderTstlRoots(p)).toEqual(orderTstlRoots(reversed));
    expect(orderTstlRoots(p).anchorIds).toHaveLength(4);
  });

  it("solves the two-anchor convex separation problem and retains integer feasible X", () => {
    const result = solveFixedYQp({ a: 0, b: 0 }, [
      { beforeId: "a", afterId: "b", gap: 14 }
    ]);
    expect(result.status).toBe("CONVERGED");
    expect(result.positions).toEqual({ a: -7, b: 7 });
    expect(result.maxViolation).toBe(0);
    expect(result.optimalityClaim).toBe("none");
  });

  it("detects a positive order cycle across long-interval slabs without duplicating an Event variable", () => {
    // a spans slabs 0–1, b spans 1–2, c spans 0–2; three local order
    // proposals would demand contradictory X for the same long-lived terminal.
    const result = solveFixedYQp({ a: 0, b: 10, c: 20 }, [
      { beforeId: "a", afterId: "b", gap: 14 },
      { beforeId: "b", afterId: "c", gap: 14 },
      { beforeId: "c", afterId: "a", gap: 14 }
    ]);
    expect(result.status).toBe("MODEL_INFEASIBLE");
    expect(result.positions).toEqual({});
    expect(result.cycleEventIds).toEqual(["a", "b", "c"]);
    expect(result.constraintVisits).toBe(0);
  });

  it("reports deterministic work exhaustion and supplies a feasible dense-glyph incumbent", () => {
    const ids = Array.from(
      { length: 20 },
      (_, index) => `e${String(index).padStart(2, "0")}`
    );
    const reference = Object.fromEntries(ids.map((id) => [id, 0]));
    const constraints = ids
      .slice(1)
      .map((id, i) => ({ beforeId: ids[i]!, afterId: id, gap: 14 }));
    const result = solveFixedYQp(reference, constraints, 0);
    expect(result.status).toBe("BUDGET_EXHAUSTED");
    expect(result.usedFeasibleFallback).toBe(true);
    expect(result.maxViolation).toBe(0);
    expect(Object.keys(result.positions)).toHaveLength(20);
    expect(
      solveFixedYQp(
        Object.fromEntries(Object.entries(reference).reverse()),
        [...constraints].reverse(),
        0
      )
    ).toEqual(result);
    for (const edge of constraints)
      expect(
        result.positions[edge.afterId]! - result.positions[edge.beforeId]!
      ).toBeGreaterThanOrEqual(14);
  });
});

describe("single-run orthogonal contours", () => {
  it("uses local typed fallback for same-Y AB/AC/BC without fabricating ABC", () => {
    const p = project(
      ["A", "B", "C", "ab", "ac", "bc"],
      [
        ["A", "ab"],
        ["B", "ab"],
        ["A", "ac"],
        ["C", "ac"],
        ["B", "bc"],
        ["C", "bc"]
      ]
    );
    const result = constructSingleRunContours(
      p,
      [
        syntheticEvent("ab", 0, 0),
        syntheticEvent("ac", 20, 0),
        syntheticEvent("bc", 40, 0)
      ],
      ["A", "B", "C"]
    );
    expect(result.multiRunBands).toBe(1);
    expect(result.geometry.patches[0]!.areaCompositeIds).toEqual(["A", "C"]);
    expect(validateTstlGeometry(result.geometry).geometryValid).toBe(true);
    expect(p.ancestors.ab).toEqual(["A", "B"]);
  });

  it("shares identical P→C boundaries instead of inventing a parent-only zone", () => {
    const p = project(
      ["P", "C", "e"],
      [
        ["P", "C"],
        ["C", "e"]
      ]
    );
    const result = constructSingleRunContours(
      p,
      [syntheticEvent("e", 0, 0)],
      ["P", "C"]
    );
    const regions = result.geometry.patches[0]!.regions;
    expect(regions[0]!.points).toEqual(regions[1]!.points);
    const validation = validateTstlGeometry(result.geometry);
    expect(validation.geometryValid).toBe(true);
    expect(validation.zones.map((zone) => zone.signature)).toEqual([
      ["C", "P"]
    ]);
  });

  it("leaves time gaps unfilled while preserving all source terminals", () => {
    const p = project(
      ["P", "e1", "e2"],
      [
        ["P", "e1"],
        ["P", "e2"]
      ]
    );
    const events = [syntheticEvent("e1", 0, 0), syntheticEvent("e2", 30, 100)];
    const { geometry } = constructSingleRunContours(p, events, ["P"]);
    expect(
      geometry.patches.some(
        (patch) =>
          patch.minY === 7 &&
          patch.maxY === 93 &&
          patch.areaCompositeIds.length === 0
      )
    ).toBe(true);
    expect(geometry.glyphs.map((glyph) => glyph.eventId)).toEqual(["e1", "e2"]);
    expect(validateTstlGeometry(geometry).geometryValid).toBe(true);
  });
});

describe("actual history-r56 B0/A comparison", () => {
  let artifact: TstlComparisonArtifact;
  beforeAll(() => {
    artifact = buildTstlComparison(
      loadHistorySnapshot(),
      replayBaseline().artifact
    ).artifact;
  }, 120_000);

  it("preserves all 539 Event identities, every exact source Y/bound and 109 membership lists", () => {
    expect(artifact.a.events).toHaveLength(539);
    expect(
      new Set(
        artifact.a.renderCommands.glyphs.map((glyph) => glyph.hitTargetId)
      ).size
    ).toBe(539);
    expect(artifact.projection.leafIds).toHaveLength(430);
    expect(artifact.projection.compositeIds).toHaveLength(109);
    const source = new Map(
      artifact.b0.events.map((event) => [event.eventId, event])
    );
    for (const event of artifact.a.events) {
      expect(event.sourceY).toBe(source.get(event.eventId)!.sourceY);
      expect(event.referenceY).toBe(source.get(event.eventId)!.referenceY);
      expect(event.baselineShape).toEqual(
        source.get(event.eventId)!.baselineShape
      );
      expect(artifact.a.memberships[event.eventId]).toEqual(
        artifact.projection.ancestors[event.eventId]
      );
      if (event.baselineShape.kind === "region")
        expect(event.role).toBe("compositeHeader");
    }
    expect(artifact.a.validation.incidence.valid).toBe(true);
    expect(artifact.a.metrics).toMatchObject({
      geometricScopeComposites: 5,
      outsideScopeListOnlyComposites: 104,
      totalComposites: 109,
      totalLeaves: 430,
      sourceYMismatchCount: 0
    });
  });

  it("does not issue a fill certificate from scalar-only time or hide B0 failures", () => {
    for (const layout of [artifact.b0, artifact.a]) {
      expect(layout.validation.final.valid).toBe(true);
      expect(layout.validation.final.semanticFillEligible).toBe(false);
      expect(layout.validation.final.temporal.legacyCount).toBe(539);
      expect(layout.metrics.semanticFilledRegions).toBe(0);
      expect(layout.metrics.fallbackComposites).toBe(109);
      expect(layout.renderCommands.regions).toHaveLength(0);
      expect(
        layout.diagnosticRenderCommands.regions.every(
          (region) => region.fill === "none"
        )
      ).toBe(true);
    }
    expect(artifact.b0.validation.provisional.geometryValid).toBe(false);
    expect(artifact.b0.validation.provisional.level).toBe("UNRESOLVED");
    expect(artifact.a.solver!.constraintVisits).toBeLessThanOrEqual(
      A_PARAMETERS.constraintVisitBudget
    );
    expect(artifact.a.solver!.maxViolation).toBe(0);
    expect(artifact.a.repair!.attempts.length).toBeLessThanOrEqual(12);
  });

  it("preserves every provisional contour into the exact serialized renderer command", () => {
    for (const layout of [artifact.b0, artifact.a]) {
      const byId = new Map(
        layout.regions.map((region) => [region.id, region.points])
      );
      for (const command of layout.diagnosticRenderCommands.regions)
        expect(command.points).toEqual(byId.get(command.regionId));
      expect(layout.validation.render.valid).toBe(true);
      expect(layout.validation.diagnosticRender.valid).toBe(true);
    }
    const layout = artifact.a;
    const changed = structuredClone(layout.diagnosticRenderCommands);
    changed.glyphs[0]!.body.minY += 0.001;
    changed.glyphs[0]!.body.maxY += 0.001;
    const sources = layout.events.map((event) => ({
      eventId: event.eventId,
      support: event.support,
      anchor: {
        x: event.x,
        y:
          (event.sourceY - artifact.referenceFrame.sourceYOrigin) *
          artifact.referenceFrame.scale
      }
    }));
    expect(
      validateTstlRenderCommands(
        {
          regions: layout.regions,
          glyphs: sources,
          semanticFillEligible: false
        },
        changed
      ).valid
    ).toBe(false);
  });

  it("reproduces complete canonical and renderer geometry after source traversal order is reversed", () => {
    const snapshot = loadHistorySnapshot();
    const reordered = {
      ...snapshot,
      events: [...snapshot.events].reverse(),
      relations: [...snapshot.relations].reverse(),
      collections: [...snapshot.collections].reverse()
    };
    const second = buildTstlComparison(
      reordered,
      replayBaseline().artifact
    ).artifact;
    for (const key of ["a", "b0"] as const) {
      expect(second[key].canonicalHash).toBe(artifact[key].canonicalHash);
      expect(second[key].geometryHash).toBe(artifact[key].geometryHash);
      expect(second[key].diagnosticRenderCommands).toEqual(
        artifact[key].diagnosticRenderCommands
      );
    }
  }, 30_000);
});
