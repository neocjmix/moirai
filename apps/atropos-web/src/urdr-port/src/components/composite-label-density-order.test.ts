import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  expandPolygon,
  resolveCompositeEdgeLabelPlacement as resolve,
  type CompositeEdgeLabelPlacement
} from "./graph-shell-region-geometry";

// Captured with the exhaustive density scorer at 91cffca. Different vertex
// counts, winding, concavity, crowding, clipping and independent scales exercise
// all tie breakers as well as the previous-edge hysteresis across view changes.
it("preserves exhaustive placement on generated pan and zoom sequences", () => {
  const outputs: CompositeEdgeLabelPlacement[] = [];
  let seed = 127;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const viewport = { width: 390, height: 664 };
  for (const vertices of [3, 5, 9, 17]) {
    for (const concave of [false, true]) {
      for (const reversed of [false, true]) {
        for (const crowding of [0, 30, 150]) {
          const polygon = Array.from({ length: vertices }, (_, index) => {
            const angle = (index * Math.PI * 2) / vertices;
            const radius = concave && index % 2 ? 0.4 : 1;
            return {
              x: Math.cos(angle) * radius * (90 + random() * 80),
              y: Math.sin(angle) * radius * (60 + random() * 90)
            };
          });
          if (reversed) polygon.reverse();
          const points = Array.from({ length: crowding }, () => ({
            x: random() * 700 - 350,
            y: random() * 1000 - 500
          }));
          for (const labelWidth of [72, 196, 360]) {
            let previous: CompositeEdgeLabelPlacement | undefined;
            for (const [x, y, scaleX, scaleY] of [
              [195, 332, 1, 1],
              [198, 330, 1, 1],
              [195, 332, 0.7, 1.3],
              [30, 150, 2, 1.5],
              [380, 630, 0.8, 3],
              [600, 330, 2, 0.4],
              [195, 332, 1, 1]
            ] as const) {
              const transform = (point: { x: number; y: number }) => ({
                x: x + point.x * scaleX,
                y: y + point.y * scaleY
              });
              previous = resolve(
                expandPolygon(polygon.map(transform), 16),
                labelWidth,
                14,
                viewport,
                10,
                6,
                points.map(transform),
                previous
              );
              outputs.push(previous);
            }
          }
        }
      }
    }
  }
  expect(outputs).toHaveLength(1008);
  expect(createHash("sha256").update(JSON.stringify(outputs)).digest("hex"))
    .toBe("619d6f9ff1549a6821ec060bf7fb1cd9ac07837fc07d02a944bfbd79ad1dbbbe"); // pragma: allowlist secret -- synthetic geometry SHA-256
});

it("queries only the best geometric candidate when its neighborhood is empty", () => {
  const polygon = expandPolygon([
    { x: 80, y: 150 },
    { x: 310, y: 150 },
    { x: 310, y: 470 },
    { x: 80, y: 470 }
  ], 16);
  let queries = 0;
  const placement = resolve(polygon, 72, 14, { width: 390, height: 664 }, 10, 6, () => {
    queries++;
    return [];
  });
  expect(placement).toEqual(resolve(polygon, 72, 14, { width: 390, height: 664 }));
  expect(queries).toBe(1);
});
