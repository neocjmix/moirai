import { describe, expect, it } from "vitest";
import { pointDensityDisplay } from "./point-density-display";

describe("point density presentation", () => {
  it("preserves existing normal Event and compact Composite points by default", () => {
    expect(pointDensityDisplay()).toMatchObject({radius: 6, opacity: 1, labelOpacity: 1, showLabel: true, interactive: true, state: "point"});
  });
  it("draws a small dot with no label or primary hit target", () => {
    expect(pointDensityDisplay({pointScale: 0.35, opacity: 1, labelOpacity: 0})).toMatchObject({radius: expect.closeTo(2.1), opacity: 1, showLabel: false, interactive: false, state: "small-point"});
  });
  it("hides paint and interaction while preserving the entity for reversal", () => {
    expect(pointDensityDisplay({pointScale: 0, opacity: 0, labelOpacity: 0})).toMatchObject({radius: 0, opacity: 0, showLabel: false, interactive: false, state: "hidden"});
  });
  it("supports continuous size and opacity values in both zoom directions", () => {
    const densities = [1, 0.8, 0.5, 0.35, 0.2, 0];
    const forward = densities.map(pointScale => pointDensityDisplay({pointScale, opacity: pointScale / 1, labelOpacity: pointScale}));
    const reverse = [...densities].reverse().map(pointScale => pointDensityDisplay({pointScale, opacity: pointScale / 1, labelOpacity: pointScale})).reverse();
    expect(reverse).toEqual(forward);
    for (let i=1; i<forward.length; i++) {
      expect(forward[i]!.radius).toBeLessThan(forward[i-1]!.radius);
      expect(forward[i]!.opacity).toBeLessThan(forward[i-1]!.opacity);
    }
  });
  it("never density-hides an authored hull", () => {
    expect(pointDensityDisplay({pointScale: 0, opacity: 0, labelOpacity: 0}, false)).toEqual(pointDensityDisplay());
  });
  it("bounds untrusted values and disables faint label hit targets", () => {
    expect(pointDensityDisplay({pointScale: 5, opacity: -1, labelOpacity: 5})).toMatchObject({radius: 6, opacity: 0, interactive: false});
    expect(pointDensityDisplay({pointScale: NaN, opacity: Infinity, labelOpacity: NaN})).toEqual(pointDensityDisplay());
    expect(pointDensityDisplay({pointScale: 0.9, opacity: 1, labelOpacity: 0.1}).interactive).toBe(false);
  });
});
