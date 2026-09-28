import { describe, expect, it } from "vitest";
import {
  selectGraphContext,
  polygonContainsCenter,
  contextViewportMetrics,
  rankGraphContexts,
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
  centerDistance: 0,
  viewportSpan: 1,
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
  it("always selects a visible candidate, including incomplete support", () => {
    expect(selectGraphContext([candidate("full")])?.id).toBe("full");
    expect(
      selectGraphContext([candidate("partial", { supportComplete: false })])?.id
    ).toBe("partial");
    expect(
      selectGraphContext([candidate("off", { visible: false })])
    ).toBeNull();
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
  it("breaks ties deterministically rather than erasing the title", () => {
    expect(selectGraphContext([candidate("b"), candidate("a")])?.id).toBe("a");
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
      candidate("edge", { centerInside: false, centerDistance: 0.5 }),
      candidate("center")
    ];
    expect(selectGraphContext(values)?.id).toBe("center");
    expect(selectGraphContext(values.reverse())?.id).toBe("center");
  });
  it("ranks a central linear shape above a remote or viewport-engulfing shape", () => {
    const values = [
      candidate("huge", { viewportSpan: 20 }),
      candidate("line", {
        viewportSpan: 0.8,
        centerDistance: 0.02,
        coverage: 0.001
      }),
      candidate("remote", { centerDistance: 0.8 })
    ];
    expect(rankGraphContexts(values)[0]?.id).toBe("line");
    expect(selectGraphContext(values, "remote")?.id).toBe("line");
    expect(selectGraphContext(values.reverse())?.id).toBe("line");
  });
  it("retains a near-tied previous topic but changes for a clearly stronger candidate", () => {
    expect(
      selectGraphContext(
        [candidate("a"), candidate("b", { centerDistance: 0.01 })],
        "b"
      )?.id
    ).toBe("b");
    expect(
      selectGraphContext(
        [candidate("a"), candidate("b", { centerDistance: 0.5 })],
        "b"
      )?.id
    ).toBe("a");
  });
  it("measures narrow support without area and handles a single point", () => {
    const size = { width: 100, height: 100 };
    expect(
      contextViewportMetrics(
        [
          { x: 50, y: 10 },
          { x: 50, y: 90 }
        ],
        size
      )
    ).toEqual({ centerDistance: 0, viewportSpan: 0.8 });
    expect(contextViewportMetrics([{ x: 50, y: 50 }], size)).toEqual({
      centerDistance: 0,
      viewportSpan: 0
    });
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
