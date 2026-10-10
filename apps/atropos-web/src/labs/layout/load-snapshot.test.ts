import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildV5WorldCompleteArtifacts,
  prepareV5LayoutInput
} from "@moirai/graph-presentation/server";
import {
  computeLayout,
  CANONICAL_LAYOUT_SELECTION
} from "@moirai/graph-presentation/layout-engine";
import { projectV5WorldTemporal } from "@moirai/projections";
import {
  createSyntheticLabState,
  SYNTHETIC_LAB_TIME_SYSTEM_ID,
  SYNTHETIC_LAB_WORLD_ID
} from "./fixtures";
import { loadLayoutLabSnapshot } from "./load-snapshot";
import { snapshotDigestPayload } from "./types";

const digest = (body: string) =>
  createHash("sha256").update(body).digest("hex");
const state = createSyntheticLabState();
const revision = 7;
let immutable: Map<string, string>;
let sourceRootDigest: string;

beforeAll(async () => {
  // In-memory synthetic compilation is test setup, never a Lab loading path.
  const { artifacts } = await buildV5WorldCompleteArtifacts(state, revision);
  sourceRootDigest = digest(artifacts.root.body);
  immutable = new Map(
    [...artifacts.documents, ...artifacts.index, artifacts.root].map(
      ({ key, body }) => [key, body]
    )
  );
  immutable.set(
    `worlds/${state.world.id}/current.json`,
    JSON.stringify({
      format_version: "v5-publication/1",
      world_id: state.world.id,
      served_revision: revision,
      current_revision: revision,
      publication_target_revision: revision,
      projection_status: "ready",
      manifest_key: artifacts.root.key,
      manifest_sha256: sourceRootDigest,
      generated_at: "2026-10-04T00:00:00.000Z"
    })
  );
}, 30_000);

function readOnlyStore(values = immutable) {
  const reads: string[] = [];
  return {
    reads,
    async get(key: string) {
      reads.push(key);
      const body = values.get(key);
      return body === undefined
        ? { status: 404, body: null, etag: null }
        : { status: 200, body, etag: null };
    }
  };
}

describe("read-only published Layout Lab snapshot", () => {
  it("pins one verified root and reproduces the canonical baseline without a write capability", async () => {
    const store = readOnlyStore();
    const snapshot = await loadLayoutLabSnapshot(
      state.world.id,
      revision,
      SYNTHETIC_LAB_TIME_SYSTEM_ID,
      store
    );
    const input = prepareV5LayoutInput(
      state,
      projectV5WorldTemporal(state, revision),
      SYNTHETIC_LAB_TIME_SYSTEM_ID
    );
    expect(computeLayout(snapshot.input, CANONICAL_LAYOUT_SELECTION)).toEqual(
      computeLayout(input, CANONICAL_LAYOUT_SELECTION)
    );
    expect(snapshot.sourceRootDigest).toBe(sourceRootDigest);
    expect(snapshot.inputDigest).toBe(digest(snapshotDigestPayload(snapshot)));
    expect(snapshot.sourceRevision).toBe(revision);
    expect(snapshot.servedRevision).toBe(revision);
    expect(
      store.reads.filter((key) => key.endsWith("/current.json"))
    ).toHaveLength(1);
    expect(
      store.reads.every(
        (key) =>
          key.endsWith("/current.json") ||
          key.includes(`/revisions/${revision}/v5/`)
      )
    ).toBe(true);
    const readsAfterLoad = store.reads.length;
    computeLayout(snapshot.input, CANONICAL_LAYOUT_SELECTION);
    computeLayout(snapshot.input, {
      ...CANONICAL_LAYOUT_SELECTION,
      parameters: { ...CANONICAL_LAYOUT_SELECTION.parameters, cohesion: 0.2 }
    });
    expect(store.reads).toHaveLength(readsAfterLoad);
    expect(
      snapshot.events.find((event) => event.id === "shared")?.collectionIds
    ).toHaveLength(2);
    expect(
      snapshot.events.find((event) => event.id === "outer-process")?.childIds
    ).toContain("inner-process");
    expect(JSON.stringify(snapshot)).not.toContain("public_references");
    expect(JSON.stringify(snapshot)).not.toContain("origin_refs");
  });

  it("is deterministic across fresh loads and includes unselected Events", async () => {
    const first = await loadLayoutLabSnapshot(
      state.world.id,
      revision,
      undefined,
      readOnlyStore()
    );
    const second = await loadLayoutLabSnapshot(
      state.world.id,
      revision,
      undefined,
      readOnlyStore()
    );
    expect(first).toEqual(second);
    expect(first.events).toHaveLength(state.events.length);
    expect(first.events.some((event) => event.id === "unplaced")).toBe(true);
    expect(first.input.dataset.events).toHaveLength(state.events.length);
  });

  it("rejects a requested stale revision before scanning World content", async () => {
    const store = readOnlyStore();
    await expect(
      loadLayoutLabSnapshot(
        SYNTHETIC_LAB_WORLD_ID,
        revision - 1,
        undefined,
        store
      )
    ).rejects.toThrow("lab_snapshot_revision_changed");
    expect(store.reads).toHaveLength(2);
  });

  it("fails closed when an authenticated layout fact is missing or tampered", async () => {
    const key = `worlds/${state.world.id}/revisions/${revision}/v5/content/events/shared/detail.json`;
    for (const body of [null, "{}"] as const) {
      const damaged = new Map(immutable);
      if (body === null) damaged.delete(key);
      else damaged.set(key, body);
      await expect(
        loadLayoutLabSnapshot(
          state.world.id,
          revision,
          undefined,
          readOnlyStore(damaged)
        )
      ).rejects.toThrow(
        /lab_snapshot_object_unavailable|v5_index_digest_mismatch/
      );
    }
  });

  it("rejects withdrawn Worlds and root digest mismatch", async () => {
    const key = `worlds/${state.world.id}/current.json`;
    const pointer = JSON.parse(immutable.get(key)!);
    for (const changes of [
      { withdrawn: true },
      { manifest_sha256: "0".repeat(64) }
    ]) {
      const damaged = new Map(immutable);
      damaged.set(key, JSON.stringify({ ...pointer, ...changes }));
      await expect(
        loadLayoutLabSnapshot(
          state.world.id,
          undefined,
          undefined,
          readOnlyStore(damaged)
        )
      ).rejects.toThrow(
        /v5_world_withdrawn|v5_publication_root_digest_mismatch/
      );
    }
  });
});
