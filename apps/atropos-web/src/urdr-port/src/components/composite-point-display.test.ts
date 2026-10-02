import { expect, it } from "vitest";
import { compositePointDisplay, compositeRepresentationDisplay } from "./composite-point-display";
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

it("crossfades the same hull and point continuously in both zoom directions", () => {
  const spans = [24, 32, 36, 40, 44, 48, 64];
  const forward = spans.map(span => compositeRepresentationDisplay(box(span))!);
  const reversed = [...spans].reverse().map(span => compositeRepresentationDisplay(box(span))!).reverse();
  expect(reversed).toEqual(forward);
  expect(forward[0]).toMatchObject({hullOpacity: 0, pointOpacity: 1});
  expect(forward[3]).toMatchObject({hullOpacity: 0.5, pointOpacity: 0.5});
  expect(forward.at(-1)).toMatchObject({hullOpacity: 1, pointOpacity: 0});
  for (let i=1; i<forward.length; i++) {
    expect(forward[i]!.hullOpacity).toBeGreaterThanOrEqual(forward[i-1]!.hullOpacity);
    expect(forward[i]!.hullOpacity + forward[i]!.pointOpacity).toBe(1);
  }
});
it("keeps the point at the same anchor when asynchronous hull geometry arrives", () => {
  const pending = compositeRepresentationDisplay(box(100), true)!;
  const ready = compositeRepresentationDisplay(box(100))!;
  expect(pending.point).toEqual(ready.point);
  expect(pending).toMatchObject({hullOpacity: 0, pointOpacity: 1});
  expect(ready).toMatchObject({hullOpacity: 1, pointOpacity: 0});
  expect(compositeRepresentationDisplay([])).toBeNull();
});
