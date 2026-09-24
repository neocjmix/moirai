import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { buildV5WorldSpatialStagedArtifacts } from "@moirai/graph-presentation/server";

const { objects } = vi.hoisted(() => ({ objects: new Map<string, string>() }));
vi.mock("../../../../lib/publication", () => ({
  readPublicationObject: async (key: string) => ({
    status: objects.has(key) ? 200 : 404,
    body: objects.get(key) ?? null,
    etag: null
  })
}));
import { POST } from "./route";

const id = (last: string) => `01995c2a-7b00-7000-8000-0000000000${last}`;
const worldId = id("01");
const eventId = id("02");
const collectionIds = [id("03"), id("04")];
const state: CanonicalState = {
  world: {
    id: worldId,
    slug: "history",
    title: "Actual history",
    description: null
  },
  collections: collectionIds.map((collectionId) => ({
    id: collectionId,
    world_id: worldId,
    slug: collectionId,
    title: collectionId,
    description: null
  })),
  events: [
    {
      id: eventId,
      world_id: worldId,
      slug: null,
      title: "One event",
      summary: null,
      roles: [],
      attributes: {}
    }
  ],
  eventCollectionMemberships: collectionIds.map((collection_id) => ({
    event_id: eventId,
    collection_id
  })),
  relations: [],
  timeSystems: [],
  collectionTimeSystems: [],
  narratives: [
    {
      id: id("05"),
      world_id: worldId,
      scope_type: "event",
      scope_id: eventId,
      locale: "ko",
      title: null,
      body: "World Event",
      public_references: [],
      notes: []
    },
    ...collectionIds.map((collectionId, index) => ({
      id: id(index === 0 ? "06" : "07"),
      world_id: worldId,
      scope_type: "collection" as const,
      scope_id: collectionId,
      locale: "ko",
      title: null,
      body: "Selection",
      public_references: [],
      notes: []
    }))
  ]
};
const request = (value: unknown) =>
  new Request("http://localhost/graph/v5/read", {
    method: "POST",
    body: JSON.stringify(value)
  });

describe("v5 bounded detail route", () => {
  beforeEach(() => objects.clear());
  it("rejects v4 and obsolete Canon query inputs", async () => {
    expect(
      (
        await POST(
          request({
            world_id: worldId,
            kind: "event",
            event_id: eventId,
            canon_id: collectionIds[0]
          })
        )
      ).status
    ).toBe(400);
    objects.set(
      `worlds/${worldId}/current.json`,
      JSON.stringify({
        format_version: "3.0.0",
        world_id: worldId,
        served_revision: 30
      })
    );
    expect(
      (
        await POST(
          request({ world_id: worldId, kind: "event", event_id: eventId })
        )
      ).status
    ).toBe(503);
  });
  it("reads one World-owned Event Narrative across two Collections only from a complete root", async () => {
    const artifacts = buildV5WorldSpatialStagedArtifacts(state, 31);
    expect(artifacts.index.length).toBe(1);
    for (const object of artifacts.documents)
      objects.set(object.key, object.body);
    const stagedIndex = artifacts.index[0]!;
    const completeIndexKey = stagedIndex.key.replace(
      "/v5/staging/content-temporal-and-spatial-staged/index/",
      "/v5/complete/index/"
    );
    objects.set(completeIndexKey, stagedIndex.body);
    const rootKey = `worlds/${worldId}/revisions/31/v5/complete/manifest.json`;
    const root = JSON.stringify({
      ...JSON.parse(artifacts.root.body),
      completeness: "complete",
      entries: JSON.parse(artifacts.root.body).entries.map(
        (ref: { key: string }) => ({ ...ref, key: completeIndexKey })
      )
    });
    objects.set(rootKey, root);
    objects.set(
      `worlds/${worldId}/current.json`,
      JSON.stringify({
        format_version: "v5-publication/1",
        world_id: worldId,
        served_revision: 31,
        current_revision: 31,
        publication_target_revision: 31,
        projection_status: "ready",
        manifest_key: rootKey,
        manifest_sha256: createHash("sha256").update(root).digest("hex"),
        generated_at: "2026-09-24T00:00:00.000Z"
      })
    );
    const event = await POST(
      request({ world_id: worldId, kind: "event", event_id: eventId })
    );
    expect(event.status).toBe(200);
    expect((await event.json()).data).toMatchObject({
      event: { id: eventId },
      narrative: { body: "World Event" }
    });
    for (const collectionId of collectionIds) {
      const collection = await POST(
        request({
          world_id: worldId,
          kind: "collection",
          collection_id: collectionId,
          page: 0
        })
      );
      expect(collection.status).toBe(200);
      expect((await collection.json()).data).toMatchObject({
        event_ids: [eventId],
        narrative: { body: "Selection" }
      });
    }
    expect(
      (
        await POST(
          request({
            world_id: worldId,
            kind: "relation",
            relation_id: id("09")
          })
        )
      ).status
    ).toBe(404);
    objects.set(rootKey, "tampered");
    expect(
      (
        await POST(
          request({ world_id: worldId, kind: "event", event_id: eventId })
        )
      ).status
    ).toBe(503);
  });
});
