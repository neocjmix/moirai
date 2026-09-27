import { expect, it } from "vitest";
import {
  advanceCompositeFadePresence as advance,
  reconcileCompositeFadePresence as reconcile,
  pruneExitedCompositeFadePresence as prune
} from "./graph-shell-composite";

const item = (id: string) => ({ id, opacity: 1 });
it("expires old regions during continuous updates instead of waiting for idle", () => {
  let visible = advance(reconcile([], [item("initial")]), 0);
  for (let frame = 1; frame <= 600; frame++) {
    const now = frame * 16;
    visible = advance(reconcile(visible, [item(String(frame))]), now);
    visible = prune(visible, now, 220);
    expect(visible.length).toBeLessThanOrEqual(15);
    for (const region of visible) {
      if (region.visibilityState === "exiting")
        expect(now - region.exitStartedAt!).toBeLessThan(220);
    }
  }
  expect(visible.some((region) => region.id === "initial")).toBe(false);
  visible = prune(visible, 10_000, 220);
  expect(visible.map((region) => region.id)).toEqual(["600"]);
});

it("keeps the original exit deadline across moves, and cancels it on re-entry", () => {
  let visible = advance(reconcile([], [item("a")]), 0);
  visible = advance(reconcile(visible, []), 10);
  expect(visible[0]!.exitStartedAt).toBe(10);
  visible = advance(reconcile(visible, []), 120);
  expect(visible[0]!.exitStartedAt).toBe(10);
  expect(prune(visible, 229)).toHaveLength(1);
  expect(prune(visible, 230)).toHaveLength(0);
  visible = advance(reconcile(visible, [item("a")]), 200);
  expect(visible[0]!.exitStartedAt).toBeUndefined();
  expect(prune(visible, 1000)).toHaveLength(1);
  visible = advance(reconcile(visible, []), 1100);
  expect(visible[0]!.exitStartedAt).toBe(1100);
  expect(prune(visible, 1319)).toHaveLength(1);
  expect(prune(visible, 1320)).toHaveLength(0);
});
