import { describe, expect, it } from "vitest";
import {
  verifyV5StagedIndex,
  finalizeV5VerifiedSpatialArtifacts
} from "@moirai/publication/v5";
import { readV5StagedEvent } from "@moirai/publication/v5";
import {
  buildV5WorldCompleteArtifacts,
  buildV5WorldSpatialStagedArtifacts,
  readV5AuthenticatedViewport,
  readV5SelectedViewport
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
  it("finalizes only a verified full-selection tree under an independent complete namespace", async () => {
    const { artifacts, proof } = await buildV5WorldCompleteArtifacts(state, 31);
    verifyV5StagedIndex(artifacts);
    expect(artifacts.root.key).toBe(
      "worlds/world-1/revisions/31/v5/complete/manifest.json"
    );
    expect(JSON.parse(artifacts.root.body).completeness).toBe("complete");
    expect(proof).toMatchObject({ placed: 1, unplaced: 1 });
    const objects = new Map(
      [...artifacts.documents, ...artifacts.index].map(({ key, body }) => [
        key,
        body
      ])
    );
    const get = async (key: string) => objects.get(key) ?? null;
    const event = await readV5StagedEvent(
      artifacts.root.body,
      "world-1",
      31,
      "coup",
      get
    );
    expect(event?.narrative.body).toBe("Event");
    const page = await readV5SelectedViewport(
      artifacts.root.body,
      "world-1",
      31,
      "gregorian",
      { minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6 },
      ["japan", "joseon"],
      null,
      get
    );
    expect(page.shapes.map((shape) => shape.event_id)).toEqual(["coup"]);
    expect(page.object_reads).toBeLessThanOrEqual(256);
    const key =
      "worlds/world-1/revisions/31/v5/content/events/coup/detail.json";
    objects.set(key, "tampered");
    await expect(
      readV5StagedEvent(artifacts.root.body, "world-1", 31, "coup", get)
    ).rejects.toThrow("v5_index_digest_mismatch");
  });
  it("pages a dense selection without skipping candidates or accepting a changed selection cursor", async () => {
    const ids = [
      "selected-1",
      "selected-2",
      "selected-3",
      "selected-4",
      "selected-5"
    ];
    const crowded: CanonicalState = {
      ...state,
      events: [
        ...state.events,
        ...ids.map((id) => ({ ...state.events[0]!, id, title: id }))
      ],
      eventCollectionMemberships: [
        ...state.eventCollectionMemberships,
        ...ids.map((event_id) => ({ event_id, collection_id: "joseon" }))
      ],
      narratives: [
        ...state.narratives,
        ...ids.map((id) => ({
          ...state.narratives[0]!,
          id: `n-${id}`,
          scope_type: "event" as const,
          scope_id: id
        }))
      ],
      relations: [
        ...state.relations,
        ...ids.map((id, index) => ({
          ...state.relations[0]!,
          id: `date-${id}`,
          source_ref: { kind: "event" as const, event_id: id },
          target_ref: {
            ...state.relations[0]!.target_ref,
            coordinate: `145${index + 4}-01-01T00:00:00.000000000000Z`
          }
        }))
      ]
    };
    const artifacts = buildV5WorldSpatialStagedArtifacts(crowded, 31);
    const objects = new Map(
      [...artifacts.documents, ...artifacts.index].map(({ key, body }) => [
        key,
        body
      ])
    );
    const fetched: string[] = [];
    const get = async (key: string) => {
      fetched.push(key);
      return objects.get(key) ?? null;
    };
    const viewport = { minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6 };
    let cursor = null;
    const seen: string[] = [];
    do {
      fetched.length = 0;
      const page = await readV5SelectedViewport(
        artifacts.root.body,
        "world-1",
        31,
        "gregorian",
        viewport,
        ["joseon"],
        cursor,
        get
      );
      expect(page.object_reads).toBeLessThanOrEqual(256);
      expect(fetched.length).toBe(page.object_reads);
      expect(new Set(fetched).size).toBe(fetched.length);
      seen.push(...page.shapes.map((shape) => shape.event_id));
      cursor = page.next_cursor;
      if (cursor)
        await expect(
          readV5SelectedViewport(
            artifacts.root.body,
            "world-1",
            31,
            "gregorian",
            viewport,
            ["japan"],
            cursor,
            get
          )
        ).rejects.toThrow("v5_viewport_selection_cursor_invalid");
    } while (cursor);
    expect(seen.sort()).toEqual(["coup", ...ids]);
  });
  it.each([9, 16, 30, 32, 64])(
    "unions %i Collections with stable coordinates and advancing pages",
    async (count) => {
      const ids = Array.from(
        { length: count },
        (_, i) => `collection-${String(i).padStart(3, "0")}`
      );
      const expanded: CanonicalState = {
        ...state,
        collections: ids.map((id) => ({
          ...state.collections[0]!,
          id,
          slug: id
        })),
        collectionTimeSystems: [],
        events: [
          state.events[0]!,
          ...ids.map((id) => ({ ...state.events[0]!, id }))
        ],
        narratives: [
          ...ids.map((id) => ({
            ...state.narratives[0]!,
            id: `n-${id}`,
            scope_type: "collection" as const,
            scope_id: id
          })),
          ...["coup", ...ids].map((id) => ({
            ...state.narratives[0]!,
            id: `event-n-${id}`,
            scope_type: "event" as const,
            scope_id: id
          }))
        ],
        eventCollectionMemberships: ids.flatMap((id) => [
          { collection_id: id, event_id: "coup" },
          { collection_id: id, event_id: id }
        ]),
        relations: [
          state.relations[0]!,
          ...ids.map((id) => ({
            ...state.relations[0]!,
            id: `date-${id}`,
            source_ref: { kind: "event" as const, event_id: id }
          }))
        ]
      };
      const artifacts = buildV5WorldSpatialStagedArtifacts(expanded, 31);
      const objects = new Map(
        [...artifacts.documents, ...artifacts.index].map(({ key, body }) => [
          key,
          body
        ])
      );
      const fetched: string[] = [];
      const get = async (key: string) => {
        fetched.push(key);
        return objects.get(key) ?? null;
      };
      const viewport = { minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6 };
      const whole = await readV5AuthenticatedViewport(
        artifacts.root.body,
        "world-1",
        31,
        "gregorian",
        viewport,
        128,
        null,
        get
      );
      let cursor: Parameters<typeof readV5SelectedViewport>[6] = null;
      const seen = new Map<string, (typeof whole.shapes)[number]>();
      const tokens = new Set<string>();
      do {
        fetched.length = 0;
        const page = await readV5SelectedViewport(
          artifacts.root.body,
          "world-1",
          31,
          "gregorian",
          viewport,
          ids,
          cursor,
          get
        );
        expect(page.object_reads).toBeLessThanOrEqual(
          256 * Math.ceil(count / 8)
        );
        expect(fetched.length).toBe(new Set(fetched).size);
        expect(page.object_reads).toBe(fetched.length);
        for (const shape of page.shapes) {
          expect(seen.has(shape.event_id)).toBe(false);
          seen.set(shape.event_id, shape);
        }
        cursor = page.next_cursor;
        if (cursor) {
          const token = JSON.stringify(cursor);
          expect(tokens.has(token)).toBe(false);
          tokens.add(token);
        }
      } while (cursor);
      expect([...seen.keys()].sort()).toEqual(["coup", ...ids].sort());
      expect(
        [...seen.values()].sort((a, b) => a.event_id.localeCompare(b.event_id))
      ).toEqual(
        [...whole.shapes].sort((a, b) => a.event_id.localeCompare(b.event_id))
      );
    }
  );
  it("intersects viewport and Collection selection without duplicating a shared World Event", async () => {
    const artifacts = buildV5WorldSpatialStagedArtifacts(state, 31);
    const objects = new Map(
      [...artifacts.documents, ...artifacts.index].map(({ key, body }) => [
        key,
        body
      ])
    );
    const get = async (key: string) => objects.get(key) ?? null;
    const viewport = { minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6 };
    const both = await readV5SelectedViewport(
      artifacts.root.body,
      "world-1",
      31,
      "gregorian",
      viewport,
      ["japan", "joseon"],
      null,
      get
    );
    expect(both.shapes.map((shape) => shape.event_id)).toEqual(["coup"]);
    expect(both.object_reads).toBeLessThanOrEqual(256);
    const single = await readV5SelectedViewport(
      artifacts.root.body,
      "world-1",
      31,
      "gregorian",
      viewport,
      ["joseon"],
      null,
      get
    );
    expect(single.shapes).toEqual(both.shapes);
    expect(
      (
        await readV5SelectedViewport(
          artifacts.root.body,
          "world-1",
          31,
          "gregorian",
          viewport,
          [],
          null,
          get
        )
      ).shapes
    ).toEqual([]);
    await expect(
      readV5SelectedViewport(
        artifacts.root.body,
        "world-1",
        31,
        "gregorian",
        viewport,
        ["unknown"],
        null,
        get
      )
    ).rejects.toThrow("v5_viewport_collection_missing");
    // The inline selection is authenticated through its spatial leaf.
    const marker = artifacts.documents.find((item) =>
      item.key.includes("/spatial/gregorian/nodes/0/")
    )!.key;
    objects.set(marker, "altered");
    await expect(
      readV5SelectedViewport(
        artifacts.root.body,
        "world-1",
        31,
        "gregorian",
        viewport,
        ["joseon"],
        null,
        get
      )
    ).rejects.toThrow("v5_index_digest_mismatch");
  });
  it("rejects canonically wrong inline titles and memberships even with a rebuilt valid index", () => {
    const temporal = projectV5WorldTemporal(state, 31);
    const layout = buildV5WorldLayout(state, temporal, "gregorian");
    for (const read_hint of [
      { title: "wrong", collection_ids: ["japan", "joseon"] },
      { title: "coup", collection_ids: ["joseon"] }
    ]) {
      const spatial = buildV5SpatialIndex({
        ...layout,
        shapes: layout.shapes.map((shape) => ({ ...shape, read_hint }))
      });
      const staged = buildV5SpatialStagedArtifacts(state, 31, [
        {
          time_system_id: "gregorian",
          temporal_digest: temporal.semantic_digest,
          ...spatial
        }
      ]);
      expect(() => finalizeV5VerifiedSpatialArtifacts(state, staged)).toThrow(
        "v5_complete_spatial_hint_invalid"
      );
    }
  });
  it("reads legacy leaves without hints and authenticates their membership objects", async () => {
    const temporal = projectV5WorldTemporal(state, 31);
    const layout = buildV5WorldLayout(state, temporal, "gregorian");
    const spatial = buildV5SpatialIndex(layout);
    const staged = buildV5SpatialStagedArtifacts(state, 31, [
      {
        time_system_id: "gregorian",
        temporal_digest: temporal.semantic_digest,
        ...spatial
      }
    ]);
    const objects = new Map(
      [...staged.documents, ...staged.index].map((item) => [
        item.key,
        item.body
      ])
    );
    const get = async (key: string) => objects.get(key) ?? null;
    const read = () =>
      readV5SelectedViewport(
        staged.root.body,
        "world-1",
        31,
        "gregorian",
        { minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6 },
        ["joseon"],
        null,
        get
      );
    expect((await read()).shapes.map((shape) => shape.event_id)).toEqual([
      "coup"
    ]);
    objects.set(
      "worlds/world-1/revisions/31/v5/content/event-selection/coup/joseon.json",
      "altered"
    );
    await expect(read()).rejects.toThrow("v5_index_digest_mismatch");
  });
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
