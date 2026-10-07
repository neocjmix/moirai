import { expect, it } from "vitest";
import { compositePointDisplay, compositeRepresentationDisplay, compositePointDensityDisplay } from "./composite-point-display";
import { pointDensityDisplay, withParentPointHandoff } from "./point-density-display";
const box = (width: number, height = width) => [{x:10,y:20},{x:10+width,y:20+height}];
it("retains more actual hull before entering the point and reverses with bounded hysteresis", () => {
  expect(compositePointDisplay(box(12))).toEqual({x:16,y:26});
  expect(compositePointDisplay(box(100,10))).toBeNull();
  expect(compositePointDisplay(box(10,100))).toBeNull();
  expect(compositePointDisplay(box(16), true)).not.toBeNull();
  expect(compositePointDisplay(box(16), false)).toBeNull();
  expect(compositePointDisplay(box(21), true)).toBeNull();
  expect(compositePointDisplay(box(20), false)).toBeNull();
});
it("keeps reversible hull/point coverage continuous through the borderless translucent band", () => {
  const spans = [3, 6, 10, 12, 14, 16, 18, 20, 28, 32, 38, 44, 64];
  const forward = spans.map(span => compositeRepresentationDisplay(box(span))!);
  const reversed = [...spans].reverse().map(span => compositeRepresentationDisplay(box(span))!).reverse();
  expect(reversed).toEqual(forward);
  expect(forward[0]).toMatchObject({hullOpacity: 0, pointOpacity: 1});
  expect(compositeRepresentationDisplay(box(16))).toMatchObject({hullOpacity: 0.5, hullStrokeOpacity: 0, pointOpacity: 0.5});
  expect(forward.at(-1)).toMatchObject({hullOpacity: 1, hullStrokeOpacity: 1, hullFillOpacity: 1, pointOpacity: 0});
  for (let i=1; i<forward.length; i++) {
    expect(forward[i]!.hullOpacity).toBeGreaterThanOrEqual(forward[i-1]!.hullOpacity);
    expect(forward[i]!.hullStrokeOpacity).toBeGreaterThanOrEqual(forward[i-1]!.hullStrokeOpacity);
    expect(forward[i]!.hullOpacity + forward[i]!.pointOpacity).toBe(1);
  }
  for (const span of [20, 24, 28, 32]) {
    expect(compositeRepresentationDisplay(box(span))).toMatchObject({hullOpacity: 1, hullStrokeOpacity: 0, hullFillOpacity: 0.62, pointOpacity: 0});
  }
  expect(compositeRepresentationDisplay(box(38))).toMatchObject({hullOpacity: 1, hullStrokeOpacity: 0.5, hullFillOpacity: 0.81});
});
it("large point, small point and hidden are ordered by span even when density rank would hide the replacement", () => {
  const rankedHidden = {pointScale:0.2,opacity:0,labelOpacity:0};
  const point = (span:number) => compositePointDensityDisplay(compositeRepresentationDisplay(box(span)), rankedHidden);
  expect(point(12)).toMatchObject({radius:6,opacity:1,state:"point"});
  expect(point(8).radius).toBeGreaterThan(point(6).radius);
  expect(point(8).radius).toBeLessThan(point(12).radius);
  expect(point(6)).toMatchObject({opacity:1,strokeWidth:0,state:"small-point"});
  expect(point(2)).toMatchObject({opacity:0.5,strokeWidth:0,state:"small-point"});
  expect(point(1)).toMatchObject({opacity:0,state:"hidden"});
});
it("child points shrink and labels leave while the parent still has hull coverage", () => {
  const expanded = compositeRepresentationDisplay(box(40))!;
  const handoff = compositeRepresentationDisplay(box(28))!;
  const collapsed = compositeRepresentationDisplay(box(16))!;
  expect(expanded.childrenOpacity).toBe(1);
  expect(handoff.childrenOpacity).toBe(0.5);
  expect(handoff.hullOpacity).toBe(1);
  expect(collapsed.childrenOpacity).toBe(0);
  expect(collapsed.hullOpacity + collapsed.pointOpacity).toBe(1);
  const child = withParentPointHandoff(pointDensityDisplay(), handoff.childrenOpacity);
  expect(child.radius).toBeGreaterThan(2);
  expect(child.radius).toBeLessThan(6);
  expect(child.labelOpacity).toBeLessThan(handoff.childrenOpacity);
  expect(child.state).toBe("small-point");
  expect(withParentPointHandoff(pointDensityDisplay(), 0).state).toBe("hidden");
  // A wide short parent must not suppress its children by Y height alone.
  expect(compositeRepresentationDisplay(box(100, 8))!.childrenOpacity).toBe(1);
});
it("keeps the pending point visible and suppresses premature child paint on cold restore", () => {
  const pending = compositeRepresentationDisplay(box(100), true)!;
  const ready = compositeRepresentationDisplay(box(100))!;
  expect(pending.point).toEqual(ready.point);
  expect(pending).toMatchObject({hullOpacity:0,hullStrokeOpacity:0,pointOpacity:1,childrenOpacity:0});
  expect(compositePointDensityDisplay(pending, {pointScale:0.2,opacity:0,labelOpacity:0}).opacity).toBe(1);
  expect(ready).toMatchObject({hullOpacity:1,hullStrokeOpacity:1,pointOpacity:0,childrenOpacity:1});
  expect(compositeRepresentationDisplay([])).toBeNull();
});
it("preserves co-located authored Composites as colored point candidates at every zoom", () => {
  const representation = compositeRepresentationDisplay(box(0))!;
  expect(representation).toMatchObject({degenerate:true,hullOpacity:0,pointOpacity:1,pointVisibility:1});
  expect(compositePointDensityDisplay(representation)).toMatchObject({radius:6,opacity:1,state:"point"});
  expect(compositePointDensityDisplay(representation, {pointScale:0.35,opacity:1,labelOpacity:0})).toMatchObject({opacity:1,strokeWidth:0,state:"small-point"});
});
