import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildV5StagedIndex } from "./v5-staging.js";
import { readV5ServedRoot } from "./v5-serving.js";

describe("v5 serving pointer fail-closed boundary", () => {
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
