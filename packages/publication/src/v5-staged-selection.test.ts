import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { buildV5ContentAndTemporalStagedArtifacts } from "./v5-staging.js";
import {
  readV5StagedSelectionPage,
  type V5SelectionCursor
} from "./v5-staged-selection.js";

const ids = Array.from(
  { length: 260 },
  (_, index) => `event-${String(index).padStart(3, "0")}`
);
const worldId = "world-1";
const collections = ["joseon", "japan"];
const state: CanonicalState = {
  world: {
    id: worldId,
    slug: "history",
    title: "Actual history",
    description: null
  },
  collections: collections.map((id) => ({
    id,
    world_id: worldId,
    slug: id,
    title: id,
    description: null
  })),
  events: ids.map((id) => ({
    id,
    world_id: worldId,
    slug: null,
    title: id,
    summary: null,
    roles: [],
    attributes: {}
  })),
  narratives: [
    ...ids.map((id) => ({
      id: `n-${id}`,
      world_id: worldId,
      scope_type: "event" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: "Reader-facing account",
      public_references: [],
      notes: []
    })),
    ...collections.map((id) => ({
      id: `n-${id}`,
      world_id: worldId,
      scope_type: "collection" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: "Collection introduction",
      public_references: [],
      notes: []
    }))
  ],
  eventCollectionMemberships: [
    ...ids
      .slice(0, 200)
      .map((event_id) => ({ event_id, collection_id: "joseon" })),
    ...ids.slice(100).map((event_id) => ({ event_id, collection_id: "japan" }))
  ],
  relations: [],
  timeSystems: [],
  collectionTimeSystems: []
};

describe("inactive v5 selected-Collection union", () => {
  it("pages one shared World Event identity across overlapping selections", async () => {
    const artifacts = buildV5ContentAndTemporalStagedArtifacts(state, 31);
    const objects = new Map(
      [...artifacts.documents, ...artifacts.index].map(({ key, body }) => [
        key,
        body
      ])
    );
    const reads: string[] = [];
    const get = async (key: string) => {
      reads.push(key);
      return objects.get(key) ?? null;
    };
    const chosen = ["japan", "joseon"];
    let cursor = null;
    const results: string[] = [];
    const pageSizes: number[] = [];
    let firstCursor: V5SelectionCursor | null = null;
    do {
      reads.length = 0;
      const page = await readV5StagedSelectionPage(
        artifacts.root.body,
        worldId,
        31,
        chosen,
        cursor,
        get
      );
      results.push(...page.event_ids);
      pageSizes.push(page.event_ids.length);
      expect(reads.length).toBeLessThanOrEqual(22);
      firstCursor ??= page.next_cursor;
      cursor = page.next_cursor;
    } while (cursor !== null);
    expect(pageSizes).toEqual([128, 128, 4]);
    expect(results).toEqual(ids);
    expect(new Set(results).size).toBe(260);
    await expect(
      readV5StagedSelectionPage(
        artifacts.root.body,
        worldId,
        31,
        chosen,
        { ...firstCursor!, revision: 32 },
        get
      )
    ).rejects.toThrow("v5_selection_cursor_invalid");
    await expect(
      readV5StagedSelectionPage(
        artifacts.root.body,
        worldId,
        31,
        chosen,
        { ...firstCursor!, positions: [null, null] },
        get
      )
    ).rejects.toThrow("v5_selection_cursor_invalid");
    await expect(
      readV5StagedSelectionPage(
        artifacts.root.body,
        worldId,
        31,
        ["joseon", "japan"],
        null,
        get
      )
    ).rejects.toThrow("v5_selection_cursor_invalid");
    await expect(
      readV5StagedSelectionPage(
        artifacts.root.body,
        worldId,
        30,
        chosen,
        null,
        get
      )
    ).rejects.toThrow();
  });
});
