import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  expandPolygon,
  resolveCompositeEdgeLabelPlacement as resolve,
  type CompositeEdgeLabelPlacement
} from "./graph-shell-region-geometry";

// Golden output is captured from b830f13's original resolver. Include full
// paths, offsets and hysteresis, not just the selected side of a polygon.
it("preserves label placement through thin, curved, clipped and crowded views with less density work", () => {
  const outputs: CompositeEdgeLabelPlacement[] = [];
  let queries = 0;
  const viewport = { width: 390, height: 664 };
  for (const height of [2.7, 80, 300]) {
    for (const labelWidth of [72, 150, 320]) {
      for (const crowded of [false, true]) {
        let previous: CompositeEdgeLabelPlacement | undefined;
        for (const dx of [0, 1, -1, 12, -12, 100, 220, -220, 0]) {
          const polygon = expandPolygon(
            [
              { x: 50 + dx, y: 200 },
              { x: 330 + dx, y: 201 },
              { x: 320 + dx, y: 200 + height },
              { x: 60 + dx, y: 200 + height }
            ],
            16
          );
          const nearby = crowded
            ? Array.from({ length: 49 }, (_, i) => ({
                x: (i % 7) * 60,
                y: 170 + Math.floor(i / 7) * 40
              }))
            : [];
          previous = resolve(
            polygon,
            labelWidth,
            14,
            viewport,
            10,
            6,
            () => {
              queries++;
              return nearby;
            },
            previous
          );
          outputs.push(previous);
        }
      }
    }
  }
  expect(
    createHash("sha256").update(JSON.stringify(outputs)).digest("hex")
  ).toBe("d0a5a7dbe6b94acc13a499857771887e2a710b7af5ad24f77164f84d522eab9d"); // pragma: allowlist secret -- synthetic geometry SHA-256
  // The original resolver made 9,119 density queries for these 162 views.
  expect(queries).toBeLessThanOrEqual(600);
});
