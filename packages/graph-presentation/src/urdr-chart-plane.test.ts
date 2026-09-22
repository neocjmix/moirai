import { describe, expect, it } from "vitest";
import {
  buildGraphShellChartPlane,
  DEFAULT_CHART_PLANE_X_FORCE_LAYOUT
} from "./urdr-chart-plane.js";
import type { Dataset } from "./urdr-layout-types.js";

const dataset: Dataset = {
  timeSystems: [{ id: "t", compatibilityKey: "gregorian" }],
  canons: [{ id: "k", timeSystemId: "t" }],
  events: [
    {
      id: "anchor",
      canonId: "k",
      type: "temporal-anchor",
      title: "Year",
      anchors: [{ scheme: "gregorian_utc", instant: { year: 2000 } }]
    },
    {
      id: "a",
      canonId: "k",
      type: "instant",
      title: "A",
      anchors: [
        { scheme: "gregorian_utc", precision: "year", instant: { year: 2001 } }
      ]
    },
    {
      id: "b",
      canonId: "k",
      type: "instant",
      title: "B",
      anchors: [
        { scheme: "gregorian_utc", precision: "year", instant: { year: 2001 } }
      ]
    },
    { id: "next", canonId: "k", type: "instant", title: "Next" },
    { id: "unplaced", canonId: "k", type: "instant", title: "Unknown" },
    { id: "inner", canonId: "k", type: "composite", title: "Inner" },
    { id: "outer", canonId: "k", type: "composite", title: "Outer" }
  ],
  structuralLinks: [
    { id: "order", type: "PRECEDES", fromEventId: "a", toEventId: "next" },
    { id: "cause", type: "CAUSES", fromEventId: "a", toEventId: "b" }
  ],
  semanticLinks: [
    { id: "c1", type: "contains", fromId: "inner", toId: "a" },
    { id: "c2", type: "contains", fromId: "inner", toId: "b" },
    { id: "c3", type: "contains", fromId: "outer", toId: "inner" },
    { id: "c4", type: "contains", fromId: "outer", toId: "next" }
  ]
};
const board = {
  axis: {
    startYear: 2000,
    endYear: 2005,
    timeSystemId: "t",
    compatibilityKey: "gregorian"
  }
};

describe("pinned original URDR producer parity", () => {
  it("fixes the unmodified producer output before adding the Moirai input seam", () => {
    // Captured from the original implementation with only local type and
    // explicit anchor fixture imports; no Moirai pre-resolved input options.
    expect(buildGraphShellChartPlane(dataset, board)).toMatchSnapshot();
  });
  it("fixes original force constants and repeatability", () => {
    expect(DEFAULT_CHART_PLANE_X_FORCE_LAYOUT).toEqual({
      iterations: 32,
      repulsion: 0.03,
      causesAttraction: 0.22,
      temporalAttraction: 0.12,
      maxStep: 0.22
    });
    expect(buildGraphShellChartPlane(dataset, board)).toEqual(
      buildGraphShellChartPlane(dataset, board)
    );
  });
  it("keeps the original #57 reproduction inside individual bounds after repair", () => {
    const bounded: Dataset = {
      timeSystems: dataset.timeSystems,
      canons: dataset.canons,
      events: [
        {
          id: "a",
          canonId: "k",
          type: "instant",
          title: "A",
          anchors: [
            {
              scheme: "gregorian_utc",
              range: { start: { year: 2004 }, end: { year: 2006 } }
            }
          ]
        },
        {
          id: "b",
          canonId: "k",
          type: "instant",
          title: "B",
          anchors: [
            {
              scheme: "gregorian_utc",
              range: { start: { year: 2000 }, end: { year: 2010 } }
            }
          ]
        }
      ],
      structuralLinks: [
        { id: "before", type: "PRECEDES", fromEventId: "a", toEventId: "b" }
      ],
      semanticLinks: []
    };
    const result = buildGraphShellChartPlane(bounded, {
      axis: { ...board.axis, startYear: 2000, endYear: 2010 }
    });
    const a = result.entities.find(
      (e) => e.eventId === "a" && e.geometryKind === "point"
    );
    expect(a?.geometryKind).toBe("point");
    if (a?.geometryKind !== "point") throw new Error("Missing point A");
    // Original pinned output was 2000.8. The same fixture must now satisfy both bounds and order.
    const displayedYear = a.position.y / 140 + 2005;
    expect(displayedYear).toBeGreaterThanOrEqual(2004);
    expect(displayedYear).toBeLessThanOrEqual(2006);
    const b = result.entities.find((e) => e.eventId === "b");
    if (b?.geometryKind !== "point") throw Error("Missing B");
    expect(b.position.y).toBeGreaterThan(a.position.y);
  });
  it("distributes an ordered same-year chain across its year bucket", () => {
    const years = Array.from({ length: 7 }, (_, index) => 1452 + index);
    const boundaryEvents = years.map((year) => ({
      id: `year-${year}`,
      canonId: "k",
      type: "temporal-anchor" as const,
      title: String(year)
    }));
    const sameYearEvents = ["exile", "restoration", "demotion", "death"].map(
      (id) => ({ id, canonId: "k", type: "instant" as const, title: id })
    );
    const dense: Dataset = {
      timeSystems: dataset.timeSystems,
      canons: dataset.canons,
      events: [...boundaryEvents, ...sameYearEvents],
      structuralLinks: [],
      semanticLinks: []
    };
    const extents = new Map<string, { minYear: number; maxYear: number }>([
      ...years.map(
        (year) => [`year-${year}`, { minYear: year, maxYear: year }] as const
      ),
      ...sameYearEvents.map(
        (event) => [event.id, { minYear: 1457, maxYear: 1458 }] as const
      )
    ]);
    const chain = [
      { beforeId: "year-1452", afterId: "year-1453", minGapYears: 0.001 },
      { beforeId: "year-1453", afterId: "year-1454", minGapYears: 0.001 },
      { beforeId: "year-1454", afterId: "year-1455", minGapYears: 0.001 },
      { beforeId: "year-1455", afterId: "year-1456", minGapYears: 0.001 },
      { beforeId: "year-1456", afterId: "year-1457", minGapYears: 0.001 },
      { beforeId: "year-1457", afterId: "exile", minGapYears: 0.001 },
      { beforeId: "exile", afterId: "restoration", minGapYears: 0.001 },
      { beforeId: "restoration", afterId: "demotion", minGapYears: 0.001 },
      { beforeId: "demotion", afterId: "death", minGapYears: 0.001 },
      { beforeId: "death", afterId: "year-1458", minGapYears: 0.001 }
    ].map((constraint, index) => ({
      ...constraint,
      source: `chain-${index}`
    }));
    const result = buildGraphShellChartPlane(
      dense,
      {
        axis: {
          ...board.axis,
          startYear: 1452,
          endYear: 1458
        }
      },
      { explicitExtents: extents, temporalConstraints: chain }
    );
    const y = sameYearEvents.map((event) => {
      const point = result.entities.find(
        (entity) =>
          entity.eventId === event.id && entity.geometryKind === "point"
      );
      if (point?.geometryKind !== "point") throw Error(`Missing ${event.id}`);
      return point.position.y;
    });

    expect(y).toEqual([...y].sort((left, right) => left - right));
    expect(y[0]!).toBeGreaterThan(chronologyYearToWorldYForTest(1457));
    expect(y.at(-1)!).toBeLessThan(chronologyYearToWorldYForTest(1458));
    for (let index = 1; index < y.length; index += 1)
      expect(y[index]! - y[index - 1]!).toBeGreaterThan(35);
  });
});

function chronologyYearToWorldYForTest(year: number) {
  return (year - (1452 + 1458) / 2) * 140;
}
