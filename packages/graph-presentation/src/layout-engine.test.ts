import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  computeLayout,
  defaultLayoutSelection,
  type LayoutInput
} from "./layout-engine.js";
import { buildGraphShellChartPlane } from "./urdr-chart-plane.js";

const fixture = (): LayoutInput => {
  const input: LayoutInput = {
    formatVersion: "layout-input/1",
    worldId: "fixture",
    revision: 7,
    timeSystemId: "scalar",
    temporalDigest: "fixed-temporal-evidence",
    board: {
      axis: {
        startYear: 0,
        endYear: 0,
        timeSystemId: "scalar",
        compatibilityKey: "scalar"
      }
    },
    dataset: {
      events: [
        "a",
        "b",
        "c",
        "d-unplaced",
        "z-inner",
        "z-overlap",
        "zz-outer"
      ].map((id) => ({
        id,
        title: id,
        canonId: "fixture",
        type: id.startsWith("z") ? "composite" : "instant"
      })),
      canons: [],
      timeSystems: [],
      structuralLinks: [],
      semanticLinks: [
        ["z-inner", "a"],
        ["z-inner", "b"],
        ["z-overlap", "b"],
        ["z-overlap", "c"],
        ["zz-outer", "z-inner"],
        ["zz-outer", "z-overlap"]
      ]
        .map(([fromId, toId]) => ({
          id: `${fromId}:${toId}`,
          type: "contains",
          fromId: fromId!,
          toId: toId!
        }))
        .concat([{ id: "cause", type: "causes", fromId: "a", toId: "c" }])
    },
    explicitExtents: [
      { eventId: "a", minYear: 1500, maxYear: 1500 },
      { eventId: "b", minYear: 1500, maxYear: 1500 },
      { eventId: "c", minYear: 1900, maxYear: 1900 }
    ],
    temporalConstraints: [
      { beforeId: "a", afterId: "c", source: "order", minGapYears: 0.001 }
    ],
    visibleEventIds: ["a", "b", "c", "z-inner", "z-overlap", "zz-outer"]
  };
  return input;
};
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
describe("frozen pre-v1 production layout boundary", () => {
  it("preserves the pinned low-level default geometry for all-pair and bounded branches", () => {
    for (const size of [7, 501]) {
      const input = fixture();
      input.dataset.events.push(
        ...Array.from({ length: size - 7 }, (_, index) => ({
          id: `unplaced-${index}`,
          canonId: "fixture",
          title: "unplaced",
          type: "instant"
        }))
      );
      const chart = buildGraphShellChartPlane(input.dataset, input.board, {
        explicitExtents: new Map(
          input.explicitExtents.map(({ eventId, minYear, maxYear }) => [
            eventId,
            { minYear, maxYear }
          ])
        ),
        temporalConstraints: [...input.temporalConstraints],
        ...(size > 500
          ? { boundedRepulsion: { neighborsPerSide: 24, windowYears: 10 } }
          : {})
      });
      const output = computeLayout(
        freeze(input),
        defaultLayoutSelection("legacy-force")
      );
      expect(output.algorithm_version).toBe(
        size > 500 ? "v5-world-layout/2" : "v5-world-layout/1"
      );
      for (const shape of output.shapes) {
        const legacy = chart.entities.find(
          (entity) => entity.id === shape.event_id
        )!;
        if (shape.kind === "point" && legacy.geometryKind === "point")
          expect(shape.position).toEqual(legacy.position);
        else if (shape.kind === "region" && legacy.geometryKind === "region")
          expect(shape.bounds).toEqual(legacy.worldBounds);
        else throw Error("geometry_kind_drift");
      }
    }
  });
  it("repeats from frozen input and restores JSON selections without mutation", () => {
    const input = freeze(fixture());
    const before = JSON.stringify(input);
    const selection = freeze(defaultLayoutSelection());
    const first = computeLayout(input, selection);
    expect(computeLayout(input, JSON.parse(JSON.stringify(selection)))).toEqual(
      first
    );
    expect(JSON.stringify(input)).toBe(before);
    expect(first.unplaced_event_ids).toEqual(["d-unplaced"]);
  });

  it("rejects unknown versions, cross-algorithm parameters, invalid numbers and hidden seeds", () => {
    const input = fixture(),
      selection = defaultLayoutSelection();
    expect(() =>
      computeLayout(input, { ...selection, algorithmVersion: "unknown" })
    ).toThrow();
    expect(() =>
      computeLayout(input, {
        ...selection,
        parameters: { ...selection.parameters, iterations: 64 }
      })
    ).toThrow();
    expect(() =>
      computeLayout(input, {
        ...selection,
        parameters: { ...selection.parameters, repulsion: NaN }
      })
    ).toThrow();
    expect(() =>
      computeLayout(input, { ...selection, seed: 42 as never })
    ).toThrow();
  });
  it("keeps the browser entry dependency closure free from Node, canonical adapters and publication modules", () => {
    const seen = new Set<string>();
    const visit = (path: string) => {
      if (seen.has(path)) return;
      seen.add(path);
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(
        /(?:import|export)\s+(?!type\b)[\s\S]*?from\s+["']([^"']+)["']/g
      )) {
        const dependency = match[1]!;
        expect(dependency).not.toMatch(
          /^(node:|@moirai\/(domain|projections|publication|persistence|lachesis))/
        );
        if (dependency.startsWith("."))
          visit(resolve(dirname(path), dependency.replace(/\.js$/, ".ts")));
      }
    };
    visit(resolve("packages/graph-presentation/src/layout-engine.ts"));
  });
});
