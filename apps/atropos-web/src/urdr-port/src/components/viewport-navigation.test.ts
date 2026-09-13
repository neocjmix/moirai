import { expect, it } from "vitest";
import {
  composeNavigationBounds,
  constrainNavigation,
  restoreNavigation
} from "./viewport-navigation";
const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 10000 },
  size = { width: 400, height: 800 };
const view = { x: -500, y: -5000, scaleX: 1, scaleY: 1 };
it("uses full Canon bounds and the same horizontal composition gap", () => {
  expect(
    composeNavigationBounds(
      [
        { canonId: "a", bounds, widthHint: 1100, ready: true },
        { canonId: "b", bounds, widthHint: 1100, ready: true }
      ],
      ["a", "b"]
    )
  ).toEqual({ ...bounds, maxX: 2340 });
  expect(
    composeNavigationBounds(
      [{ canonId: "a", bounds, widthHint: 1100, ready: false }],
      ["a"]
    )
  ).toBeNull();
});
it("adds bounded resistance and settles inside the content boundary", () => {
  const raw = { ...view, x: 100000, y: -100000 };
  const rubber = constrainNavigation(raw, size, bounds, true);
  expect(rubber.x).toBeGreaterThan(0);
  expect(rubber.x).toBeLessThanOrEqual(size.width * 0.18);
  expect(rubber.y).toBeGreaterThanOrEqual(-10000 - size.height * 0.18);
  expect(constrainNavigation(rubber, size, bounds)).toEqual({
    ...view,
    x: -0,
    y: -10000
  });
  expect(constrainNavigation(view, size, bounds)).toEqual(view);
});
it("limits independent zoom-out and keeps a finite span for a single point", () => {
  const result = constrainNavigation(
    { ...view, scaleX: 0.0001, scaleY: 0.0001 },
    size,
    bounds
  );
  expect(result.scaleX).toBe(0.2);
  expect(result.scaleY).toBe(0.04);
  expect(
    constrainNavigation({ ...view, scaleX: 0.0001, scaleY: 0.0001 }, size, {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0
    }).scaleY
  ).toBe(1);
});
it("restores far-away URLs to focus or fit and preserves ordinary views", () => {
  const raw = { ...view, x: 1e9, y: 1e9 };
  const focused = restoreNavigation(raw, size, bounds, { x: 200, y: 300 });
  expect(focused.x).toBe(-200);
  expect(focused.y).toBe(-300);
  const fit = restoreNavigation(raw, size, bounds, null);
  expect(fit.scaleX).toBe(0.2);
  expect(fit.scaleY).toBe(0.04);
  expect(restoreNavigation(view, size, bounds, null)).toEqual(view);
});
it("preserves the pinch world point when a scale hits its minimum away from the boundary", () => {
  const pivot = { x: 50, y: 30 };
  const raw = { x: -40, y: -150, scaleX: 0.1, scaleY: 0.03 };
  const result = constrainNavigation(raw, size, bounds, false, pivot);
  expect((pivot.x - result.x) / result.scaleX).toBeCloseTo(
    (pivot.x - raw.x) / raw.scaleX
  );
  expect((pivot.y - result.y) / result.scaleY).toBeCloseTo(
    (pivot.y - raw.y) / raw.scaleY
  );
});
