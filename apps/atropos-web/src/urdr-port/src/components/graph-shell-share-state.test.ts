import { expect, it } from "vitest";
import { restoreNavigation } from "./viewport-navigation";
import {
  createGraphShellViewportSliceFromView,
  createImageViewportViewFromRestorableSlice
} from "./graph-shell-share-state";

it("restores the broad temporal World fit without replacing it with the origin", () => {
  const size = { width: 390, height: 664 };
  const bounds = { minX: 0, maxX: 119, minY: 30800, maxY: 275741 };
  const fitted = restoreNavigation(
    { x: -999000, y: -999000, scaleX: 1, scaleY: 1 },
    size,
    bounds,
    null
  );
  expect(fitted.scaleY).toBeLessThan(0.01);
  const saved = createGraphShellViewportSliceFromView(fitted, size);
  expect(saved).not.toBeNull();
  const restored = createImageViewportViewFromRestorableSlice(saved, size);
  expect(restored).not.toBeNull();
  expect(restored!.scaleY).toBeCloseTo(fitted.scaleY, 10);
  expect(restored!.y).toBeCloseTo(fitted.y, 10);
  expect(restoreNavigation(restored!, size, bounds, null)).toEqual(restored);
});

it("still rejects non-finite or zero viewport spans", () => {
  const size = { width: 390, height: 664 };
  for (const spanY of [0, -1, Infinity, NaN])
    expect(createImageViewportViewFromRestorableSlice({ centerX: 0, centerY: 153270, spanX: 390, spanY }, size)).toBeNull();
});
