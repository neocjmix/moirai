import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  computeLayout,
  CANONICAL_LAYOUT_SELECTION,
  defaultLayoutSelection,
  type LayoutInput,
  type LayoutOutput
} from "./layout-engine.js";
import type { IncidenceMetadata } from "./collection-incidence.js";

const snapshot = JSON.parse(
  readFileSync("scripts/layout-research/data/history-r56.json", "utf8")
) as {
  input: LayoutInput;
  events: IncidenceMetadata["events"];
  collections: IncidenceMetadata["collections"];
  relations: IncidenceMetadata["relations"];
};
const input: LayoutInput = {
  ...snapshot.input,
  incidence: {
    formatVersion: "collection-incidence/1",
    events: snapshot.events,
    collections: snapshot.collections,
    relations: snapshot.relations
  }
};
const timeGeometry = (output: LayoutOutput) =>
  output.shapes.map((s) =>
    s.kind === "point"
      ? [s.event_id, s.kind, s.position.y]
      : s.kind === "segment"
        ? [s.event_id, s.kind, s.start.y, s.end.y]
        : [s.event_id, s.kind, s.bounds.minY, s.bounds.maxY]
  );

describe("reviewed global incidence publication", () => {
  it("matches the exact 539-Event geometry captured from the reviewed immutable Pages release", () => {
    const result = computeLayout(input);
    expect(CANONICAL_LAYOUT_SELECTION.algorithm).toBe("global-incidence");
    expect(result.algorithm_version).toBe("global-incidence/1");
    expect(
      createHash("sha256").update(JSON.stringify(result.shapes)).digest("hex")
    ).toBe("6032f46d8b340c9e5d610e4388e12e35940f92d57432e77dfb992f7bca33d545");
    const baseline = computeLayout(
      input,
      defaultLayoutSelection("legacy-force")
    );
    expect(timeGeometry(result)).toEqual(timeGeometry(baseline));
    expect(result.unplaced_event_ids).toEqual(baseline.unplaced_event_ids);
    expect(new Set(result.shapes.map((s) => s.event_id)).size).toBe(539);
  });
  it("is independent of input ordering and includes membership in replay input", () => {
    const reversed = {
      ...input,
      incidence: {
        ...input.incidence!,
        events: [...input.incidence!.events].reverse().map((e) => ({
          ...e,
          collectionIds: [...e.collectionIds].reverse(),
          childIds: [...e.childIds].reverse()
        })),
        collections: [...input.incidence!.collections]
          .reverse()
          .map((c) => ({ ...c, eventIds: [...c.eventIds].reverse() })),
        relations: [...input.incidence!.relations].reverse()
      }
    };
    expect(computeLayout(reversed)).toEqual(computeLayout(input));
    const oldInput: LayoutInput = { ...input };
    delete (oldInput as { incidence?: IncidenceMetadata }).incidence;
    expect(() => computeLayout(oldInput)).toThrow(
      "layout_membership_input_missing"
    );
    expect(() =>
      computeLayout(oldInput, defaultLayoutSelection("legacy-force"))
    ).not.toThrow();
  });
});
