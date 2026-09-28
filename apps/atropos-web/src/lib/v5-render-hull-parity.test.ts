import { describe, expect, it } from "vitest";
import { buildRenderConcaveHull } from "@moirai/graph-presentation/server";
import { buildCompositeHull } from "../urdr-port/src/components/graph-shell-region-geometry";

describe("Lachesis / existing Atropos concave hull parity", () => {
  it("matches the current default Y-sweep for nested and irregular support", () => {
    const samples = [
      {
        instantPoints: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 0, y: 2 },
          { x: 2, y: 2 }
        ],
        childPolygons: []
      },
      {
        instantPoints: [
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 1, y: 2 }
        ],
        childPolygons: [
          [
            { x: 0, y: 0 },
            { x: 3, y: 0 },
            { x: 3, y: 2 },
            { x: 0, y: 2 }
          ]
        ]
      },
      {
        instantPoints: [
          { x: 3.12345, y: 1 },
          { x: 5, y: 4 },
          { x: 1, y: 2 },
          { x: 2, y: 3 },
          { x: 1, y: 4 }
        ],
        childPolygons: [
          [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 0, y: 2 }
          ]
        ]
      }
    ];
    for (const sample of samples)
      expect(
        buildRenderConcaveHull(sample.instantPoints, sample.childPolygons)
      ).toEqual(buildCompositeHull(sample, "concave"));
  });
});
