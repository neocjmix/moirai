import { expect, it } from "vitest";
import type { GraphShellChartPlaneRegionEntity as Region } from "../../shared/contracts";
import {
  prepareCompositeWorldGeometry,
  selectCompositeWorldRegions
} from "./graph-shell-world";
import { getVisibleWorldBounds, projectWorldPoint } from "./chart-surface";

const bounds = (x: number, size = 10) => ({
  minX: x,
  minY: 0,
  maxX: x + size,
  maxY: size
});
const region = (id: string, contains: string[], x = 0): Region => ({
  id,
  eventId: id,
  canonId: "scope",
  label: id,
  geometryKind: "region",
  contains,
  diagnostics: [],
  validationState: "ok",
  viewportClass: "visible",
  worldBounds: bounds(x)
});

it.each(["convex", "concave"] as const)(
  "%s preserves offscreen child support and reuses original hulls across 600 views",
  (mode) => {
    const points = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
      { id: "c", x: 0, y: 100 }
    ];
    const prepared = prepareCompositeWorldGeometry(
      [
        region("parent", ["child"]),
        region("child", ["a", "b", "c"]),
        region("remote", [], 1000)
      ],
      points,
      mode
    );
    const original = prepared.regions.find((r) => r.id === "child")!;
    expect(Math.max(...original.points.map((p) => p.x))).toBe(100);
    expect(Math.max(...original.points.map((p) => p.y))).toBe(100);
    for (let i = 0; i < 600; i++) {
      const x = i % 2 ? 0 : 1000;
      const selected = selectCompositeWorldRegions(
        prepared,
        bounds(x, 2),
        bounds(x, 3)
      );
      expect(selected.map((r) => r.id)).toEqual(
        x ? ["remote"] : ["child", "parent"]
      );
      for (const item of selected)
        expect(item).toBe(prepared.regions.find((r) => r.id === item.id));
    }
    expect(prepared.regions.find((r) => r.id === "child")!.points).toBe(
      original.points
    );
    expect(prepared.regions.find((r) => r.id === "parent")!.depth).toBe(2);
    expect(
      prepared.regions.find((r) => r.id === "remote")!.points
    ).toHaveLength(4);
  }
);

it("inverse bounds preserve the existing 16-pixel point seed under independent X/Y zoom", () => {
  const size = { width: 390, height: 844 };
  const points = Array.from({ length: 200 }, (_, i) => ({
    id: String(i),
    x: i * 3 - 300,
    y: i * 9 - 900
  }));
  // Regions deliberately have distant stored bounds, so selection depends on point seeds.
  const prepared = prepareCompositeWorldGeometry(
    points.map((p) => region(p.id, [p.id], 10_000)),
    points,
    "convex"
  );
  for (const scaleX of [0.2, 1, 4])
    for (const scaleY of [0.3, 2, 7]) {
      const view = { x: 17, y: -39, scaleX, scaleY };
      const visible = getVisibleWorldBounds(view, size);
      const buffered = {
        minX: visible.minX - 16 / scaleX,
        maxX: visible.maxX + 16 / scaleX,
        minY: visible.minY - 16 / scaleY,
        maxY: visible.maxY + 16 / scaleY
      };
      const expected = points
        .filter((p) => {
          const screen = projectWorldPoint(view, size, p);
          return (
            screen.x >= -16 &&
            screen.x <= size.width + 16 &&
            screen.y >= -16 &&
            screen.y <= size.height + 16
          );
        })
        .map((p) => p.id)
        .sort();
      expect(
        selectCompositeWorldRegions(prepared, visible, buffered)
          .map((r) => r.id)
          .sort()
      ).toEqual(expected);
    }
});

it("derives local depth from legacy child support without globally widening shallow periods", () => {
  const points = [
    { id: "born", x: 0, y: 0 }, { id: "died", x: 0, y: 100 },
    { id: "start", x: 10, y: 40 }, { id: "end", x: 20, y: 60 }
  ];
  const prepared = prepareCompositeWorldGeometry([
    region("life", ["born", "died", "battle"]), region("battle", ["start", "end"])
  ], points, "concave");
  expect(prepared.regions.find((item) => item.id === "life")!.paddingProfile).toEqual([
    { minY: 0, maxY: 40, depth: 1 }, { minY: 40, maxY: 60, depth: 2 }, { minY: 60, maxY: 100, depth: 1 }
  ]);
});

it('preparation culls remote siblings without changing complete parent support', () => {
  const children = Array.from({length:100},(_,i)=>region(`child-${i}`,[],i*100));
  const parent = {...region('parent', children.map(child=>child.id)), worldBounds:bounds(0,10_000)};
  const prepared=prepareCompositeWorldGeometry([parent,...children],[], 'concave');
  expect(selectCompositeWorldRegions(prepared,bounds(0,20),bounds(0,20))).toHaveLength(101);
  expect(selectCompositeWorldRegions(prepared,bounds(0,20),bounds(0,20),true).map(r=>r.id)).toEqual(['child-0','parent']);
  expect(Math.max(...prepared.regions.find(r=>r.id==='parent')!.points.map(point=>point.x))).toBe(9910);
});
