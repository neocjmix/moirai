import { describe, it, expect } from "vitest";
import { createFixtureState, snapshotFromState } from "./fixtures.js";
import { solve, defaults, replaceX, shapeCenter } from "./engine.js";
import { displacement } from "./metrics.js";
import { validateLabSnapshot } from "../../apps/atropos-web/src/labs/layout/snapshot-validation.js";
import { snapshotDigestPayload } from "../../apps/atropos-web/src/labs/layout/types.js";
import { createHash } from "node:crypto";
describe("isolated temporal incidence research", () => {
  const snapshot = validateLabSnapshot(snapshotFromState(createFixtureState()));
  it("uses uneven dates, three contains levels, local multi-way sharing and redundant selections", () => {
    expect(
      new Set(snapshot.input.explicitExtents.map((e) => e.minYear)).size
    ).toBeGreaterThan(100);
    expect(
      snapshot.collections.find((c) => c.id === "context-0")!.eventIds.length
    ).toBeGreaterThan(
      snapshot.collections.find((c) => c.id === "context-3")!.eventIds.length *
        5
    );
    expect(
      snapshot.events.filter(
        (e) =>
          e.collectionIds.filter((c) => c.startsWith("context-")).length >= 3
      ).length
    ).toBeGreaterThan(2);
    const map = new Map(snapshot.events.map((e) => [e.id, e]));
    expect(
      snapshot.events.some((e) =>
        e.childIds.some((id) =>
          map.get(id)?.childIds.some((id) => map.get(id)?.childIds.length)
        )
      )
    ).toBe(true);
    expect(
      snapshot.events.filter((e) => e.title.includes("미배치")).length
    ).toBe(1);
  });
  it("has a valid immutable digest", () => {
    expect(
      createHash("sha256").update(snapshotDigestPayload(snapshot)).digest("hex")
    ).toBe(snapshot.inputDigest);
  });
  it("is deterministic and independent of metadata input order", () => {
    const a = solve(snapshot, "local-incidence");
    const reversed = {
      ...snapshot,
      events: [...snapshot.events].reverse(),
      collections: [...snapshot.collections].reverse(),
      relations: [...snapshot.relations].reverse()
    };
    const b = solve(reversed, "local-incidence");
    expect(b.output.shapes).toEqual(a.output.shapes);
  });
  it("retains one canonical shape, every repaired Y and unplaced IDs", () => {
    const before = solve(snapshot, "legacy-force").output;
    const after = solve(snapshot, "local-incidence").output;
    expect(new Set(after.shapes.map((s) => s.event_id)).size).toBe(
      after.shapes.length
    );
    expect(after.shapes.map((s) => s.event_id)).toEqual(
      before.shapes.map((s) => s.event_id)
    );
    expect(after.unplaced_event_ids).toEqual(before.unplaced_event_ids);
    expect(displacement(before, after).maxY).toBe(0);
    for (const s of after.shapes) {
      const old = before.shapes.find((o) => o.event_id === s.event_id)!;
      if (s.kind === "region" && old.kind === "region")
        expect([s.bounds.minY, s.bounds.maxY]).toEqual([
          old.bounds.minY,
          old.bounds.maxY
        ]);
    }
  });
  it("rederives Composite X from all children including shared and nested support", () => {
    const before = solve(snapshot, "legacy-force").output;
    const moved = new Map(
      before.shapes
        .filter((s) => s.kind !== "region")
        .map((s) => [s.event_id, shapeCenter(s).x + 800])
    );
    const after = replaceX(snapshot, before, moved);
    for (const parent of after.shapes.filter((s) => s.kind === "region")) {
      if (parent.kind !== "region") continue;
      const e = snapshot.events.find((e) => e.id === parent.event_id)!;
      for (const id of e.childIds) {
        const child = after.shapes.find((s) => s.event_id === id);
        if (!child) continue;
        const c = shapeCenter(child);
        expect(c.x).toBeGreaterThanOrEqual(parent.bounds.minX);
        expect(c.x).toBeLessThanOrEqual(parent.bounds.maxX);
      }
    }
  });
  it("supports a previous publication without inventing dates or moving filtered views", () => {
    const a = solve(snapshot, "local-incidence").output;
    const updated = snapshotFromState(createFixtureState("changing", true));
    const pinned = solve(
      updated,
      "local-incidence",
      { ...defaults, stability: 20 },
      a
    ).output;
    const cold = solve(updated, "local-incidence", defaults).output;
    expect(displacement(a, pinned).p95X).toBeLessThan(
      displacement(a, cold).p95X
    );
    expect(displacement(a, pinned).maxY).toBe(0);
  });
  it("rejects malformed numerical parameters", () => {
    expect(() =>
      solve(snapshot, "local-incidence", { ...defaults, windowYears: 0 })
    ).toThrow();
    expect(() =>
      solve(snapshot, "local-incidence", { ...defaults, spacing: NaN })
    ).toThrow();
  });
});
