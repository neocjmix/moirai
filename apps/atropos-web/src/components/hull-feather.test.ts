import { areaD } from "clipper2-ts";
import { describe, expect, it } from "vitest";
import { flattenGeographicPath, geographicMesh } from "./geographic-mesh";
import { hullFeatherLayers, hullLayerOpacity } from "./hull-feather";

const rectangle = "M0 0 L100 0 L100 80 L0 80 Z";
const area = (paths: readonly string[]) =>
  paths.reduce(
    (sum, path) => sum + Math.abs(areaD(flattenGeographicPath(path))),
    0
  );

describe("bounded borderless Hull feather", () => {
  it("keeps the original path at full strength while bordered", () => {
    expect(hullFeatherLayers(rectangle, 0)).toEqual([
      { contours: [rectangle], weight: 1 }
    ]);
    expect(hullFeatherLayers(rectangle, NaN)).toEqual(
      hullFeatherLayers(rectangle, 0)
    );
  });

  it("fades only the inner perimeter and preserves the fully covered body", () => {
    for (const strength of [0.1, 0.5, 1]) {
      const layers = hullFeatherLayers(rectangle, strength);
      expect(layers).toHaveLength(4);
      expect(layers.reduce((sum, layer) => sum + layer.weight, 0)).toBeCloseTo(
        1
      );
      expect(layers[0]!.contours).toEqual([rectangle]);
      const areas = layers.map((layer) => area(layer.contours));
      expect(areas).toEqual([...areas].sort((a, b) => b - a));
      const inner = flattenGeographicPath(layers[3]!.contours[0]!);
      expect(Math.min(...inner.map((point) => point.x))).toBeCloseTo(2.4);
      expect(Math.max(...inner.map((point) => point.x))).toBeCloseTo(97.6);
      const targetAlpha = 0.32;
      const bodyAlpha =
        1 -
        layers.reduce(
          (transmission, layer) =>
            transmission * (1 - hullLayerOpacity(targetAlpha, layer.weight)),
          1
        );
      expect(bodyAlpha).toBeCloseTo(targetAlpha);
    }
    expect(hullFeatherLayers(rectangle, 0.5)[0]!.weight).toBeGreaterThan(
      hullFeatherLayers(rectangle, 1)[0]!.weight
    );
  });

  it("keeps weighted opacity finite at transparent and opaque endpoints", () => {
    expect(hullLayerOpacity(0, 0.4)).toBe(0);
    expect(hullLayerOpacity(1, 0)).toBe(0);
    expect(hullLayerOpacity(1, 0.4)).toBe(1);
    expect(hullLayerOpacity(-0.5, 0.4)).toBe(0);
    expect(hullLayerOpacity(2, 0.4)).toBe(1);
    expect(hullLayerOpacity(NaN, 0.4)).toBe(0);
    expect(hullLayerOpacity(0.2, Infinity)).toBe(0);
    const faint = hullLayerOpacity(0.000001, 0.12);
    expect(faint).toBeGreaterThan(0);
    expect(faint).toBeLessThan(0.000001);
  });

  it("preserves concave winding and does not bridge disconnected inset pieces", () => {
    const points = [
      [0, 0],
      [20, 0],
      [20, 9],
      [40, 9],
      [40, 0],
      [60, 0],
      [60, 20],
      [40, 20],
      [40, 11],
      [20, 11],
      [20, 20],
      [0, 20]
    ];
    for (const vertices of [points, points.toReversed()]) {
      const path =
        vertices
          .map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`)
          .join(" ") + " Z";
      const layers = hullFeatherLayers(path, 1);
      expect(layers).toHaveLength(4);
      expect(layers[3]!.contours).toHaveLength(2);
      expect(area(layers[3]!.contours)).toBeLessThan(area([path]));
      for (const contour of layers.flatMap((layer) => layer.contours)) {
        const mesh = geographicMesh(contour);
        expect(mesh.fill.length).toBeGreaterThan(0);
        expect([...mesh.fill].every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("retains a thin body's core and never blanks collapsed or unsupported paths", () => {
    const thin = hullFeatherLayers("M0 0 L1 0 L1 100 L0 100 Z", 1);
    expect(thin).toHaveLength(4);
    expect(area(thin[3]!.contours)).toBeGreaterThan(50);
    for (const path of ["M0 0 L0 20 Z", "M0 0 A20 20 0 0 0 40 40 Z"]) {
      const layers = hullFeatherLayers(path, 1);
      expect(layers).toEqual([{ contours: [path], weight: 1 }]);
    }
  });

  it("accepts retained-camera width and reuses geometry independently of fade strength", () => {
    const first = hullFeatherLayers(rectangle, 0.25, 1.2);
    const later = hullFeatherLayers(rectangle, 1, 1.2);
    expect(later[3]!.contours).toBe(first[3]!.contours);
    const inner = flattenGeographicPath(later[3]!.contours[0]!);
    expect(Math.min(...inner.map((point) => point.x)) * 2).toBeCloseTo(2.4);
  });

  it("evicts old cached geometry after the bounded working set is exceeded", () => {
    const original = hullFeatherLayers(rectangle, 1)[3]!.contours;
    for (let index = 0; index < 129; index++)
      hullFeatherLayers(`M0 0 L${200 + index} 0 L100 80 L0 80 Z`, 1);
    expect(hullFeatherLayers(rectangle, 1)[3]!.contours).not.toBe(original);
  });
});
