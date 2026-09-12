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
  it("reproduces the pinned producer moving a bounded Event outside its own interval", () => {
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
    // Characterization, not a desired acceptance result. No Moirai options are
    // passed: the pinned producer itself violates A's [2004, 2006] interval.
    const displayedYear = a.position.y / 140 + 2005;
    expect(displayedYear).toBeLessThan(2004);
    expect(displayedYear).toBeCloseTo(2000.8);
  });
});
