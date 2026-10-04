import { describe, expect, it } from "vitest";
import { createSyntheticLabSnapshot } from "./fixtures";
import { snapshotDigestPayload } from "./types";
import { validateLabSnapshot } from "./snapshot-validation";

const base = createSyntheticLabSnapshot();
const copy = () => JSON.parse(JSON.stringify(base));

describe("portable Layout Lab snapshot integrity", () => {
  it("accepts nested/overlapping/shared input without reordering signed bytes", () => {
    const value = copy();
    const serialized = snapshotDigestPayload(value);
    expect(validateLabSnapshot(value)).toBe(value);
    expect(snapshotDigestPayload(value)).toBe(serialized);
    expect(validateLabSnapshot(base)).toBe(base);
  });

  it.each([
    [
      "cross-World metadata",
      (s: ReturnType<typeof copy>) => {
        s.input.worldId = "another-world";
      }
    ],
    [
      "cross-revision metadata",
      (s: ReturnType<typeof copy>) => {
        s.servedRevision++;
      }
    ],
    [
      "different Time System",
      (s: ReturnType<typeof copy>) => {
        s.input.board.axis.timeSystemId = "another-axis";
      }
    ],
    [
      "duplicate Event identity",
      (s: ReturnType<typeof copy>) => {
        s.events.push(s.events[0]);
      }
    ],
    [
      "missing Event metadata",
      (s: ReturnType<typeof copy>) => {
        s.events.pop();
      }
    ],
    [
      "changed Event title",
      (s: ReturnType<typeof copy>) => {
        s.input.dataset.events[0].title = "different title";
      }
    ],
    [
      "changed authored children",
      (s: ReturnType<typeof copy>) => {
        s.events.find(
          (e: { childIds: string[] }) => e.childIds.length
        ).childIds = [];
      }
    ],
    [
      "removed semantic contains",
      (s: ReturnType<typeof copy>) => {
        s.input.dataset.semanticLinks = s.input.dataset.semanticLinks.filter(
          (link: { type: string }) => link.type !== "contains"
        );
      }
    ],
    [
      "unknown relation endpoint",
      (s: ReturnType<typeof copy>) => {
        s.relations[0].targetId = "missing";
      }
    ],
    [
      "missing reciprocal Collection membership",
      (s: ReturnType<typeof copy>) => {
        s.events.find(
          (e: { collectionIds: string[] }) => e.collectionIds.length
        ).collectionIds = [];
      }
    ],
    [
      "duplicate Collection membership",
      (s: ReturnType<typeof copy>) => {
        s.collections[0].eventIds.push(s.collections[0].eventIds[0]);
      }
    ],
    [
      "unknown Collection member",
      (s: ReturnType<typeof copy>) => {
        s.collections[0].eventIds.push("missing");
      }
    ],
    [
      "invented temporal anchor",
      (s: ReturnType<typeof copy>) => {
        s.input.explicitExtents[0].eventId = "missing";
      }
    ],
    [
      "duplicate temporal anchor",
      (s: ReturnType<typeof copy>) => {
        s.input.explicitExtents.push(s.input.explicitExtents[0]);
      }
    ],
    [
      "reversed temporal bounds",
      (s: ReturnType<typeof copy>) => {
        s.input.explicitExtents[0].minYear =
          s.input.explicitExtents[0].maxYear + 1;
      }
    ],
    [
      "non-finite coordinate",
      (s: ReturnType<typeof copy>) => {
        s.input.explicitExtents[0].minYear = Infinity;
      }
    ],
    [
      "invented visibility of undated Event",
      (s: ReturnType<typeof copy>) => {
        s.input.visibleEventIds.push("unplaced");
      }
    ],
    [
      "modified temporal constraint",
      (s: ReturnType<typeof copy>) => {
        s.input.temporalConstraints[0].minGapYears = 100;
      }
    ],
    [
      "hidden fallback anchor",
      (s: ReturnType<typeof copy>) => {
        s.input.dataset.events[0].anchors = [];
      }
    ],
    [
      "invalid hash format",
      (s: ReturnType<typeof copy>) => {
        s.sourceRootDigest = "unchecked";
      }
    ],
    [
      "overlong ID",
      (s: ReturnType<typeof copy>) => {
        s.worldId = "x".repeat(257);
      }
    ],
    [
      "unexpected metadata",
      (s: ReturnType<typeof copy>) => {
        s.privateAudit = { secret: "example" };
      }
    ]
  ])("rejects %s even when the importer recomputes a hash", (_name, mutate) => {
    const value = copy();
    (mutate as (value: ReturnType<typeof copy>) => void)(value);
    expect(() => validateLabSnapshot(value)).toThrow(
      /lab_snapshot_(schema|semantics)_invalid/
    );
  });

  it("rejects containment cycles even when both metadata and engine links agree", () => {
    const value = copy();
    const parent = "inner-process";
    const child = "outer-process";
    const relationId = `contains:${parent}:${child}`;
    value.relations.push({
      id: relationId,
      sourceId: parent,
      targetId: child,
      type: "contains"
    });
    value.events
      .find((event: { id: string }) => event.id === parent)
      .childIds.push(child);
    value.input.dataset.semanticLinks.push({
      id: relationId,
      type: "contains",
      fromId: parent,
      toId: child
    });
    expect(() => validateLabSnapshot(value)).toThrow(
      "lab_snapshot_semantics_invalid"
    );
  });
});
