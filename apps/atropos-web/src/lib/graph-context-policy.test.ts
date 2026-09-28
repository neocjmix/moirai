import { describe, expect, it } from "vitest";
import {
  selectGraphContext,
  polygonContainsCenter,
  type ContextCandidate
} from "./graph-context-policy";
import { collectionDiscoveryConfig } from "./collection-discovery-config";

const candidate = (
  id: string,
  changes: Partial<ContextCandidate> = {}
): ContextCandidate => ({
  id,
  label: id,
  coverage: 1,
  centerInside: true,
  supportComplete: true,
  contains: [],
  ...changes
});

describe("A5 registered context fixtures", () => {
  it("keeps the flag reversible and resolved without browser state", () => {
    expect(collectionDiscoveryConfig(undefined, undefined).contextHud).toBe(
      true
    );
    expect(collectionDiscoveryConfig("legacy", undefined).contextHud).toBe(
      false
    );
    expect(collectionDiscoveryConfig(undefined, "legacy").contextHud).toBe(
      false
    );
    expect(collectionDiscoveryConfig("context", "legacy").contextHud).toBe(
      true
    );
  });
  it("hands off a full viewport and rejects partial, off-center or tiny geometry", () => {
    expect(selectGraphContext([candidate("full")])?.id).toBe("full");
    for (const changes of [
      { supportComplete: false },
      { centerInside: false },
      { coverage: 0.2 }
    ])
      expect(selectGraphContext([candidate("x", changes)])).toBeNull();
    expect(selectGraphContext([])).toBeNull();
  });
  it.each([1, 4, 16])(
    "chooses the specific contains descendant among %i ancestors",
    (count) => {
      const values = Array.from({ length: count }, (_, i) =>
        candidate(String(i), { contains: i + 1 < count ? [String(i + 1)] : [] })
      );
      expect(selectGraphContext(values)?.id).toBe(String(count - 1));
      expect(selectGraphContext(values.reverse())?.id).toBe(String(count - 1));
    }
  );
  it("does not invent a winner for unrelated overlap, even with a prior topic", () => {
    expect(
      selectGraphContext([candidate("a"), candidate("b")], "a")
    ).toBeNull();
  });
  it("retains an established context across small coverage jitter", () => {
    expect(selectGraphContext([candidate("a", { coverage: 0.32 })])).toBeNull();
    expect(
      selectGraphContext([candidate("a", { coverage: 0.32 })], "a")?.id
    ).toBe("a");
    expect(
      selectGraphContext([candidate("a", { coverage: 0.29 })], "a")
    ).toBeNull();
  });
  it("uses polygon containment rather than a bounding box", () => {
    expect(
      polygonContainsCenter(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 0, y: 20 }
        ],
        { width: 100, height: 100 }
      )
    ).toBe(false);
    expect(
      polygonContainsCenter(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 }
        ],
        { width: 100, height: 100 }
      )
    ).toBe(true);
  });
});
