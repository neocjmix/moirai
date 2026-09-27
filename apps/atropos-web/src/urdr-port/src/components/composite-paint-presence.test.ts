import { expect, it } from "vitest";
import { selectCompositePaintTargets as select } from "./composite-paint-presence";
import {
  advanceCompositeFadePresence as advance,
  reconcileCompositeFadePresence as reconcile,
  pruneExitedCompositeFadePresence as prune,
  reconcileCompositeColorAssignments as colors
} from "./graph-shell-composite";

const item = (opacity = 1, surfaceOpacity = 1) => ({
  id: "a",
  opacity,
  surfaceOpacity
});
it("excludes only fully invisible paint and retains compact points and arbitrarily small nonzero fades", () => {
  const input = [
    item(0),
    item(1, 0),
    item(0.000001),
    { ...item(1, 0), compactPoint: { x: 0, y: 0 } }
  ];
  expect(select(input)).toEqual([input[2], input[3]]);
  expect(input).toHaveLength(4);
});
it("lets labels finish their existing exit, prunes during continued navigation and fades in on return", () => {
  let visible = advance(reconcile([], select([item()])), 0);
  const hidden = [item(1, 0)];
  visible = reconcile(visible, select(hidden));
  expect(visible[0]!.renderedOpacity).toBe(1);
  visible = advance(visible, 10);
  expect(prune(visible, 229)).toHaveLength(1);
  expect(prune(visible, 230)).toHaveLength(0);
  for (let frame = 1; frame <= 600; frame++) {
    visible = prune(
      advance(reconcile(visible, select(hidden)), 10 + frame * 16),
      10 + frame * 16
    );
    if (frame >= 14) expect(visible).toHaveLength(0);
  }
  visible = reconcile(visible, select([item()]));
  expect(visible[0]!.visibilityState).toBe("entering");
  expect(visible[0]!.renderedOpacity).toBe(0);
  expect(advance(visible, 10000)[0]!.renderedOpacity).toBe(1);
});
it("preserves a current region's assigned color even after its transparent SVG leaves", () => {
  const before = colors([], ["a", "b"], ["a", "b"]);
  const hidden = colors(before, ["b"], ["a", "b"]);
  const returned = colors(hidden, ["a", "b"], ["a", "b"]);
  expect(returned).toEqual(before);
});
