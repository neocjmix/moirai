import { describe, expect, it } from "vitest";
import { flattenGeographicPath, geographicMesh } from "./geographic-mesh";

function filledArea(data: Float32Array) {
  let result = 0;
  for (let i = 0; i < data.length; i += 15) {
    result +=
      Math.abs(
        (data[i + 5]! - data[i]!) * (data[i + 11]! - data[i + 1]!) -
          (data[i + 6]! - data[i + 1]!) * (data[i + 10]! - data[i]!)
      ) / 2;
  }
  return result;
}

describe("authored background tessellation", () => {
  it("fills a concave polygon without the fan's false area, in both winding directions", () => {
    for (const path of [
      "M0 0 L10 0 L10 4 L4 4 L4 10 L0 10 Z",
      "M0 10 L4 10 L4 4 L10 4 L10 0 L0 0 Z"
    ])
      expect(filledArea(geographicMesh(path).fill)).toBeCloseTo(64);
  });
  it("flattens cubic curves and closes without a duplicate zero-length edge", () => {
    const points = flattenGeographicPath("M0 0 C0 10,10 10,10 0 L0 0 Z");
    expect(points.length).toBeGreaterThan(4);
    expect(points.at(-1)).not.toEqual(points[0]);
    expect(
      points.every((p) => p.x >= 0 && p.x <= 10 && p.y >= 0 && p.y <= 7.5)
    ).toBe(true);
  });
  it("keeps stroke extrusion separate from camera scale and discards collapsed fill", () => {
    const result = geographicMesh("M0 0 L10 0 Z");
    expect(result.fill.length).toBe(0);
    expect(result.stroke.length).toBe(60);
    expect(
      [...result.stroke]
        .filter((_, i) => i % 5 === 4)
        .every((side) => Math.abs(side) === 1)
    ).toBe(true);
  });
  it("keeps fill triangles unchanged when feather insets omit stroke allocation", () => {
    for (const path of [
      "M0 0 L10 0 L10 4 L4 4 L4 10 L0 10 Z",
      "M0 10 L4 10 L4 4 L10 4 L10 0 L0 0 Z",
      "M0 0 C0 10,10 10,10 0 L0 0 Z",
      "M0 0 L10 0 Z"
    ]) {
      const full = geographicMesh(path);
      const fillOnly = geographicMesh(path, { stroke: false });
      expect(fillOnly.fill).toEqual(full.fill);
      expect(fillOnly.stroke.byteLength).toBe(0);
      expect(full.stroke.byteLength).toBeGreaterThan(0);
    }
    expect(() =>
      geographicMesh("M0 0 L10 10 L0 10 L10 0 Z", { stroke: false })
    ).toThrow();
  });
  it("rejects unsupported or non-simple geometry instead of painting invented meaning", () => {
    expect(() => geographicMesh("M0 0 A10 10 0 0 0 20 20 Z")).toThrow();
    expect(() => geographicMesh("M0 0 L10 10 L0 10 L10 0 Z")).toThrow();
  });
});
