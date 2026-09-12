import { describe, expect, it } from "vitest";
import type { GraphShellChartPlane } from "./urdr-layout-types.js";
import { createStaticProjectionObjectDocs } from "./urdr-static-bake.js";

const base = {
  eventId: "event",
  canonId: "scope",
  label: "test",
  validationState: "ok" as const,
  contains: [],
  diagnostics: [],
  viewportClass: "visible" as const
};
const chartPlane: GraphShellChartPlane = {
  timeSystemId: "test",
  compatibilityKey: "test",
  diagnostics: [],
  entities: [
    {
      ...base,
      id: "point",
      geometryKind: "point",
      position: { x: -20, y: -1 }
    },
    {
      ...base,
      id: "segment",
      geometryKind: "segment",
      start: { x: -10, y: -1 },
      end: { x: 20, y: 4096 }
    },
    {
      ...base,
      id: "region",
      geometryKind: "region",
      worldBounds: { minX: -30, maxX: 40, minY: -1, maxY: 8192 }
    }
  ]
};

describe("pinned URDR object document bake", () => {
  it("keeps band distribution, scope-local X, original Y and source identity", () => {
    const docs = createStaticProjectionObjectDocs({
      chartPlane,
      revisionId: "w@4",
      scopeKey: "scope",
      timeLevel: "year",
      bandSize: 4096
    });
    expect([...docs.keys()]).toEqual([
      "point:n000001",
      "segment:n000001",
      "segment:000000",
      "segment:000001",
      "region:n000001",
      "region:000000",
      "region:000001",
      "region:000002"
    ]);
    expect(docs.get("point:n000001")!.artifacts[0]).toMatchObject({
      revisionId: "w@4",
      localX: 10,
      y: -1,
      sourceEventIds: ["event"],
      payload: { position: { x: 10, y: -1 } }
    });
    expect(chartPlane.entities[0]).toMatchObject({
      position: { x: -20, y: -1 }
    });
    expect(JSON.stringify([...docs])).toBe(
      JSON.stringify([
        ...createStaticProjectionObjectDocs({
          chartPlane,
          revisionId: "w@4",
          scopeKey: "scope",
          timeLevel: "year",
          bandSize: 4096
        })
      ])
    );
  });
  it("emits explicit empty coverage documents and excludes other scopes", () => {
    const docs = createStaticProjectionObjectDocs({
      chartPlane,
      revisionId: "w@4",
      scopeKey: "other",
      timeLevel: "year",
      bandSize: 4096,
      levelMeta: {
        classes: ["point"],
        canons: {
          other: {
            coverageByClass: { point: { minBandIndex: 0, maxBandIndex: 1 } }
          }
        }
      }
    });
    expect([...docs.values()].map((d) => d.artifacts)).toEqual([[], []]);
  });
});
