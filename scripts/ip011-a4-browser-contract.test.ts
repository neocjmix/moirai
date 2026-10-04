import { expect, it } from "vitest";
import {
  buildV5SpatialIndex,
  readV5WorldViewport
} from "@moirai/graph-presentation/server";
import { restartViewportQuery } from "./ip011-a4-browser-contract.js";

it("starts a new neighborhood after a captured continuation without reusing its authenticated bbox", async () => {
  const index = buildV5SpatialIndex({
    world_id: "world",
    revision: 31,
    time_system_id: "time",
    algorithm_version: "v5-world-layout/1",
    temporal_digest: "digest",
    unplaced_event_ids: [],
    diagnostics: [],
    shapes: Array.from({ length: 257 }, (_, i) => ({
      event_id: `event-${i}`,
      kind: "point" as const,
      position: { x: 0, y: i }
    }))
  });
  const bodies = new Map(
    index.documents.map((document) => [document.key, document.body])
  );
  const read = async (key: string) => bodies.get(key) ?? null;
  const initial = { minX: -1, maxX: 1, minY: 0, maxY: 256 };
  const page = await readV5WorldViewport(
    index.manifest.body,
    initial,
    128,
    null,
    read
  );
  expect(page.next_cursor).not.toBeNull();
  const nextBounds = { ...initial, minY: 200, maxY: 240 };
  await expect(
    readV5WorldViewport(
      index.manifest.body,
      nextBounds,
      128,
      page.next_cursor,
      read
    )
  ).rejects.toThrow("v5_viewport_cursor_invalid");
  const template = {
    world_id: "world",
    revision: 31,
    collection_ids: ["a"],
    cursor: page.next_cursor,
    viewport: { bbox: initial, scale: 1 }
  };
  const restarted = restartViewportQuery(template, nextBounds);
  const next = await readV5WorldViewport(
    index.manifest.body,
    restarted.viewport.bbox,
    128,
    restarted.cursor,
    read
  );
  expect(next.shapes).toHaveLength(41);
  expect(
    next.shapes.every(
      (shape) =>
        shape.kind === "point" &&
        shape.position.y >= 200 &&
        shape.position.y <= 240
    )
  ).toBe(true);
  expect(next.next_cursor).toBeNull();
  expect(template.cursor).toBe(page.next_cursor);
  expect(template.viewport.bbox).toEqual(initial);
});
