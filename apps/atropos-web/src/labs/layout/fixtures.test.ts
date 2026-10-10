import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { projectV5WorldTemporal } from "@moirai/projections";
import {
  buildV5WorldLayout,
  prepareV5LayoutInput
} from "@moirai/graph-presentation/server";
import {
  computeLayout,
  defaultLayoutSelection,
  layoutAlgorithms,
  type LayoutOutput
} from "@moirai/graph-presentation/layout-engine";
import {
  createSyntheticLabSnapshot,
  createSyntheticLabState,
  SYNTHETIC_LAB_REVISION,
  SYNTHETIC_LAB_TIME_SYSTEM_ID
} from "./fixtures";
import { snapshotDigestPayload } from "./types";

function temporalCoordinates(output: LayoutOutput) {
  return output.shapes.map((shape) => ({
    eventId: shape.event_id,
    kind: shape.kind,
    y:
      shape.kind === "point"
        ? [shape.position.y]
        : shape.kind === "segment"
          ? [shape.start.y, shape.end.y]
          : [shape.bounds.minY, shape.bounds.maxY]
  }));
}

describe("immutable Layout Lab pathological fixture", () => {
  it("contains nested, overlapping, dense, sparse, long-span and unplaced facts", () => {
    const state = createSyntheticLabState();
    const snapshot = createSyntheticLabSnapshot();
    const byId = new Map(snapshot.events.map((event) => [event.id, event]));
    expect(snapshot.events).toHaveLength(174);
    expect(
      snapshot.events.filter((event) => event.id.startsWith("dense-"))
    ).toHaveLength(161);
    expect(byId.get("dense-process")!.childIds).toHaveLength(161);
    expect(byId.get("outer-process")!.childIds).toEqual([
      "dense-process",
      "far-child",
      "inner-process"
    ]);
    expect(byId.get("inner-process")!.childIds).toContain("shared");
    expect(byId.get("overlap-process")!.childIds).toContain("shared");
    expect(byId.get("shared")!.collectionIds).toEqual([
      "lab-overlap",
      "lab-primary"
    ]);
    expect(
      snapshot.input.explicitExtents.some(
        (extent) => extent.eventId === "unplaced"
      )
    ).toBe(false);
    expect(state.relations.some((relation) => relation.type === "causes")).toBe(
      true
    );
    expect(Object.isFrozen(snapshot.input.dataset.events)).toBe(true);
    expect(Object.isFrozen(state.relations)).toBe(true);
    const output = computeLayout(snapshot.input);
    expect(output.unplaced_event_ids).toEqual(["unplaced"]);
    expect(output.shapes).toHaveLength(173);
    const inner = output.shapes.find(
      (shape) => shape.event_id === "inner-process"
    );
    const outer = output.shapes.find(
      (shape) => shape.event_id === "long-process"
    );
    if (inner?.kind !== "region" || outer?.kind !== "region")
      throw Error("missing Composite fixture");
    expect(outer.bounds.maxY - outer.bounds.minY).toBeGreaterThan(
      10_000 * (inner.bounds.maxY - inner.bounds.minY)
    );
  });

  it("matches production baseline and keeps identities, temporal positions and contains facts across candidates", () => {
    const state = createSyntheticLabState();
    const snapshot = createSyntheticLabSnapshot();
    const before = JSON.stringify(snapshot);
    const temporal = projectV5WorldTemporal(state, SYNTHETIC_LAB_REVISION);
    const baseline = computeLayout(snapshot.input);
    expect(baseline).toEqual(
      buildV5WorldLayout(state, temporal, SYNTHETIC_LAB_TIME_SYSTEM_ID)
    );
    for (const algorithm of layoutAlgorithms) {
      const selection = defaultLayoutSelection(algorithm.id);
      const output = computeLayout(snapshot.input, selection);
      expect(output).toEqual(computeLayout(snapshot.input, selection));
      expect(output.shapes.map((shape) => shape.event_id)).toEqual(
        baseline.shapes.map((shape) => shape.event_id)
      );
      expect(output.unplaced_event_ids).toEqual(baseline.unplaced_event_ids);
      expect(temporalCoordinates(output)).toEqual(
        temporalCoordinates(baseline)
      );
      expect(output.temporal_digest).toBe(temporal.semantic_digest);
    }
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(projectV5WorldTemporal(state, SYNTHETIC_LAB_REVISION)).toEqual(
      temporal
    );
  });

  it("membership affects the incidence candidate, never temporal facts or legacy candidates", () => {
    const state = createSyntheticLabState();
    const withoutCollections: CanonicalState = {
      ...state,
      collections: [],
      eventCollectionMemberships: [],
      collectionTimeSystems: [],
      narratives: state.narratives.filter(
        (narrative) => narrative.scope_type === "event"
      )
    };
    const snapshot = createSyntheticLabSnapshot();
    const input = prepareV5LayoutInput(
      withoutCollections,
      projectV5WorldTemporal(withoutCollections, SYNTHETIC_LAB_REVISION),
      SYNTHETIC_LAB_TIME_SYSTEM_ID
    );
    expect({ ...input, incidence: undefined }).toEqual({
      ...snapshot.input,
      incidence: undefined
    });
    for (const algorithm of layoutAlgorithms) {
      const selection = defaultLayoutSelection(algorithm.id);
      const output = computeLayout(input, selection);
      const withMembership = computeLayout(snapshot.input, selection);
      if (algorithm.id === "global-incidence")
        expect(output.shapes).not.toEqual(withMembership.shapes);
      else expect(output).toEqual(withMembership);
      expect(temporalCoordinates(output)).toEqual(
        temporalCoordinates(withMembership)
      );
      expect(
        output.shapes.filter((shape) => shape.event_id === "shared")
      ).toHaveLength(1);
    }
  });

  it("serializes the exact same immutable snapshot and computation for replay", () => {
    const snapshot = createSyntheticLabSnapshot();
    const restored = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
    expect(restored).toEqual(createSyntheticLabSnapshot());
    expect(
      createHash("sha256").update(snapshotDigestPayload(restored)).digest("hex")
    ).toBe(snapshot.inputDigest);
    for (const algorithm of layoutAlgorithms) {
      const selection = defaultLayoutSelection(algorithm.id);
      expect(computeLayout(restored.input, selection)).toEqual(
        computeLayout(snapshot.input, selection)
      );
    }
  });
});
