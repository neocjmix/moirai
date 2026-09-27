import { expect, it } from "vitest";
import { viewportCompleteness } from "./viewport-completeness";
import { graphReadLoader } from "./graph-read-loader";
import type { GraphShellViewportQuery } from "../shared/contracts";

const query: GraphShellViewportQuery = {
  canonIds: [],
  bbox: { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 },
  scale: 1,
  viewportWidth: 390,
  viewportHeight: 844,
  includeNeighbors: false,
  artifactClasses: ["point", "segment", "region"]
};

it("keeps complete shape coverage separate from capped edges and missing hull support", async () => {
  const snapshot = await graphReadLoader.loadViewport("ko", query);
  const entities = [
    ...snapshot.entities,
    ...snapshot.regions.map((region) =>
      region.geometryKind === "region"
        ? { ...region, childrenComplete: true }
        : region
    )
  ];
  expect(viewportCompleteness(entities, false, true)).toEqual({
    entities: true,
    regions: true,
    edges: false,
    regionSupport: true
  });
  expect(
    viewportCompleteness(
      entities.filter((entity) => entity.id !== "event:capital"),
      false,
      false
    )
  ).toEqual({
    entities: true,
    regions: true,
    edges: true,
    regionSupport: false
  });
  expect(viewportCompleteness(entities, true, false)).toEqual({
    entities: false,
    regions: false,
    edges: false,
    regionSupport: true
  });
});

it("does not call a first child page, unknown child list, or cyclic support complete", async () => {
  const snapshot = await graphReadLoader.loadViewport("ko", query);
  const region = snapshot.regions[0]!;
  if (region.geometryKind !== "region") throw Error("region_fixture_required");
  expect(
    viewportCompleteness([...snapshot.entities, region], false, false)
      .regionSupport
  ).toBe(false);
  expect(
    viewportCompleteness(
      [...snapshot.entities, { ...region, childrenComplete: false }],
      false,
      false
    ).regionSupport
  ).toBe(false);
  expect(
    viewportCompleteness(
      [{ ...region, childrenComplete: true, contains: [region.id] }],
      false,
      false
    ).regionSupport
  ).toBe(false);
});
