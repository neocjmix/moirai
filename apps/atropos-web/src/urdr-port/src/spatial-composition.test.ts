import { describe, expect, it } from "vitest";
import type {
  GraphShellChartPlaneEntity,
  StaticViewportLevelMeta
} from "../shared/contracts";
import {
  composeCanonOffsets,
  getStaticEntityBandIndices
} from "./spatial-composition";

const base = {
  id: "test",
  eventId: "test",
  canonId: "k1",
  label: "Test",
  validationState: "ok" as const,
  contains: [],
  diagnostics: [],
  viewportClass: "visible" as const
};
const meta: StaticViewportLevelMeta = {
  bandSize: 4096,
  classes: ["point", "segment", "region"],
  canons: Object.fromEntries(
    ["k1", "k2"].map((id) => [
      id,
      {
        scopeKey: id,
        widthHint: 1800,
        preferredGap: 240,
        pathTemplateByClass: {},
        coverageByClass: {},
        entityIndex: {}
      }
    ])
  )
};

describe("M4.6 pinned URDR spatial composition", () => {
  it("places a point in one band and spanning geometry in every intersecting band", () => {
    const shapes: GraphShellChartPlaneEntity[] = [
      { ...base, geometryKind: "point", position: { x: 0, y: -1 } },
      {
        ...base,
        geometryKind: "segment",
        start: { x: 1, y: 4096 },
        end: { x: 2, y: -4096 }
      },
      {
        ...base,
        geometryKind: "region",
        worldBounds: { minX: 0, maxX: 1, minY: -1, maxY: 8192 }
      }
    ];
    expect(shapes.map((e) => getStaticEntityBandIndices(e, 4096))).toEqual([
      [-1],
      [-1, 0, 1],
      [-1, 0, 1, 2]
    ]);
  });

  it("composes requested Canon order using widthHint plus preferredGap", () => {
    expect([
      ...composeCanonOffsets(["k2", "missing", "k1"], "year", meta, new Map())
    ]).toEqual([
      ["k2", 0],
      ["k1", 2040]
    ]);
  });

  it("prefers generalized scope metadata over compatibility metadata", () => {
    const generalized = new Map([
      [
        "k2",
        {
          scopeKey: "k2",
          defaultTimeLevel: "year",
          supportedTimeLevels: ["year"],
          levels: {
            year: {
              bandSize: 4096,
              classes: ["point" as const],
              widthHint: 900,
              preferredGap: 80,
              pathTemplate: "/graph-static/test/{yBand}.json"
            }
          }
        }
      ]
    ]);
    expect([
      ...composeCanonOffsets(["k2", "k1"], "year", meta, generalized)
    ]).toEqual([
      ["k2", 0],
      ["k1", 980]
    ]);
  });
});
