import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { buildV5ContentAndTemporalStagedArtifacts } from "./v5-staging.js";
import {
  readV5StagedCollection,
  readV5StagedCollectionCatalog
} from "./v5-staged-collection.js";

const state: CanonicalState = {
  world: {
    id: "world-1",
    slug: "history",
    title: "Actual history",
    description: null
  },
  collections: ["joseon", "japan", "empty"].map((id) => ({
    id,
    world_id: "world-1",
    slug: id,
    title: id,
    description: null
  })),
  events: [
    {
      id: "event-1",
      world_id: "world-1",
      slug: null,
      title: "Shared event",
      summary: null,
      roles: [],
      attributes: {}
    }
  ],
  eventCollectionMemberships: ["joseon", "japan"].map((collection_id) => ({
    collection_id,
    event_id: "event-1"
  })),
  narratives: [
    {
      id: "event-n",
      world_id: "world-1",
      scope_type: "event",
      scope_id: "event-1",
      locale: "ko",
      title: null,
      body: "Shared history",
      public_references: [],
      notes: []
    },
    ...["joseon", "japan", "empty"].map((id) => ({
      id: `${id}-n`,
      world_id: "world-1",
      scope_type: "collection" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: id,
      public_references: [],
      notes: []
    }))
  ],
  relations: [],
  timeSystems: [],
  collectionTimeSystems: []
};

describe("inactive v5 Collection reader", () => {
  it("reads shared Event IDs without duplicating World Event detail or Narrative", async () => {
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
    const catalog = await readV5StagedCollectionCatalog(
      artifacts.root.body,
      "world-1",
      31,
      0,
      get
    );
    expect(catalog).toMatchObject({ collection_count: 3, next_page: null });
    expect(catalog.collections.map((collection) => collection.id)).toEqual([
      "empty",
      "japan",
      "joseon"
    ]);
    expect(reads.length).toBeLessThanOrEqual(6);
    reads.length = 0;
    const joseon = await readV5StagedCollection(
      artifacts.root.body,
      "world-1",
      31,
      "joseon",
      0,
      get
    );
    const japan = await readV5StagedCollection(
      artifacts.root.body,
      "world-1",
      31,
      "japan",
      0,
      get
    );
    expect(joseon).toMatchObject({
      member_count: 1,
      event_ids: ["event-1"],
      next_page: null
    });
    expect(japan).toMatchObject({
      member_count: 1,
      event_ids: ["event-1"],
      next_page: null
    });
    expect(joseon?.narrative.id).toBe("joseon-n");
    expect(japan?.narrative.id).toBe("japan-n");
    expect(reads.some((key) => key.includes("/events/event-1/detail"))).toBe(
      false
    );
    expect(reads.length).toBeLessThanOrEqual(12);
    expect(
      await readV5StagedCollection(
        artifacts.root.body,
        "world-1",
        31,
        "empty",
        0,
        get
      )
    ).toMatchObject({ member_count: 0, event_ids: [] });
    await expect(
      readV5StagedCollection(
        artifacts.root.body,
        "world-1",
        31,
        "japan",
        1,
        get
      )
    ).rejects.toThrow("v5_collection_page_out_of_range");
    await expect(
      readV5StagedCollection(
        artifacts.root.body,
        "world-1",
        30,
        "japan",
        0,
        get
      )
    ).rejects.toThrow("v5_collection_root_invalid");
  });
});
