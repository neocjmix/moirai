import { expect, it, vi } from "vitest";
import { createCompositeLabelWidthMeasure, extendCompositeLabelTextPath } from "./composite-label-text-path";
import { resolveCompositeEdgeLabelPlacement } from "./graph-shell-region-geometry";

const pathLength = (points: {x: number; y: number}[]) => points.slice(1).reduce((sum, point, index) =>
  sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0);

it("reserves complete wide Latin and shaped-script glyph widths without changing the selected edge", () => {
  const title = "WWWWW MMMMM WWWWW MMMMM WWWWW MMMMM WWWWW MMMMM";
  const measured = 441.07; // Actual WebKit width of the 13px bold regression title.
  const placement = resolveCompositeEdgeLabelPlacement(
    [{x: 179, y: 220}, {x: 211, y: 220}, {x: 211, y: 252}, {x: 179, y: 252}],
    title.length * 7.5, 18, {width: 390, height: 664},
  );
  for (const [text, actual] of [[title, measured], ["﷽".repeat(12), 900]] as const) {
    const widths = createCompositeLabelWidthMeasure(() => actual);
    const extended = extendCompositeLabelTextPath(placement, widths.width(text), 18);
    const center = Number(extended.textPathStartOffset);
    expect(center - actual / 2).toBeGreaterThan(0);
    expect(pathLength(extended.pathPoints) - center - actual / 2).toBeGreaterThan(0);
    expect(extended.edgeIndex).toBe(placement.edgeIndex);
    expect(extended.labelX).toBe(placement.labelX);
    expect(extended.labelY).toBe(placement.labelY);
  }
});

it("bounds measurements, reuses widths during pan and invalidates them after font changes", () => {
  const measure = vi.fn(() => 100);
  const widths = createCompositeLabelWidthMeasure(measure, 2);
  expect(widths.width("a")).toBe(100);
  expect(widths.width("a")).toBe(100);
  expect(measure).toHaveBeenCalledTimes(1);
  widths.width("b");
  widths.width("c");
  widths.width("a");
  expect(measure).toHaveBeenCalledTimes(4);
  measure.mockReturnValue(120);
  widths.clear();
  expect(widths.width("a")).toBe(120);
  expect(createCompositeLabelWidthMeasure(() => NaN).width("WWW")).toBe(39);
});

it("preserves the full title on a short hull and on an edge with a center near its endpoint", () => {
  for (const points of [
    [{x: 180, y: 220}, {x: 200, y: 220}, {x: 200, y: 240}, {x: 180, y: 240}],
    [{x: -700, y: 220}, {x: 30, y: 220}, {x: 30, y: 250}, {x: -700, y: 250}],
    [{x: 195, y: 250}],
    [],
  ]) {
    const placement = resolveCompositeEdgeLabelPlacement(points, 400, 18, {width: 390, height: 664});
    const original = structuredClone(placement);
    const extended = extendCompositeLabelTextPath(placement, 400, 18);
    const start = Number(extended.textPathStartOffset);
    expect(start).toBeGreaterThanOrEqual(200);
    expect(pathLength(extended.pathPoints) - start).toBeGreaterThanOrEqual(200);
    expect(extended.labelX).toBe(placement.labelX);
    expect(extended.labelY).toBe(placement.labelY);
    expect(placement).toEqual(original);
  }
});

it("keeps the same extended local contour during pan and translates it with the retained frame", () => {
  const placement = resolveCompositeEdgeLabelPlacement(
    [{x: 180, y: 220}, {x: 220, y: 220}, {x: 220, y: 260}, {x: 180, y: 260}],
    400, 18, {width: 390, height: 664},
  );
  const local = placement.pathPoints;
  const initial = extendCompositeLabelTextPath({...placement, pathFrame: {points: local, offset: {x: 0, y: 0}}}, 400, 18);
  for (const offset of [{x: 1, y: -3}, {x: -100, y: 200}]) {
    const moved = extendCompositeLabelTextPath({...placement, pathFrame: {points: local, offset}}, 400, 18);
    expect(moved.pathFrame?.points).toEqual(initial.pathFrame?.points);
    expect(moved.textPathStartOffset).toBe(initial.textPathStartOffset);
    expect(moved.pathPoints).toEqual(initial.pathPoints.map(point => ({x: point.x + offset.x, y: point.y + offset.y})));
  }
});
