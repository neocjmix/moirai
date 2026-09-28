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
  visible: true,
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
  it("hands off a full viewport and rejects incomplete or offscreen geometry", () => {
    expect(selectGraphContext([candidate("full")])?.id).toBe("full");
    for (const changes of [{ supportComplete: false }, { visible: false }])
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
  it("does not invent a winner for unrelated overlap and retains a valid prior topic", () => {
    expect(selectGraphContext([candidate("a"), candidate("b")])).toBeNull();
    expect(selectGraphContext([candidate("a"), candidate("b")], "a")?.id).toBe(
      "a"
    );
  });
  it("selects a lone linear or tiny visible Composite regardless of area or center", () => {
    for (const coverage of [0, 0.001, 0.2, 0.32, 1])
      expect(
        selectGraphContext([
          candidate("line", { coverage, centerInside: false })
        ])?.id
      ).toBe("line");
    expect(
      selectGraphContext([candidate("line", { visible: false })], "line")
    ).toBeNull();
  });
  it("prefers the unique central topic when unrelated candidates compete", () => {
    const values = [
      candidate("edge", { centerInside: false }),
      candidate("center")
    ];
    expect(selectGraphContext(values)?.id).toBe("center");
    expect(selectGraphContext(values.reverse())?.id).toBe("center");
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
