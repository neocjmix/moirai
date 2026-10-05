import { expect, it } from "vitest";
import { compositePointDisplay, compositeRepresentationDisplay } from "./composite-point-display";
const box = (width: number, height = width) => [{x:10,y:20},{x:10+width,y:20+height}];
it("uses a small screen footprint, retaining a wide or tall region", () => {
  expect(compositePointDisplay(box(20))).toEqual({x:20,y:30});
  expect(compositePointDisplay(box(100,10))).toBeNull();
  expect(compositePointDisplay(box(10,100))).toBeNull();
});
it("keeps a stable representation near the boundary and restores the area when zoomed in", () => {
  expect(compositePointDisplay(box(20))).not.toBeNull();
  expect(compositePointDisplay(box(24), true)).not.toBeNull();
  expect(compositePointDisplay(box(24), false)).toBeNull();
  expect(compositePointDisplay(box(29), true)).toBeNull();
  // These formerly collapsed at 32px, or remained compact up to 48px.
  expect(compositePointDisplay(box(30), false)).toBeNull();
  expect(compositePointDisplay(box(40), true)).toBeNull();
});

it("crossfades the same hull and point continuously in both zoom directions", () => {
  const spans = [12, 20, 22, 24, 26, 28, 36, 42, 48, 64];
  const forward = spans.map(span => compositeRepresentationDisplay(box(span))!);
  const reversed = [...spans].reverse().map(span => compositeRepresentationDisplay(box(span))!).reverse();
  expect(reversed).toEqual(forward);
  expect(forward[0]).toMatchObject({hullOpacity: 0, hullStrokeOpacity: 0, pointOpacity: 1});
  expect(forward[3]).toMatchObject({hullOpacity: 0.5, hullStrokeOpacity: 0, pointOpacity: 0.5});
  expect(forward.at(-1)).toMatchObject({hullOpacity: 1, hullStrokeOpacity: 1, pointOpacity: 0});
  for (let i=1; i<forward.length; i++) {
    expect(forward[i]!.hullOpacity).toBeGreaterThanOrEqual(forward[i-1]!.hullOpacity);
    expect(forward[i]!.hullStrokeOpacity).toBeGreaterThanOrEqual(forward[i-1]!.hullStrokeOpacity);
    expect(forward[i]!.hullOpacity + forward[i]!.pointOpacity).toBe(1);
  }
});
it("removes only the outline before blending the colored area into a point", () => {
  for (const span of [28, 30, 32, 36]) {
    expect(compositeRepresentationDisplay(box(span))).toMatchObject({
      hullOpacity: 1, hullStrokeOpacity: 0, pointOpacity: 0,
    });
  }
  expect(compositeRepresentationDisplay(box(42))).toMatchObject({
    hullOpacity: 1, hullStrokeOpacity: 0.5, pointOpacity: 0,
  });
  expect(compositeRepresentationDisplay(box(48))).toMatchObject({
    hullOpacity: 1, hullStrokeOpacity: 1, pointOpacity: 0,
  });
  // Anisotropic zoom must keep a long composite's filled area and outline.
  expect(compositeRepresentationDisplay(box(12, 100))).toMatchObject({
    hullOpacity: 1, hullStrokeOpacity: 1, pointOpacity: 0,
  });
});
it("keeps the point at the same anchor when asynchronous hull geometry arrives", () => {
  const pending = compositeRepresentationDisplay(box(100), true)!;
  const ready = compositeRepresentationDisplay(box(100))!;
  expect(pending.point).toEqual(ready.point);
  expect(pending).toMatchObject({hullOpacity: 0, hullStrokeOpacity: 0, pointOpacity: 1});
  expect(ready).toMatchObject({hullOpacity: 1, hullStrokeOpacity: 1, pointOpacity: 0});
  expect(compositeRepresentationDisplay([])).toBeNull();
});
