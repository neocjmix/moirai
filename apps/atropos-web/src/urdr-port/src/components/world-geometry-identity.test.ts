import { expect, it } from "vitest";
import type { GraphShellChartPlaneEntity } from "../../shared/contracts";
import { shareWorldGeometryEntities as share } from "./world-geometry-identity";
const point: GraphShellChartPlaneEntity = {
  id: "leaf", eventId: "leaf", canonId: "world", label: "Leaf", validationState: "ok", diagnostics: [], viewportClass: "visible",
  contains: [], geometryKind: "point", position: {x: 10, y: 20},
};
const region: GraphShellChartPlaneEntity = {
  ...point, id: "group", eventId: "group", label: "Group", geometryKind: "region",
  contains: ["leaf"], childrenComplete: true, preparedDepth: 1,
  worldBounds: {minX: 0, maxX: 100, minY: 0, maxY: 100},
  preparedWorldHull: [{x: 0, y: 0}, {x: 100, y: 0}, {x: 100, y: 100}],
};
it("keeps source geometry identities across parsed refetch, density changes and transport ordering", () => {
  const first = share([], [point, region]);
  const next = structuredClone([region, point]).map(entity => ({...entity,
    renderDensity: {pointScale: 0.35, opacity: 0.5, labelOpacity: 0},
  }));
  expect(share(first, next)).toBe(first);
  expect(share(first, [...next].reverse())).toBe(first);
});
it("invalidates labels, authored hierarchy, support and actual geometry independently of identity", () => {
  const first = share([], [point, region]);
  for (const modified of [
    {...region, label: "Corrected group"},
    {...region, contains: ["other"]},
    {...region, childrenComplete: false},
    {...region, preparedDepth: 2},
    {...region, preparedWorldHull: [{x: 1, y: 0}, {x: 100, y: 0}, {x: 100, y: 100}]},
  ]) {
    const next = share(first, [point, modified]);
    expect(next).not.toBe(first);
    expect(next.find(entity => entity.id === "leaf")).toBe(point);
    expect(next.find(entity => entity.id === "group")).toBe(modified);
  }
  expect(share(first, [{...point, containedBy: "group"}, region])).not.toBe(first);
  expect(share(first, [{...point, position: {x: 11, y: 20}}, region])).not.toBe(first);
});
it("does not retain omitted identities or invalidate geometry for changed relation paint", () => {
  const first = share([], [point, region]);
  const edge: GraphShellChartPlaneEntity = {...point, id: "edge", geometryKind: "segment", start: {x: 0, y: 0}, end: {x: 1, y: 1}};
  expect(share(first, [point, edge, region])).toBe(first);
  expect(share(first, [point])).toEqual([point]);
  expect(share(first, [])).toEqual([]);
});
