import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildV5SpatialStagedArtifacts,
  buildV5StagedIndex,
  finalizeV5VerifiedSpatialArtifacts
} from "./v5-staging.js";
import { publishV5CompleteArtifacts, readV5ServedRoot } from "./v5-serving.js";

describe("v5 serving pointer fail-closed boundary", () => {
  it("uploads a proven complete tree before a conditional v4-to-v5 pointer swap", async () => {
    const state = {
      world: {
        id: "world-1",
        slug: "history",
        title: "History",
        description: null
      },
      collections: [],
      events: [],
      relations: [],
      narratives: [],
      eventCollectionMemberships: [],
      timeSystems: [],
      collectionTimeSystems: []
    };
    const complete = finalizeV5VerifiedSpatialArtifacts(
      state,
      buildV5SpatialStagedArtifacts(state, 31, [])
    );
    const pointerKey = "worlds/world-1/current.json";
    const objects = new Map<string, { body: string; etag: string }>([
      [
        pointerKey,
        {
          body: JSON.stringify({
            world_id: "world-1",
            served_revision: 30,
            current_revision: 30,
            publication_target_revision: 30,
            format_version: "3.0.0"
          }),
          etag: '"v4"'
        }
      ]
    ]);
    let revision = 0;
    let failImmutable = true;
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
        if (options?.immutable && failImmutable)
          return { status: 503, etag: null };
        const prior = objects.get(key);
        if (
          (options?.immutable && prior) ||
          (options?.ifMatch && options.ifMatch !== prior?.etag) ||
          (options?.ifNoneMatch && prior)
        )
          return { status: 412, etag: prior?.etag ?? null };
        const etag = `"${++revision}"`;
        objects.set(key, { body, etag });
        return { status: 200, etag };
      }
    };
    const original = objects.get(pointerKey)!.body;
    await expect(
      publishV5CompleteArtifacts(store, complete, "2026-09-24T00:00:00Z")
    ).rejects.toThrow("v5_immutable_write_failed");
    expect(objects.get(pointerKey)!.body).toBe(original);
    failImmutable = false;
    objects.set(pointerKey, {
      body: JSON.stringify({
        ...JSON.parse(original),
        current_revision: 32,
        publication_target_revision: 32
      }),
      etag: '"ahead"'
    });
    await expect(
      publishV5CompleteArtifacts(store, complete, "2026-09-24T00:00:00Z")
    ).rejects.toThrow("v5_complete_pointer_previous_invalid");
    objects.set(pointerKey, { body: original, etag: '"v4"' });
    const pointer = await publishV5CompleteArtifacts(
      store,
      complete,
      "2026-09-24T00:00:00Z"
    );
    expect(pointer.served_revision).toBe(31);
    expect((await readV5ServedRoot(store, "world-1")).rootBody).toBe(
      complete.root.body
    );
    expect(
      await publishV5CompleteArtifacts(store, complete, "2026-09-24T00:00:00Z")
    ).toEqual(pointer);
    objects.set(pointerKey, {
      body: JSON.stringify({ ...pointer, manifest_sha256: "0".repeat(64) }),
      etag: '"conflicting"'
    });
    await expect(
      publishV5CompleteArtifacts(store, complete, "2026-09-24T00:00:00Z")
    ).rejects.toThrow("v5_complete_pointer_revision_conflict");
  });
  it("refuses v4 and incomplete v5 pointers", async () => {
    const built = buildV5StagedIndex("world-1", 31, []);
    const objects = new Map<string, string>([
      [built.root.key, built.root.body]
    ]);
    const store = {
      get: async (key: string) => ({
        status: objects.has(key) ? 200 : 404,
        body: objects.get(key) ?? null,
        etag: null
      })
    };
    const pointerKey = "worlds/world-1/current.json";
    const completeKey = "worlds/world-1/revisions/31/v5/complete/manifest.json";
    objects.set(
      pointerKey,
      JSON.stringify({
        world_id: "world-1",
        served_revision: 31,
        format_version: "3.0.0"
      })
    );
    await expect(readV5ServedRoot(store, "world-1")).rejects.toThrow(
      "v5_publication_pointer_invalid"
    );
    const pointer = {
      world_id: "world-1",
      format_version: "v5-publication/1",
      served_revision: 31,
      current_revision: 31,
      publication_target_revision: 31,
      projection_status: "ready",
      manifest_key: completeKey,
      manifest_sha256: createHash("sha256")
        .update(built.root.body)
        .digest("hex"),
      generated_at: "2026-09-24T00:00:00.000Z"
    };
    objects.set(completeKey, built.root.body);
    objects.set(pointerKey, JSON.stringify(pointer));
    await expect(readV5ServedRoot(store, "world-1")).rejects.toThrow(
      "v5_publication_incomplete"
    );
    objects.set(
      pointerKey,
      JSON.stringify({ ...pointer, manifest_sha256: "0".repeat(64) })
    );
    await expect(readV5ServedRoot(store, "world-1")).rejects.toThrow(
      "v5_publication_root_digest_mismatch"
    );
    const complete = JSON.stringify({
      ...JSON.parse(built.root.body),
      completeness: "complete"
    });
    objects.set(completeKey, complete);
    objects.set(
      pointerKey,
      JSON.stringify({
        ...pointer,
        manifest_sha256: createHash("sha256").update(complete).digest("hex")
      })
    );
    expect((await readV5ServedRoot(store, "world-1")).rootBody).toBe(complete);
  });
});
