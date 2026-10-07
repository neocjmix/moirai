import { describe, expect, it } from "vitest";
import {
  canReuseGeographicMesh,
  geographicMeshFrame,
  geographicPaintTransform,
  geographicPathControls,
  geographicTweenValue,
  reusableGeographicPaintTransform
} from "./geographic-mesh-reuse";

const identity = [1, 1, 0, 0] as const;
const path = "M0 0 C2 3 7 3 10 0 L10 10 L0 10 Z";
const controls = geographicPathControls(path)!;

describe("bounded background mesh reuse", () => {
  it("parses exact cubic controls and rejects unsupported or invalid topology", () => {
    expect(controls.topology).toBe("MCLLZ");
    expect([...controls.coordinates]).toEqual([
      0, 0, 2, 3, 7, 3, 10, 0, 10, 10, 0, 10
    ]);
    for (const unsupported of [
      "M0 0 L1 Infinity Z",
      "M0 0 L1 1e999 Z",
      "M0 0 Q2 2 4 0 Z",
      "M0 0 M1 1 Z",
      "M0 0 L1 1",
      "m0 0 l1 1 z",
      "M0 0 Z L1 1",
      "M0 0 C2 3 7 3 10 Z"
    ])
      expect(geographicPathControls(unsupported)).toBeNull();
  });

  it("composes unequal camera axes, original viewport and path translation", () => {
    const view = { x: 10, y: 20, scaleX: 2, scaleY: 4 };
    const size = { width: 100, height: 200 };
    const frame = geographicMeshFrame(view, size, "translate(7 -9)")!;
    view.x = 1000;
    size.width = 1000;
    const transform = geographicPaintTransform(
      frame,
      { x: 30, y: 40, scaleX: 2.2, scaleY: 3.6 },
      { width: 140, height: 220 }
    )!;
    expect(transform[0]).toBeCloseTo(1.1);
    expect(transform[1]).toBeCloseTo(0.9);
    expect(transform[2]).toBeCloseTo(41.7);
    expect(transform[3]).toBeCloseTo(33.9);
    expect(
      canReuseGeographicMesh(controls, controls, transform, transform)
    ).toBe(true);
    expect(geographicMeshFrame(view, size, "matrix(1,0,0,1,0,0)")).toBeNull();
    expect(geographicMeshFrame({ ...view, scaleX: 0 }, size)).toBeNull();
    expect(
      geographicPaintTransform(frame, { ...view, x: Infinity }, size)
    ).toBeNull();
  });

  it("rejects cubic handle movement even when every endpoint is unchanged", () => {
    const moved = geographicPathControls("M0 0 C3 3 7 3 10 0 L10 10 L0 10 Z");
    expect(canReuseGeographicMesh(controls, moved, identity, identity)).toBe(
      false
    );
    expect(
      canReuseGeographicMesh(
        controls,
        geographicPathControls("M0 0 L10 0 L10 10 L0 10 Z"),
        identity,
        identity
      )
    ).toBe(false);
  });

  it("uses Euclidean screen distance and rejects nonfinite controls", () => {
    expect(
      canReuseGeographicMesh(controls, controls, identity, [1, 1, 0.6, 0.6])
    ).toBe(false);
    expect(
      canReuseGeographicMesh(controls, controls, identity, [1, 1, 0.75, 0])
    ).toBe(true);
    const nonfinite = {
      ...controls,
      coordinates: controls.coordinates.slice()
    };
    nonfinite.coordinates[3] = NaN;
    expect(
      canReuseGeographicMesh(controls, nonfinite, identity, identity)
    ).toBe(false);
  });

  it("bounds scale from the original anchor and never accumulates successive drift", () => {
    expect(
      canReuseGeographicMesh(
        controls,
        controls,
        [1.201, 1, 0, 0],
        [1.201, 1, 0, 0]
      )
    ).toBe(false);
    expect(
      canReuseGeographicMesh(
        controls,
        controls,
        [1, 0.799, 0, 0],
        [1, 0.799, 0, 0]
      )
    ).toBe(false);
    expect(
      canReuseGeographicMesh(controls, controls, identity, [1, 1, 0.4, 0])
    ).toBe(true);
    // A second 0.4px move must still compare to the original0px anchor.
    expect(
      canReuseGeographicMesh(controls, controls, identity, [1, 1, 0.8, 0])
    ).toBe(false);
  });

  it("draws identical path strings in their current exact frame, not the old anchor", () => {
    const changedFrame = [2, 0.5, 140, -70] as const;
    expect(
      reusableGeographicPaintTransform(
        path,
        path,
        controls,
        controls,
        identity,
        changedFrame
      )
    ).toBe(changedFrame);
    expect(
      reusableGeographicPaintTransform(
        path,
        path + " ",
        controls,
        controls,
        identity,
        changedFrame
      )
    ).toBeNull();
    expect(
      reusableGeographicPaintTransform(
        path,
        path,
        controls,
        controls,
        identity,
        [1, 1, NaN, 0]
      )
    ).toBeNull();
  });
});

describe("background opacity settlement", () => {
  it("keeps the fade until settlement, then returns exact zero so pigment can stop", () => {
    expect(geographicTweenValue(1, 0, 0.5)).toBeCloseTo(0.125);
    expect(geographicTweenValue(1, 0, 0.99)).toBe(0);
    expect(geographicTweenValue(0, 1, 0.99)).toBe(1);
    expect(geographicTweenValue(0.3, 0, 1)).toBe(0);
  });
});
