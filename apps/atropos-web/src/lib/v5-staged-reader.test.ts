import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { buildV5ContentAndTemporalStagedArtifacts } from "../../../../packages/publication/src/v5-staging.js";
import { createV5StagedAtroposReader } from "./v5-staged-reader.js";

const state: CanonicalState = {
  world: {
    id: "world-1",
    slug: "history",
    title: "Actual history",
    description: null
  },
  collections: [
    {
      id: "joseon",
      world_id: "world-1",
      slug: "joseon",
      title: "Joseon",
      description: null
    }
  ],
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
  eventCollectionMemberships: [
    { event_id: "event-1", collection_id: "joseon" }
  ],
  relations: [],
  timeSystems: [],
  collectionTimeSystems: [],
  narratives: [
    {
      id: "event-n",
      world_id: "world-1",
      scope_type: "event",
      scope_id: "event-1",
      locale: "ko",
      title: null,
      body: "World Event account",
      public_references: [],
      notes: []
    },
    {
      id: "collection-n",
      world_id: "world-1",
      scope_type: "collection",
      scope_id: "joseon",
      locale: "ko",
      title: null,
      body: "Selection account",
      public_references: [],
      notes: []
    }
  ]
};

describe("inactive Atropos v5 object reader", () => {
  it("composes separate Collection and World Event reads without whole-World transfer", async () => {
    const artifacts = buildV5ContentAndTemporalStagedArtifacts(state, 31);
    const objects = new Map(
      [...artifacts.documents, ...artifacts.index].map(({ key, body }) => [
        key,
        body
      ])
    );
    const reads: string[] = [];
    const store = {
      get: async (key: string) => {
        reads.push(key);
        return {
          status: objects.has(key) ? 200 : 404,
          body: objects.get(key) ?? null,
          etag: null
        };
      }
    };
    const reader = createV5StagedAtroposReader(
      store,
      artifacts.root.body,
      "world-1",
      31
    );
    expect((await reader.collections(0)).collections.map((c) => c.id)).toEqual([
      "joseon"
    ]);
    expect(await reader.collection("joseon", 0)).toMatchObject({
      event_ids: ["event-1"],
      narrative: { id: "collection-n" }
    });
    expect(await reader.event("event-1")).toMatchObject({
      event: { id: "event-1" },
      narrative: { id: "event-n" }
    });
    expect(reads.length).toBeLessThanOrEqual(14);
    objects.set(
      "worlds/world-1/revisions/31/v5/content/events/event-1/detail.json",
      "tampered"
    );
    await expect(reader.event("event-1")).rejects.toThrow(
      "v5_index_digest_mismatch"
    );
  });
});
