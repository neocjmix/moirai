/** Operator-only read-only v5 Publication rehearsal on the migrated clone.
 * It constructs and walks an in-memory staged tree; never uploads a pointer. */
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sql } from "kysely";
import type { CanonicalState } from "@moirai/contracts/v5";
import { createDatabase } from "@moirai/persistence";
import {
  readActiveV5State,
  readV5WorldAtRevision
} from "@moirai/persistence/v5";
import {
  buildV5WorldSpatialStagedArtifacts,
  buildV5WorldLayout,
  readV5SelectedViewport
} from "@moirai/graph-presentation/server";
import { projectV5WorldTemporal } from "@moirai/projections";
import { verifyV5StagedIndex } from "@moirai/publication/v5";
import { stableStringify } from "@moirai/domain";
import { v5ContentFingerprint } from "../skills/clotho/src/portability-v5.js";

export async function rehearseV5Publication(
  state: CanonicalState,
  revision: number
) {
  const start = performance.now();
  const artifacts = buildV5WorldSpatialStagedArtifacts(state, revision);
  verifyV5StagedIndex(artifacts);
  const buildMs = performance.now() - start;
  if (
    JSON.parse(artifacts.root.body).completeness !==
    "content-temporal-and-spatial-staged"
  )
    throw Error("publication_rehearsal_must_remain_unserved");
  const objects = new Map(
    [...artifacts.documents, ...artifacts.index].map(({ key, body }) => [
      key,
      body
    ])
  );
  const temporal = projectV5WorldTemporal(state, revision);
  let maxObjectReads = 0;
  let viewportPages = 0;
  let placed = 0;
  let unplaced = 0;
  for (const system of state.timeSystems) {
    const layout = buildV5WorldLayout(state, temporal, system.id);
    const shapeIds = new Set(layout.shapes.map((shape) => shape.event_id));
    const boxes = layout.shapes.map((shape) =>
      shape.kind === "point"
        ? {
            minX: shape.position.x,
            maxX: shape.position.x,
            minY: shape.position.y,
            maxY: shape.position.y
          }
        : shape.kind === "region"
          ? shape.bounds
          : {
              minX: Math.min(shape.start.x, shape.end.x),
              maxX: Math.max(shape.start.x, shape.end.x),
              minY: Math.min(shape.start.y, shape.end.y),
              maxY: Math.max(shape.start.y, shape.end.y)
            }
    );
    const viewport = boxes.reduce(
      (all, box) => ({
        minX: Math.min(all.minX, box.minX),
        maxX: Math.max(all.maxX, box.maxX),
        minY: Math.min(all.minY, box.minY),
        maxY: Math.max(all.maxY, box.maxY)
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );
    if (boxes.length === 0)
      Object.assign(viewport, { minX: -1, maxX: 1, minY: -1, maxY: 1 });
    if (
      shapeIds.size !== layout.shapes.length ||
      shapeIds.size + layout.unplaced_event_ids.length !== state.events.length
    )
      throw Error("publication_rehearsal_layout_incomplete");
    placed += shapeIds.size;
    unplaced += layout.unplaced_event_ids.length;
    for (const collection of state.collections) {
      const expected = new Set(
        state.eventCollectionMemberships
          .filter(
            (item) =>
              item.collection_id === collection.id &&
              shapeIds.has(item.event_id)
          )
          .map((item) => item.event_id)
      );
      const found = new Set<string>();
      let cursor = null;
      let pages = 0;
      do {
        const response = await readV5SelectedViewport(
          artifacts.root.body,
          state.world.id,
          revision,
          system.id,
          viewport,
          [collection.id],
          cursor,
          async (key) => objects.get(key) ?? null
        );
        maxObjectReads = Math.max(maxObjectReads, response.object_reads);
        if (response.object_reads > 256 || ++pages > state.events.length + 1)
          throw Error("publication_rehearsal_read_unbounded");
        for (const shape of response.shapes) {
          if (found.has(shape.event_id))
            throw Error("publication_rehearsal_duplicate_event");
          found.add(shape.event_id);
        }
        cursor = response.next_cursor;
      } while (cursor);
      viewportPages += pages;
      if (
        stableStringify([...expected].sort()) !==
        stableStringify([...found].sort())
      )
        throw Error("publication_rehearsal_selection_drift");
    }
  }
  return {
    operation: "ip011_v5_publication_rehearsal",
    world_id: state.world.id,
    revision,
    pointer_written: false,
    completeness: "content-temporal-and-spatial-staged",
    placed,
    unplaced,
    viewport_pages: viewportPages,
    max_object_reads: maxObjectReads,
    build_ms: Math.round(buildMs),
    document_count: artifacts.documents.length,
    tree_bytes: [
      ...artifacts.documents,
      ...artifacts.index,
      artifacts.root
    ].reduce((sum, item) => sum + Buffer.byteLength(item.body), 0)
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let phase = "configuration";
  try {
    if (process.argv[2] !== "rehearse-publication")
      throw Error("explicit_mode_required");
    const sourceUrl = process.env.DATABASE_URL;
    const cloneName = process.env.IP011_REHEARSAL_DB;
    if (
      !sourceUrl ||
      !cloneName ||
      !/^ip011_rehearsal_[0-9a-f]{16}$/.test(cloneName)
    )
      throw Error("isolated_rehearsal_required");
    const cloneUrl = new URL(sourceUrl);
    if (decodeURIComponent(cloneUrl.pathname.slice(1)) === cloneName)
      throw Error("source_target_collision");
    cloneUrl.pathname = `/${cloneName}`;
    const manifest = JSON.parse(
      await readFile(
        new URL(
          "../data/migrations/ip011/world-r30-preservation.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as { world_id: string; source_revision: number };
    const clone = createDatabase(cloneUrl.toString());
    try {
      phase = "clone_identity";
      const name = (
        await sql<{ name: string }>`select current_database() as name`.execute(
          clone
        )
      ).rows[0]?.name;
      if (name !== cloneName) throw Error("rehearsal_database_mismatch");
      const revision = manifest.source_revision + 1;
      phase = "revision_read";
      const replay = await readV5WorldAtRevision(
        clone,
        manifest.world_id,
        revision
      );
      const active = await readActiveV5State(clone, manifest.world_id);
      phase = "revision_compare";
      if (
        v5ContentFingerprint(replay).digest !==
        v5ContentFingerprint(active).digest
      )
        throw Error("rehearsal_revision_drift");
      phase = "publication_projection";
      console.info(
        JSON.stringify(await rehearseV5Publication(replay, revision))
      );
    } finally {
      await clone.destroy();
    }
  } catch (cause) {
    const code =
      cause instanceof Error &&
      /^(?:v5_|publication_rehearsal_|world_temporal_|rehearsal_)[a-z0-9_]+$/.test(
        cause.message
      )
        ? cause.message
        : "rehearsal_failed";
    console.error(
      JSON.stringify({
        operation: "ip011_v5_publication_rehearsal",
        error_code: code,
        phase
      })
    );
    process.exitCode = 1;
  }
}
