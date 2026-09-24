import { describe, expect, it } from "vitest";
import { verifyV5StagedIndex } from "@moirai/publication/v5";
import { readV5StagedEvent } from "@moirai/publication/v5";
import {
  buildV5WorldSpatialStagedArtifacts,
  readV5AuthenticatedViewport
} from "./v5-spatial-publication.js";
import { projectV5WorldTemporal } from "@moirai/projections";
import { buildV5WorldLayout } from "./v5-world-layout.js";
import { buildV5SpatialIndex } from "./v5-spatial-index.js";
import { buildV5SpatialStagedArtifacts } from "@moirai/publication/v5";
import type { CanonicalState } from "@moirai/contracts/v5";

const state: CanonicalState = {
  world: {
    id: "world-1",
    slug: "history",
    title: "Actual history",
    description: null
  },
  collections: ["joseon", "japan"].map((id) => ({
    id,
    world_id: "world-1",
    slug: id,
    title: id,
    description: null
  })),
  events: ["coup", "outside"].map((id) => ({
    id,
    world_id: "world-1",
    slug: null,
    title: id,
    summary: null,
    roles: [],
    attributes: {}
  })),
  eventCollectionMemberships: ["joseon", "japan"].map((id) => ({
    event_id: "coup",
    collection_id: id
  })),
  relations: [
    {
      id: "date",
      world_id: "world-1",
      type: "coincides",
      direction: "undirected",
      source_ref: { kind: "event", event_id: "coup" },
      target_ref: {
        kind: "time_event",
        time_system_ref: { time_system_id: "gregorian" },
        definition_version: "1",
        coordinate: "1453-01-01T00:00:00.000000000000Z"
      },
      attributes: {}
    }
  ],
  narratives: [
    ...["coup", "outside"].map((id) => ({
      id: `n-${id}`,
      world_id: "world-1",
      scope_type: "event" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: "Event",
      public_references: [],
      notes: []
    })),
    ...["joseon", "japan"].map((id) => ({
      id: `n-${id}`,
      world_id: "world-1",
      scope_type: "collection" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: "Collection",
      public_references: [],
      notes: []
    }))
  ],
  timeSystems: [
    {
      id: "gregorian",
      world_id: "world-1",
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

describe("authenticated v5 World viewport rehearsal", () => {
  it("indexes every World Time System with one World-owned shared Event and detects tampering", async () => {
    const artifacts = buildV5WorldSpatialStagedArtifacts(state, 31);
    verifyV5StagedIndex(artifacts);
    expect(JSON.parse(artifacts.root.body).completeness).toBe(
      "content-temporal-and-spatial-staged"
    );
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
    const result = await readV5AuthenticatedViewport(
      artifacts.root.body,
      "world-1",
      31,
      "gregorian",
      { minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6 },
      32,
      null,
      get
    );
    expect(result.shapes.map((shape) => shape.event_id)).toEqual(["coup"]);
    expect(result.object_reads).toBe(reads.length);
    expect(result.object_reads).toBeLessThan(256);
    expect(
      (await readV5StagedEvent(artifacts.root.body, "world-1", 31, "coup", get))
        ?.narrative.scope_id
    ).toBe("coup");
    const nodeKey = reads.find(
      (key) => key.includes("/spatial/") && key.includes("/nodes/")
    )!;
    objects.set(nodeKey, "corrupted");
    await expect(
      readV5AuthenticatedViewport(
        artifacts.root.body,
        "world-1",
        31,
        "gregorian",
        { minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6 },
        32,
        null,
        get
      )
    ).rejects.toThrow("v5_index_digest_mismatch");
  });
  it("refuses missing systems and a temporal digest from another revision", () => {
    const temporal = projectV5WorldTemporal(state, 31);
    const bundle = buildV5SpatialIndex(
      buildV5WorldLayout(state, temporal, "gregorian")
    );
    expect(() => buildV5SpatialStagedArtifacts(state, 31, [])).toThrow(
      "v5_spatial_system_coverage_invalid"
    );
    expect(() =>
      buildV5SpatialStagedArtifacts(state, 31, [
        { ...bundle, time_system_id: "gregorian", temporal_digest: "wrong" }
      ])
    ).toThrow("v5_spatial_manifest_invalid");
  });
});
