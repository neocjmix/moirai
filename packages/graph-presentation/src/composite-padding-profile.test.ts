import { describe, expect, it } from "vitest";
import { buildCompositePaddingProfile } from "./composite-padding-profile.js";

describe("local Composite padding depth", () => {
  it("keeps deep sections local instead of padding the full parent by maximum depth", () => {
    const deepest = buildCompositePaddingProfile({ minY: 45, maxY: 55 }, []);
    const child = buildCompositePaddingProfile({ minY: 20, maxY: 70 }, [
      deepest
    ]);
    expect(
      buildCompositePaddingProfile({ minY: 0, maxY: 100 }, [child])
    ).toEqual([
      { minY: 0, maxY: 20, depth: 1 },
      { minY: 20, maxY: 45, depth: 2 },
      { minY: 45, maxY: 55, depth: 3 },
      { minY: 55, maxY: 70, depth: 2 },
      { minY: 70, maxY: 100, depth: 1 }
    ]);
  });
  it("does not turn sibling overlap into deeper authored nesting", () => {
    const children = [
      { minY: 20, maxY: 60 },
      { minY: 40, maxY: 80 }
    ].map((bounds) => buildCompositePaddingProfile(bounds, []));
    const profile = buildCompositePaddingProfile(
      { minY: 0, maxY: 100 },
      children
    );
    expect(profile).toEqual([
      { minY: 0, maxY: 20, depth: 1 },
      { minY: 20, maxY: 80, depth: 2 },
      { minY: 80, maxY: 100, depth: 1 }
    ]);
    expect(
      buildCompositePaddingProfile(
        { minY: 0, maxY: 100 },
        children.toReversed()
      )
    ).toEqual(profile);
  });
  it("preserves same-time nesting and full profiles across JSON restoration", () => {
    const child = buildCompositePaddingProfile({ minY: 50, maxY: 50 }, []);
    expect(
      buildCompositePaddingProfile({ minY: 0, maxY: 100 }, [
        JSON.parse(JSON.stringify(child))
      ])
    ).toEqual([
      { minY: 0, maxY: 50, depth: 1 },
      { minY: 50, maxY: 50, depth: 2 },
      { minY: 50, maxY: 100, depth: 1 }
    ]);
  });
});
