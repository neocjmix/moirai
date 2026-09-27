import { expect, it } from "vitest";
import { compositePointDisplay } from "./composite-point-display";
const box = (width: number, height = width) => [{x:10,y:20},{x:10+width,y:20+height}];
it("uses a small screen footprint, retaining a wide or tall region", () => {
  expect(compositePointDisplay(box(30))).toEqual({x:25,y:35});
  expect(compositePointDisplay(box(100,10))).toBeNull();
  expect(compositePointDisplay(box(10,100))).toBeNull();
});
it("keeps a stable representation near the boundary and restores the area when zoomed in", () => {
  expect(compositePointDisplay(box(32))).not.toBeNull();
  expect(compositePointDisplay(box(40), true)).not.toBeNull();
  expect(compositePointDisplay(box(40), false)).toBeNull();
  expect(compositePointDisplay(box(49), true)).toBeNull();
});
