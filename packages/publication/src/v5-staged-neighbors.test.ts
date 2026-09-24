import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { buildV5ContentAndTemporalStagedArtifacts } from "./v5-staging.js";
import {
  readV5StagedAdjacencyPage,
  readV5StagedRelation
} from "./v5-staged-neighbors.js";

const worldId = "world-1";
const state: CanonicalState = {
  world: {
    id: worldId,
    slug: "history",
    title: "Actual history",
    description: null
  },
  collections: [
    {
      id: "selected",
      world_id: worldId,
      slug: "selected",
      title: "Selected",
      description: null
    }
  ],
  events: ["parent", "neighbor"].map((id) => ({
    id,
    world_id: worldId,
    slug: null,
    title: id,
    summary: null,
    roles: [],
    attributes: {}
  })),
  eventCollectionMemberships: [
    { collection_id: "selected", event_id: "parent" }
  ],
  relations: [
    {
      id: "edge-1",
      world_id: worldId,
      type: "influences",
      direction: "directed",
      source_ref: { kind: "event", event_id: "parent" },
      target_ref: { kind: "event", event_id: "neighbor" },
      attributes: {}
    }
  ],
  narratives: [
    ...["parent", "neighbor"].map((id) => ({
      id: `n-${id}`,
      world_id: worldId,
      scope_type: "event" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: id,
      public_references: [],
      notes: []
    })),
    {
      id: "n-selected",
      world_id: worldId,
      scope_type: "collection",
      scope_id: "selected",
      locale: "ko",
      title: null,
      body: "Selection",
      public_references: [],
      notes: []
    }
  ],
  timeSystems: [],
  collectionTimeSystems: []
};

describe("inactive v5 World adjacency reader", () => {
  it("reaches a nonmember neighbor through a bounded World relation page", async () => {
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
    const page = await readV5StagedAdjacencyPage(
      artifacts.root.body,
      worldId,
      31,
      "parent",
      0,
      get
    );
    expect(page).toEqual({
      event_id: "parent",
      relation_ids: ["edge-1"],
      next_page: null
    });
    expect(reads.length).toBeLessThanOrEqual(4);
    const relation = await readV5StagedRelation(
      artifacts.root.body,
      worldId,
      31,
      page!.relation_ids[0]!,
      get
    );
    expect(relation?.target_ref).toEqual({
      kind: "event",
      event_id: "neighbor"
    });
    expect(JSON.stringify(relation)).not.toContain("canon_id");
    await expect(
      readV5StagedAdjacencyPage(
        artifacts.root.body,
        worldId,
        31,
        "parent",
        1,
        get
      )
    ).rejects.toThrow("v5_adjacency_page_out_of_range");
    await expect(
      readV5StagedRelation(artifacts.root.body, worldId, 30, "edge-1", get)
    ).rejects.toThrow("v5_relation_root_invalid");
  });
});
