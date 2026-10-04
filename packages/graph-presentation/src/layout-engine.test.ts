import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  CANONICAL_LAYOUT_SELECTION,
  computeLayout,
  defaultLayoutSelection,
  layoutAlgorithms,
  type LayoutInput,
  type LayoutOutput
} from "./layout-engine.js";
import { buildGraphShellChartPlane } from "./urdr-chart-plane.js";

const fixture = (): LayoutInput => ({
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
});
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
function temporalGeometry(output: LayoutOutput) {
  return output.shapes.map((shape) =>
    shape.kind === "point"
      ? [shape.event_id, shape.kind, shape.position.y]
      : shape.kind === "region"
        ? [shape.event_id, shape.kind, shape.bounds.minY, shape.bounds.maxY]
        : [shape.event_id, shape.kind, shape.start.y, shape.end.y]
  );
}

describe("shared research/production layout boundary", () => {
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
      const output = computeLayout(freeze(input), CANONICAL_LAYOUT_SELECTION);
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
    for (const algorithm of layoutAlgorithms) {
      const selection = freeze(defaultLayoutSelection(algorithm.id));
      const first = computeLayout(input, selection);
      expect(
        computeLayout(input, JSON.parse(JSON.stringify(selection)))
      ).toEqual(first);
      expect(JSON.stringify(input)).toBe(before);
      expect(first.unplaced_event_ids).toEqual(["d-unplaced"]);
    }
  });
  it("uses distinct schemas and changes point X before nested/overlap envelope derivation, never Y or identities", () => {
    const input = freeze(fixture());
    const baseline = computeLayout(input);
    const selection = defaultLayoutSelection("deterministic-slots");
    const result = computeLayout(input, selection);
    expect(temporalGeometry(result)).toEqual(temporalGeometry(baseline));
    expect(result.shapes).not.toEqual(baseline.shapes);
    expect(Object.keys(selection.parameters)).toEqual([
      "slotSpacing",
      "collisionWindowYears"
    ]);
    const b = result.shapes.find((shape) => shape.event_id === "b")!;
    const outer = result.shapes.find((shape) => shape.event_id === "zz-outer")!;
    expect(b.kind === "point" && b.position.x).toBe(110);
    expect(outer.kind === "region" && outer.bounds.maxX).toBe(110);
    const spaced = computeLayout(input, {
      ...selection,
      parameters: { ...selection.parameters, slotSpacing: 240 }
    });
    expect(
      spaced.shapes.find((shape) => shape.event_id === "zz-outer")
    ).toMatchObject({ bounds: { maxX: 240 } });
    expect(temporalGeometry(spaced)).toEqual(temporalGeometry(result));
  });
  it("exposes effective bounded mode and the v5 structural-causes no-op honestly", () => {
    const input = fixture();
    const baseline = defaultLayoutSelection();
    expect(
      computeLayout(input, {
        ...baseline,
        parameters: { ...baseline.parameters, causesAttraction: 2 }
      })
    ).toEqual(computeLayout(input, baseline));
    const bounded = computeLayout(input, {
      ...baseline,
      parameters: { ...baseline.parameters, repulsionMode: "bounded" }
    });
    expect(bounded.algorithm_version).toBe("v5-world-layout/2");
    expect(bounded.shapes).not.toEqual(computeLayout(input, baseline).shapes);
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
        parameters: defaultLayoutSelection("deterministic-slots").parameters
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
