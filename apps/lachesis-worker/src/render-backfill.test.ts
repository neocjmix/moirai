import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { buildV5WorldCompleteArtifacts } from "@moirai/graph-presentation/server";
import {
  publishV5CompleteArtifacts,
  readV5RenderGeneration,
  readV5ServedRoot
} from "@moirai/publication/v5";
import { backfillV5RenderGeneration } from "./render-backfill.js";
import { defaultLayoutSelection } from "@moirai/graph-presentation/layout-engine";

const state: CanonicalState = {
  world: {
    id: "world-1",
    slug: "history",
    title: "History",
    description: null
  },
  collections: [
    {
      id: "c",
      world_id: "world-1",
      slug: "c",
      title: "Collection",
      description: null
    }
  ],
  events: [
    {
      id: "e",
      world_id: "world-1",
      slug: null,
      title: "Event",
      summary: null,
      roles: [],
      attributes: {}
    }
  ],
  eventCollectionMemberships: [{ event_id: "e", collection_id: "c" }],
  relations: [
    {
      id: "date",
      world_id: "world-1",
      type: "coincides",
      direction: "undirected",
      source_ref: { kind: "event", event_id: "e" },
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
    {
      id: "n-e",
      world_id: "world-1",
      scope_type: "event",
      scope_id: "e",
      locale: "ko",
      title: null,
      body: "Event",
      public_references: [],
      notes: []
    },
    {
      id: "n-c",
      world_id: "world-1",
      scope_type: "collection",
      scope_id: "c",
      locale: "ko",
      title: null,
      body: "Collection",
      public_references: [],
      notes: []
    }
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

describe("operator Render backfill", () => {
  it("adds a complete generation without changing the canonical served root", async () => {
    const objects = new Map<string, { body: string; etag: string }>();
    let number = 0;
    const store = {
      get: async (key: string) => ({
        status: objects.has(key) ? 200 : 404,
        body: objects.get(key)?.body ?? null,
        etag: objects.get(key)?.etag ?? null
      }),
      put: async (
        key: string,
        body: string,
        options?: {
          immutable?: boolean;
          ifMatch?: string;
          ifNoneMatch?: boolean;
        }
      ) => {
        const previous = objects.get(key);
        if (
          (options?.immutable && previous) ||
          (options?.ifNoneMatch && previous) ||
          (options?.ifMatch && options.ifMatch !== previous?.etag)
        )
          return { status: 412, etag: previous?.etag ?? null };
        const etag = `"${++number}"`;
        objects.set(key, { body, etag });
        return { status: 201, etag };
      }
    };
    const { artifacts } = await buildV5WorldCompleteArtifacts(state, 7);
    await publishV5CompleteArtifacts(store, artifacts, "2026-09-29T00:00:00Z");
    const original = (await readV5ServedRoot(store, "world-1")).pointer;
    const result = await backfillV5RenderGeneration({
      state,
      revision: 7,
      store
    });
    expect(result.documentCount).toBeGreaterThan(2);
    expect((await readV5ServedRoot(store, "world-1")).pointer).toEqual(
      original
    );
    const generation = await readV5RenderGeneration(store, "world-1");
    const ref = generation.manifests[0]!;
    const manifest = JSON.parse(await generation.read(ref.key, ref.sha256));
    expect(manifest.tiles.length).toBeGreaterThan(0);
    expect(manifest.layoutAlgorithmVersion).toBe("global-incidence/1");
    expect(
      await backfillV5RenderGeneration({ state, revision: 7, store })
    ).toEqual(result);
    const rollbackKey = "worlds/world-1/render-rollbacks/test-rollout.json";
    const priorPointer = objects.get(
      "worlds/world-1/render-current.json"
    )!.body;
    const rollbackResult = await backfillV5RenderGeneration({
      state,
      revision: 7,
      store,
      layoutSelection: defaultLayoutSelection("legacy-force"),
      rollbackSnapshotKey: rollbackKey
    });
    const backup = JSON.parse(objects.get(rollbackKey)!.body);
    expect(backup.previousPointer).toEqual(JSON.parse(priorPointer));
    expect(backup.expectedGeneration).toBe(rollbackResult.generation);
    expect((await readV5ServedRoot(store, "world-1")).pointer).toEqual(
      original
    );
    const rolledBack = await readV5RenderGeneration(store, "world-1");
    const rolledRef = rolledBack.manifests[0]!;
    expect(
      JSON.parse(await rolledBack.read(rolledRef.key, rolledRef.sha256))
        .layoutAlgorithmVersion
    ).toMatch(/^v5-world-layout\//);
    expect(
      await backfillV5RenderGeneration({
        state,
        revision: 7,
        store,
        layoutSelection: defaultLayoutSelection("legacy-force"),
        rollbackSnapshotKey: rollbackKey
      })
    ).toEqual(rollbackResult);
    expect(JSON.parse(objects.get(rollbackKey)!.body).previousPointer).toEqual(
      backup.previousPointer
    );
    await expect(
      backfillV5RenderGeneration({
        state,
        revision: 7,
        store,
        rollbackSnapshotKey: rollbackKey
      })
    ).rejects.toThrow("render_rollback_backup_conflict");
    await expect(
      backfillV5RenderGeneration({ state, revision: 6, store })
    ).rejects.toThrow("render_backfill_revision_mismatch");
  });
});
