import { alignSemanticLanes } from "./align-semantic-lanes.js";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { projectTstlSemantics } from "../../packages/graph-presentation/src/tstl-validator.js";
import { loadHistorySnapshot, type BaselineArtifact } from "./baseline.js";
import { buildTstlComparison } from "./candidate.js";
import {
  placeSemanticLanes,
  SEMANTIC_LANE_PARAMETERS
} from "./semantic-lanes.js";

const snapshot = loadHistorySnapshot();
const baseline = JSON.parse(
  readFileSync("scripts/tstl-research/evidence/b0.json", "utf8")
) as BaselineArtifact;
const { artifact } = buildTstlComparison(snapshot, baseline);

describe("offline semantic lanes", () => {
  it("keeps all 539 IDs, source time, multiparent DAG and Collections unchanged", () => {
    const before = JSON.stringify(artifact);
    const result = placeSemanticLanes(artifact.projection, artifact.b0.events);
    expect(Object.keys(result.positions).sort()).toEqual(
      [...artifact.projection.eventIds].sort()
    );
    expect(result.lanes.flatMap((g) => g.eventIds).sort()).toEqual(
      [...artifact.projection.leafIds].sort()
    );
    expect(JSON.stringify(artifact)).toBe(before);
    expect(
      [...artifact.projection.parents[artifact.cases.imjin]!].sort()
    ).toEqual([artifact.cases.korea, artifact.cases.japan].sort());
    expect(result.width).toBeLessThan(2000);
  });
  it("separates every overlapping nominal leaf support, independently of signature", () => {
    const r = placeSemanticLanes(artifact.projection, artifact.b0.events);
    const leaves = artifact.b0.events.filter(
      (e) => e.role === "memberEventMark"
    );
    for (let i = 0; i < leaves.length; i++)
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i]!,
          b = leaves[j]!;
        if (
          Math.abs(a.sourceY - b.sourceY) * SEMANTIC_LANE_PARAMETERS.yScale <
          SEMANTIC_LANE_PARAMETERS.supportGap - 1e-8
        )
          expect(
            Math.abs(r.positions[a.eventId]! - r.positions[b.eventId]!)
          ).toBeGreaterThanOrEqual(SEMANTIC_LANE_PARAMETERS.supportGap);
      }
  });
  it("is invariant to Event input order and retains exactly one shared witness in AB/AC/BC and equal-membership peers", () => {
    const ids = ["A", "B", "C", "D", "ab", "ac", "bc"];
    const p = projectTstlSemantics({
      complete: true,
      events: ids.map((id) => ({ id, worldId: "w" })),
      contains: [
        ["A", "ab"],
        ["B", "ab"],
        ["A", "ac"],
        ["C", "ac"],
        ["B", "bc"],
        ["C", "bc"],
        ["D", "ab"],
        ["D", "ac"]
      ].map(([parentId, childId]) => ({
        parentId: parentId!,
        childId: childId!
      }))
    });
    const events = ids.map((id) => ({
      ...artifact.b0.events[0]!,
      eventId: id,
      sourceY: 100,
      role: p.leafIds.includes(id)
        ? ("memberEventMark" as const)
        : ("compositeHeader" as const)
    }));
    const a = placeSemanticLanes(p, events),
      b = placeSemanticLanes(p, [...events].reverse());
    expect(a).toEqual(b);
    expect(a.lanes.flatMap((g) => g.eventIds).sort()).toEqual([
      "ab",
      "ac",
      "bc"
    ]);
    expect(new Set([a.positions.ab, a.positions.ac, a.positions.bc]).size).toBe(
      3
    );
    // Equal membership is not an invented contains edge or a reason to duplicate leaves.
    expect(p.parents.D).toEqual([]);
    expect(a.positions.A).toBe(a.positions.D);
  });
  it("fails closed on missing/duplicate Events and invalid parameters", () => {
    expect(() =>
      placeSemanticLanes(artifact.projection, artifact.b0.events.slice(1))
    ).toThrow("lanes_event_domain");
    expect(() =>
      placeSemanticLanes(artifact.projection, [
        ...artifact.b0.events,
        artifact.b0.events[0]!
      ])
    ).toThrow("lanes_event_domain");
    expect(() =>
      placeSemanticLanes(artifact.projection, artifact.b0.events, {
        ...SEMANTIC_LANE_PARAMETERS,
        rootGutter: NaN
      })
    ).toThrow("lanes_invalid_gutter");
  });
});

describe("episode alignment", () => {
  it("preserves source semantics, one identity, and all overlapping support clearances", () => {
    const before = JSON.stringify(artifact);
    const aligned = alignSemanticLanes(artifact.projection, artifact.b0.events);
    expect(JSON.stringify(artifact)).toBe(before);
    expect(Object.keys(aligned.positions).sort()).toEqual(
      [...artifact.projection.eventIds].sort()
    );
    expect(aligned.lanes.flatMap((l) => l.eventIds).sort()).toEqual(
      [...artifact.projection.leafIds].sort()
    );
    for (let i = 0; i < aligned.lanes.length; i++)
      for (let j = i + 1; j < aligned.lanes.length; j++) {
        const a = aligned.lanes[i]!,
          b = aligned.lanes[j]!;
        if (a.minY >= b.maxY || b.minY >= a.maxY) continue;
        expect(
          Math.max(b.minX - a.maxX, a.minX - b.maxX)
        ).toBeGreaterThanOrEqual(SEMANTIC_LANE_PARAMETERS.peerGutter - 1e-7);
      }
    expect(aligned.diagnostics.finalEnergy).toBeLessThan(
      aligned.diagnostics.initialEnergy
    );
    expect(
      alignSemanticLanes(artifact.projection, [...artifact.b0.events].reverse())
        .positions
    ).toEqual(aligned.positions);
  });
});

it("bounds exclusive root episode drift without changing shared identities", () => {
  const base = placeSemanticLanes(artifact.projection, artifact.b0.events);
  const anchored = alignSemanticLanes(
    artifact.projection,
    artifact.b0.events,
    true
  );
  for (const lane of base.lanes.filter(
    (lane) => lane.rootSignature.length === 1
  ))
    for (const id of lane.eventIds)
      expect(
        Math.abs(anchored.positions[id]! - base.positions[id]!)
      ).toBeLessThanOrEqual(20 + 1e-7);
  expect(anchored.diagnostics.finalEnergy).toBeLessThan(
    anchored.diagnostics.initialEnergy
  );
});
