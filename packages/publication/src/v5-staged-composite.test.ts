import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { buildV5ContentAndTemporalStagedArtifacts } from "./v5-staging.js";
import { readV5StagedCompositeChildren } from "./v5-staged-composite.js";

const worldId = "history";
const ids = Array.from({ length: 130 }, (_, index) => `child-${index}`);
const state: CanonicalState = {
  world: { id: worldId, slug: "history", title: "History", description: null },
  collections: [],
  events: ["parent", ...ids].map((id) => ({
    id,
    world_id: worldId,
    slug: null,
    title: id,
    summary: null,
    roles: [],
    attributes: {}
  })),
  eventCollectionMemberships: [],
  relations: [...ids, ids[0]!].map((id, index) => ({
    id: `contains-${index}`,
    world_id: worldId,
    type: "contains",
    source_ref: { kind: "event", event_id: "parent" },
    target_ref: { kind: "event", event_id: id },
    direction: "directed",
    attributes: {}
  })),
  narratives: ["parent", ...ids].map((id) => ({
    id: `n-${id}`,
    world_id: worldId,
    scope_type: "event",
    scope_id: id,
    locale: "ko",
    title: null,
    body: `Account of ${id}`,
    public_references: [],
    notes: []
  })),
  timeSystems: [],
  collectionTimeSystems: []
};

describe("inactive v5 Composite child page", () => {
  it("reads one bounded World-owned child page independent of Collection selection", async () => {
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
    const first = await readV5StagedCompositeChildren(
      artifacts.root.body,
      worldId,
      31,
      "parent",
      0,
      get
    );
    expect(first).toMatchObject({ page_count: 2 });
    expect(first?.child_event_ids).toHaveLength(128);
    expect(reads.length).toBeLessThanOrEqual(8);
    const second = await readV5StagedCompositeChildren(
      artifacts.root.body,
      worldId,
      31,
      "parent",
      1,
      get
    );
    expect(second?.child_event_ids).toHaveLength(2);
    expect(
      new Set([...first!.child_event_ids, ...second!.child_event_ids])
    ).toEqual(new Set(ids));
    expect(
      await readV5StagedCompositeChildren(
        artifacts.root.body,
        worldId,
        31,
        "parent",
        2,
        get
      )
    ).toEqual({ child_event_ids: [], page_count: 2 });
    await expect(
      readV5StagedCompositeChildren(
        artifacts.root.body,
        worldId,
        31,
        "parent",
        -1,
        get
      )
    ).rejects.toThrow("v5_composite_page_invalid");
    const pageKey = `worlds/${worldId}/revisions/31/v5/temporal/events/parent/children/0.json`;
    objects.set(pageKey, "{}");
    await expect(
      readV5StagedCompositeChildren(
        artifacts.root.body,
        worldId,
        31,
        "parent",
        0,
        get
      )
    ).rejects.toThrow("v5_index_digest_mismatch");
  });
});
