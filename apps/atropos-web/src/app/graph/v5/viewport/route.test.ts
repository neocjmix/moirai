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
const collectionId = id("02");
const eventId = id("03");
const timeSystemId = id("04");
const state: CanonicalState = {
  world: {
    id: worldId,
    slug: "history",
    title: "Actual history",
    description: null
  },
  collections: [
    {
      id: collectionId,
      world_id: worldId,
      slug: "joseon",
      title: "Joseon",
      description: null
    }
  ],
  events: [
    {
      id: eventId,
      world_id: worldId,
      slug: null,
      title: "Coup",
      summary: null,
      roles: [],
      attributes: {}
    }
  ],
  eventCollectionMemberships: [
    { event_id: eventId, collection_id: collectionId }
  ],
  relations: [
    {
      id: id("05"),
      world_id: worldId,
      type: "coincides",
      direction: "undirected",
      source_ref: { kind: "event", event_id: eventId },
      target_ref: {
        kind: "time_event",
        time_system_ref: { time_system_id: timeSystemId },
        definition_version: "1",
        coordinate: "1453-01-01T00:00:00.000000000000Z"
      },
      attributes: {}
    }
  ],
  narratives: [
    {
      id: id("06"),
      world_id: worldId,
      scope_type: "event",
      scope_id: eventId,
      locale: "ko",
      title: null,
      body: "An account",
      public_references: [],
      notes: []
    },
    {
      id: id("07"),
      world_id: worldId,
      scope_type: "collection",
      scope_id: collectionId,
      locale: "ko",
      title: null,
      body: "A selection",
      public_references: [],
      notes: []
    }
  ],
  timeSystems: [
    {
      id: timeSystemId,
      world_id: worldId,
      slug: "gregorian",
      title: "Gregorian",
      kind: "calendar",
      definition_version: "1",
      definition: {
        coordinate_codec: "yyyy-iso-fields-fraction12-z-v1",
        calendar: "proleptic-gregorian",
        timezone: "UTC",
        fractional_digits: 12,
        leap_second_policy: "reject",
        interval_policy: "half-open",
        capabilities: [
          "canonicalize",
          "equality",
          "compare",
          "boundary",
          "difference"
        ]
      }
    }
  ],
  collectionTimeSystems: []
};
const body = (overrides: Record<string, unknown> = {}) => ({
  world_id: worldId,
  time_system_id: timeSystemId,
  collection_ids: [collectionId],
  viewport: { minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6 },
  ...overrides
});
const request = (value: unknown) =>
  new Request("http://localhost/graph/v5/viewport", {
    method: "POST",
    body: JSON.stringify(value)
  });

describe("v5 viewport route serving gate", () => {
  beforeEach(() => objects.clear());
  it("refuses invalid input and the live v4 pointer", async () => {
    expect(
      (await POST(request({ ...body(), obsolete_canon_id: id("09") }))).status
    ).toBe(400);
    objects.set(
      `worlds/${worldId}/current.json`,
      JSON.stringify({
        format_version: "3.0.0",
        world_id: worldId,
        served_revision: 30
      })
    );
    expect((await POST(request(body()))).status).toBe(503);
  });
  it("serves only a digest-authenticated complete revision and one selected World Event", async () => {
    const artifacts = buildV5WorldSpatialStagedArtifacts(state, 31);
    for (const object of [...artifacts.documents, ...artifacts.index])
      objects.set(object.key, object.body);
    const pointerKey = `worlds/${worldId}/current.json`;
    const completeKey = `worlds/${worldId}/revisions/31/v5/complete/manifest.json`;
    const stagedRoot = artifacts.root.body;
    objects.set(completeKey, stagedRoot);
    const pointer = (root: string) =>
      JSON.stringify({
        format_version: "v5-publication/1",
        world_id: worldId,
        served_revision: 31,
        current_revision: 31,
        publication_target_revision: 31,
        projection_status: "ready",
        manifest_key: completeKey,
        manifest_sha256: createHash("sha256").update(root).digest("hex"),
        generated_at: "2026-09-24T00:00:00.000Z"
      });
    objects.set(pointerKey, pointer(stagedRoot));
    expect((await POST(request(body()))).status).toBe(503);
    // Test-only completed namespace. The production builder cannot emit it yet.
    expect(JSON.parse(stagedRoot).index_depth).toBe(1);
    const stagedIndex = artifacts.index[0]!;
    const completeIndexKey = stagedIndex.key.replace(
      "/v5/staging/content-temporal-and-spatial-staged/index/",
      "/v5/complete/index/"
    );
    objects.set(completeIndexKey, stagedIndex.body);
    const complete = JSON.stringify({
      ...JSON.parse(stagedRoot),
      completeness: "complete",
      entries: JSON.parse(stagedRoot).entries.map((ref: { key: string }) => ({
        ...ref,
        key: completeIndexKey
      }))
    });
    objects.set(completeKey, complete);
    objects.set(pointerKey, pointer(complete));
    const response = await POST(request(body()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      world_id: worldId,
      served_revision: 31,
      shapes: [{ event_id: eventId }],
      next_cursor: null
    });
    const stale = await POST(
      request(
        body({
          cursor: {
            selection_digest: "0".repeat(64),
            spatial: {
              query_digest: "0".repeat(64),
              pending: [
                {
                  key: `${completeKey}/wrong`,
                  level: 0,
                  offset: 0,
                  bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 }
                }
              ]
            }
          }
        })
      )
    );
    expect(stale.status).toBe(400);
    objects.set(completeKey, "tampered");
    expect((await POST(request(body()))).status).toBe(503);
  });
});
