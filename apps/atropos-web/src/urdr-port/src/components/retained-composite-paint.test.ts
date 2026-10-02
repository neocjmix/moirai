import { expect, it } from "vitest";
import { retainedCompositePaintTransform } from "./graph-shell-composite";

it("keeps retained exit geometry aligned with its authored World coordinates", () => {
  const old = {x: 10, y: 20, scaleX: 2, scaleY: 4};
  const next = {x: -5, y: 30, scaleX: 3, scaleY: 2};
  const oldSize = {width: 400, height: 800};
  const nextSize = {width: 500, height: 700};
  const matrix = retainedCompositePaintTransform(old, oldSize, next, nextSize);
  const values = matrix.slice(7, -1).split(" ").map(Number);
  const world = {x: 100, y: -40};
  const oldScreen = {x: 200 + old.x + world.x * old.scaleX, y: 400 + old.y + world.y * old.scaleY};
  expect(oldScreen.x * values[0]! + values[4]!).toBe(250 + next.x + world.x * next.scaleX);
  expect(oldScreen.y * values[3]! + values[5]!).toBe(350 + next.y + world.y * next.scaleY);
  expect(retainedCompositePaintTransform(old, oldSize, old, oldSize)).toBe("matrix(1 0 0 1 0 0)");
});
