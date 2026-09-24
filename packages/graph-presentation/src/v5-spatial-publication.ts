/** Offline composition at the permitted presentation -> Publication boundary. */
import type { CanonicalState } from "@moirai/contracts/v5";
import { projectV5WorldTemporal } from "@moirai/projections";
import {
  buildV5SpatialStagedArtifacts,
  readV5StagedDocument
} from "@moirai/publication/v5";
import { buildV5WorldLayout } from "./v5-world-layout.js";
import { buildV5SpatialIndex } from "./v5-spatial-index.js";
import {
  readV5WorldViewport,
  type V5ViewportCursor
} from "./v5-spatial-read.js";

export function buildV5WorldSpatialStagedArtifacts(
  state: CanonicalState,
  revision: number
) {
  const temporal = projectV5WorldTemporal(state, revision);
  return buildV5SpatialStagedArtifacts(
    state,
    revision,
    [...state.timeSystems]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((system) => {
        const layout = buildV5WorldLayout(state, temporal, system.id);
        return {
          time_system_id: system.id,
          temporal_digest: temporal.semantic_digest,
          ...buildV5SpatialIndex(layout)
        };
      })
  );
}

/** The root must itself be authenticated by a future serving pointer. Each
 * node is fetched via the outer digest index; stop before the object budget. */
export async function readV5AuthenticatedViewport(
  rootBody: string,
  worldId: string,
  revision: number,
  timeSystemId: string,
  viewport: { minX: number; maxX: number; minY: number; maxY: number },
  limit: number,
  cursor: V5ViewportCursor | null,
  get: (key: string) => Promise<string | null>
) {
  const root = JSON.parse(rootBody) as {
    world_id: string;
    revision: number;
    completeness: string;
    index_depth: number;
  };
  if (
    root.world_id !== worldId ||
    root.revision !== revision ||
    root.completeness !== "content-temporal-and-spatial-staged" ||
    !Number.isSafeInteger(root.index_depth) ||
    root.index_depth < 1 ||
    root.index_depth > 8 ||
    !/^[a-zA-Z0-9-]+$/.test(timeSystemId)
  )
    throw Error("v5_viewport_root_invalid");
  const manifestKey = `worlds/${worldId}/revisions/${revision}/v5/spatial/${timeSystemId}/manifest.json`;
  let objectReads = 0;
  const measuredGet = async (key: string) => {
    objectReads++;
    if (objectReads > 256) throw Error("v5_viewport_object_budget_exceeded");
    return get(key);
  };
  const manifest = await readV5StagedDocument(
    rootBody,
    manifestKey,
    measuredGet
  );
  if (manifest === null) throw Error("v5_viewport_manifest_missing");
  // Reserve the outer index traversal for each spatial node and future
  // selected-content checks; this is a cap, not a latency SLO assertion.
  const maxNodes = Math.min(48, Math.floor(208 / (root.index_depth + 1)));
  const result = await readV5WorldViewport(
    manifest,
    viewport,
    limit,
    cursor,
    (key) => readV5StagedDocument(rootBody, key, measuredGet),
    maxNodes
  );
  return { ...result, object_reads: objectReads };
}
