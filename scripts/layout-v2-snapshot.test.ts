import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildV5StagedIndex,
  finalizeV5VerifiedSpatialArtifacts
} from "../packages/publication/src/v5-staging";
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
} from "./fixtures/layout-baseline";
import { loadLayoutV2Snapshot } from "../apps/atropos-web/src/lib/layout-v2-snapshot";
import { snapshotDigestPayload } from "../apps/atropos-web/src/lib/layout-v2-types";

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
    const snapshot = await loadLayoutV2Snapshot(
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
    expect(snapshot.baseline).toEqual(computeLayout(input));
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
    const first = await loadLayoutV2Snapshot(
      state.world.id,
      revision,
      undefined,
      readOnlyStore()
    );
    const second = await loadLayoutV2Snapshot(
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

  it("loads indexes and facts concurrently within one bound without changing snapshot bytes", async () => {
    const expected = await loadLayoutV2Snapshot(
      state.world.id,
      revision,
      SYNTHETIC_LAB_TIME_SYSTEM_ID,
      readOnlyStore()
    );
    for (const reversed of [false, true]) {
      const store = readOnlyStore();
      let active = 0,
        peak = 0,
        activeIndexes = 0,
        peakIndexes = 0;
      const started: string[] = [],
        finished: string[] = [];
      const snapshot = await loadLayoutV2Snapshot(
        state.world.id,
        revision,
        SYNTHETIC_LAB_TIME_SYSTEM_ID,
        {
          async get(key) {
            const isIndex = key.includes("/complete/index/");
            started.push(key);
            active++;
            if (isIndex) activeIndexes++;
            peak = Math.max(peak, active);
            peakIndexes = Math.max(peakIndexes, activeIndexes);
            try {
              const delay =
                1 + (Number.parseInt(digest(key).slice(0, 2), 16) % 5);
              await new Promise<void>((resolve) =>
                setTimeout(resolve, reversed ? 6 - delay : delay)
              );
              return await store.get(key);
            } finally {
              active--;
              if (isIndex) activeIndexes--;
              finished.push(key);
            }
          }
        }
      );
      expect(peak).toBeGreaterThan(24);
      expect(peak).toBeLessThanOrEqual(64);
      expect(peakIndexes).toBeGreaterThan(1);
      expect(active).toBe(0);
      expect(new Set(started).size).toBe(started.length);
      expect(finished).not.toEqual(started);
      expect(JSON.stringify(snapshot)).toBe(JSON.stringify(expected));
    }
  });

  it("prunes large authenticated spatial index branches without changing selected snapshot data", async () => {
    const expected = await loadLayoutV2Snapshot(
      state.world.id,
      revision,
      undefined,
      readOnlyStore()
    );
    const prefix = `worlds/${state.world.id}/revisions/${revision}/v5/`;
    const spatial = `${prefix}spatial/${SYNTHETIC_LAB_TIME_SYSTEM_ID}/`;
    const documents = [...immutable]
      .filter(
        ([key]) =>
          key.startsWith(prefix) && !key.startsWith(`${prefix}complete/`)
      )
      .map(([key, body]) => ({ key, body }));
    // The normal producer authenticates these unrelated spatial objects in
    // the same complete tree; the Lab has no reason to read their branches.
    documents.push(
      ...Array.from({ length: 4096 }, (_, index) => ({
        key: `${spatial}unused-fixture/${String(index).padStart(5, "0")}.json`,
        body: JSON.stringify({
          world_id: state.world.id,
          revision,
          fixture: index
        })
      }))
    );
    const expanded = finalizeV5VerifiedSpatialArtifacts(
      state,
      buildV5StagedIndex(
        state.world.id,
        revision,
        documents,
        "content-temporal-and-spatial-staged"
      )
    );
    const values = new Map(
      [...expanded.documents, ...expanded.index, expanded.root].map(
        ({ key, body }) => [key, body]
      )
    );
    const pointerKey = `worlds/${state.world.id}/current.json`;
    values.set(
      pointerKey,
      JSON.stringify({
        ...JSON.parse(immutable.get(pointerKey)!),
        manifest_sha256: digest(expanded.root.body)
      })
    );
    const irrelevant = new Set(
      expanded.index
        .filter(({ body }) => {
          const node = JSON.parse(body);
          return (
            node.entries.length > 0 &&
            node.entries.every(
              (ref: { first_key: string; last_key: string }) =>
                ref.first_key.startsWith(`${prefix}spatial/`) &&
                ref.last_key.startsWith(`${prefix}spatial/`)
            )
          );
        })
        .map(({ key }) => key)
    );
    expect(irrelevant.size).toBeGreaterThan(10);
    const store = readOnlyStore(values);
    const snapshot = await loadLayoutV2Snapshot(
      state.world.id,
      revision,
      undefined,
      {
        async get(key) {
          if (irrelevant.has(key))
            throw Error("unrelated_spatial_index_fetched");
          return store.get(key);
        }
      }
    );
    expect(store.reads.some((key) => key.startsWith(spatial))).toBe(false);
    expect(snapshotDigestPayload(snapshot)).toBe(
      snapshotDigestPayload(expected)
    );
    expect(snapshot.inputDigest).toBe(expected.inputDigest);
    expect(snapshot.sourceRootDigest).toBe(digest(expanded.root.body));
  });

  it("keeps reading new facts while one earlier fact is still pending", async () => {
    const store = readOnlyStore();
    let factsStarted = 0,
      advanced = false,
      firstPending = false;
    let releaseFirst = () => {};
    const blocked = new Promise<void>((resolve) => {
      releaseFirst = () => {
        firstPending = false;
        resolve();
      };
    });
    const fallback = setTimeout(releaseFirst, 1000);
    try {
      await loadLayoutV2Snapshot(state.world.id, revision, undefined, {
        async get(key) {
          const fact =
            /\/v5\/(content\/(collections|events|relations|time-systems)\/|temporal\/events\/)/.test(
              key
            );
          if (fact) {
            factsStarted++;
            if (factsStarted === 65) {
              advanced = firstPending;
              releaseFirst();
            }
            if (factsStarted === 1) {
              firstPending = true;
              await blocked;
            }
          }
          return store.get(key);
        }
      });
      expect(advanced).toBe(true);
    } finally {
      clearTimeout(fallback);
      releaseFirst();
    }
  });

  it("rejects a requested stale revision before scanning World content", async () => {
    const store = readOnlyStore();
    await expect(
      loadLayoutV2Snapshot(
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
        loadLayoutV2Snapshot(
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
        loadLayoutV2Snapshot(
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
