import { expect, it } from "vitest";
import {
  advanceCompositeFadePresence as advance,
  reconcileCompositeFadePresence as reconcile,
  pruneExitedCompositeFadePresence as prune
} from "./graph-shell-composite";

it("does not request another state render on settled camera frames", () => {
  let scene = advance(reconcile([], [
    { id: "visible", opacity: 1 },
    { id: "faded", opacity: 0.35 },
    { id: "hidden", opacity: 0 }
  ]), 0);
  for (let frame = 1; frame <= 600; frame++) {
    scene = reconcile(scene, scene.map(region => ({
      id: region.id,
      opacity: region.opacity
    })));
    expect(advance(scene, frame * 16)).toBe(scene);
  }
});

it("advances changed opacity and entering regions while keeping settled items", () => {
  const settled = advance(reconcile([], [
    { id: "fixed", opacity: 1 },
    { id: "zooming", opacity: 0.35 }
  ]), 0);
  const next = reconcile(settled, [
    { id: "fixed", opacity: 1 },
    { id: "zooming", opacity: 0.65 },
    { id: "entering", opacity: 1 }
  ]);
  const advanced = advance(next, 16);
  expect(advanced).not.toBe(next);
  expect(advanced[0]).toBe(next[0]);
  expect(advanced[1]).not.toBe(next[1]);
  expect(advanced[1]?.renderedOpacity).toBe(0.65);
  expect(advanced[2]).toMatchObject({
    renderedOpacity: 1,
    visibilityState: "present"
  });
  expect(advance(advanced, 32)).toBe(advanced);
});

it("starts an exit once and retains its deadline until prune or re-entry", () => {
  const settled = advance(reconcile([], [{ id: "a", opacity: 1 }]), 0);
  const exiting = reconcile(settled, []);
  const advanced = advance(exiting, 10);
  expect(advanced).not.toBe(exiting);
  expect(advanced[0]).toMatchObject({
    renderedOpacity: 0,
    visibilityState: "exiting",
    exitStartedAt: 10
  });
  expect(advance(advanced, 100)).toBe(advanced);
  expect(prune(advanced, 229, 220)).toBe(advanced);
  expect(prune(advanced, 230, 220)).toEqual([]);

  const returning = reconcile(advanced, [{ id: "a", opacity: 1 }]);
  const returned = advance(returning, 200);
  expect(returned).not.toBe(returning);
  expect(returned[0]).toMatchObject({renderedOpacity: 1, visibilityState: "present"});
  expect(returned[0]?.exitStartedAt).toBeUndefined();
  expect(advance(returned, 300)).toBe(returned);
});
