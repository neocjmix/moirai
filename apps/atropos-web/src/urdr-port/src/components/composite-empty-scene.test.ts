import { expect, it } from "vitest";
import { reconcileCompositeColorAssignments as colors, reconcileCompositeFadePresence as reconcile, advanceCompositeFadePresence as advance, type CompositeColorAssignment, type CompositeFadePresence } from "./graph-shell-composite";

it("keeps empty async scene effects idempotent", () => {
  const palette: CompositeColorAssignment[] = [];
  const scene: CompositeFadePresence<{id:string;opacity:number}>[] = [];
  for (let frame = 0; frame < 50; frame++) {
    expect(colors(palette, [], [])).toBe(palette);
    expect(reconcile(scene, [])).toBe(scene);
    expect(advance(scene, frame * 16)).toBe(scene);
  }
});
it("preserves palette reference through equivalent fresh inputs, then updates on real changes", () => {
  const palette = colors([], ["a", "b"], ["a", "b"]);
  expect(colors(palette, ["b", "a"], ["a", "b"])).toBe(palette);
  expect(colors(palette, ["a"], ["a", "b"])).toBe(palette);
  const changed = colors(palette, ["a"], ["a"]);
  expect(changed).not.toBe(palette);
  expect(changed.map(item => item.id)).toEqual(["a"]);
  expect(colors(changed, ["a"], ["a"])).toBe(changed);
});
