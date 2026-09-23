import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { buildV5ContentAndTemporalStagedArtifacts } from "./v5-staging.js";
import { readV5StagedEvent } from "./v5-staged-event.js";

const worldId = "world-1";
const eventId = "event-1";
const state: CanonicalState = {
  world: {
    id: worldId,
    slug: "history",
    title: "실제 세계사",
    description: null
  },
  collections: ["joseon", "imjin"].map((id) => ({
    id,
    world_id: worldId,
    slug: id,
    title: id,
    description: null
  })),
  events: [
    {
      id: eventId,
      world_id: worldId,
      slug: null,
      title: "Shared battle",
      summary: null,
      roles: [],
      attributes: {}
    }
  ],
  eventCollectionMemberships: ["joseon", "imjin"].map((collection_id) => ({
    event_id: eventId,
    collection_id
  })),
  relations: [],
  narratives: [
    {
      id: "event-narrative",
      world_id: worldId,
      scope_type: "event",
      scope_id: eventId,
      locale: "ko",
      title: null,
      body: "One reader-facing account.",
      public_references: [],
      notes: []
    },
    ...["joseon", "imjin"].map((id) => ({
      id: `n-${id}`,
      world_id: worldId,
      scope_type: "collection" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: `Collection introduction ${id}`,
      public_references: [],
      notes: []
    }))
  ],
  timeSystems: [],
  collectionTimeSystems: []
};

describe("inactive v5 direct-Event reader", () => {
  it("reads one shared World Event, one Narrative and World temporal fact", async () => {
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
    const found = await readV5StagedEvent(
      artifacts.root.body,
      worldId,
      31,
      eventId,
      get
    );
    expect(found).toMatchObject({
      event: { id: eventId },
      narrative: { id: "event-narrative", body: "One reader-facing account." },
      position: { event_id: eventId, kind: "unresolved" },
      collection_page_count: 1,
      composite_child_count: 0,
      composite: null
    });
    expect(reads.length).toBeLessThanOrEqual(4);
    expect(reads.filter((key) => key.endsWith("/detail.json"))).toHaveLength(1);
    expect(JSON.stringify(found)).not.toContain("canon_id");
    expect(
      await readV5StagedEvent(artifacts.root.body, worldId, 31, "absent", get)
    ).toBeNull();
    await expect(
      readV5StagedEvent(artifacts.root.body, worldId, 30, eventId, get)
    ).rejects.toThrow("v5_event_root_invalid");
    objects.delete(
      `worlds/${worldId}/revisions/31/v5/temporal/events/${eventId}/position.json`
    );
    await expect(
      readV5StagedEvent(artifacts.root.body, worldId, 31, eventId, get)
    ).rejects.toThrow("v5_index_digest_mismatch");
  });
  it("derives Composite detail from an unselected child", async () => {
    const composite: CanonicalState = {
      ...state,
      events: [
        ...state.events,
        { ...state.events[0]!, id: "hidden-child", title: "Constituent" }
      ],
      narratives: [
        ...state.narratives,
        {
          ...state.narratives[0]!,
          id: "n-hidden-child",
          scope_id: "hidden-child",
          body: "Constituent account."
        }
      ],
      relations: [
        {
          id: "part-of",
          world_id: worldId,
          type: "contains",
          source_ref: { kind: "event", event_id: eventId },
          target_ref: { kind: "event", event_id: "hidden-child" },
          direction: "directed",
          attributes: {}
        }
      ]
    };
    const artifacts = buildV5ContentAndTemporalStagedArtifacts(composite, 31);
    const objects = new Map(
      [...artifacts.documents, ...artifacts.index].map(({ key, body }) => [
        key,
        body
      ])
    );
    const found = await readV5StagedEvent(
      artifacts.root.body,
      worldId,
      31,
      eventId,
      async (key) => objects.get(key) ?? null
    );
    expect(found?.composite_child_count).toBe(1);
    expect(found?.composite).toMatchObject({
      event_id: eventId,
      direct_children: 1,
      descendant_count: 1
    });
    expect(found?.narrative.id).toBe("event-narrative");
  });
});
