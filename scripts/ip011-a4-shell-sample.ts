/** Entire real v5 route: pointer + root + spatial + detail + adjacency reads. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { V5SpatialNode } from "../packages/graph-presentation/src/v5-spatial-index.js";
import { POST as shell } from "../apps/atropos-web/src/app/graph/v5/shell/route.js";
import { POST as search } from "../apps/atropos-web/src/app/graph/v5/search/route.js";
import { profilePublication } from "../apps/atropos-web/src/lib/publication-profile.js";
const kind = process.argv[2] ?? "viewport";
const repetitions = Number(process.argv[3] ?? 1);
const shape = process.argv[4] ?? "sparse";
if (
  !["viewport", "detail", "collection", "search"].includes(kind) ||
  ![1, 50].includes(repetitions)
)
  throw Error("a4_sample_input_invalid");
const world = "019f5000-1300-7000-8000-000000000001";
const collection = "019f5000-1300-7000-8004-000000000001";
const collections =
  shape === "shared"
    ? [collection, "019f5000-1300-7000-8004-000000000002"]
    : [collection];
const timeSystem = "019f5000-1300-7000-8005-000000000001";
const event = "019f5000-1300-7000-8001-000000000001";
let bbox = { minX: -100000, maxX: 100000, minY: 203419, maxY: 203422 };
if (kind === "viewport" && shape !== "dense" && shape !== "sustained") {
  const root = process.env.LOCAL_PUBLICATION_FIXTURE_DIR;
  if (!root) throw Error("a4_local_directory_required");
  // Keep the bounded 3 × 3 query anchored to the published fixture. Layout
  // changes may move X; a stale absolute coordinate would measure empty reads.
  // This setup read stays outside app profiling and its request-local cache.
  const leaf = JSON.parse(
    await readFile(
      join(
        root,
        `worlds/${world}/revisions/31/v5/spatial/${timeSystem}/nodes/0/0.json`
      ),
      "utf8"
    )
  ) as V5SpatialNode;
  const point =
    leaf.kind === "leaf"
      ? leaf.entries.find((entry) => entry.shape.event_id === event)?.shape
      : null;
  if (
    point?.kind !== "point" ||
    !Number.isFinite(point.position.x) ||
    !Number.isFinite(point.position.y)
  )
    throw Error("a4_fixture_point_missing");
  bbox = {
    minX: point.position.x - 1.5,
    maxX: point.position.x + 1.5,
    minY: point.position.y - 1.5,
    maxY: point.position.y + 1.5
  };
}
const input =
  kind === "viewport"
    ? {
        kind,
        world_id: world,
        revision: 31,
        time_system_id: timeSystem,
        collection_ids: collections,
        viewport: {
          canonIds: [world],
          bbox,
          scale: 1,
          viewportWidth: 390,
          viewportHeight: 844
        }
      }
    : kind === "search"
      ? {
          term: "event",
          cursor: 0,
          state: {
            query: {
              sources: [
                { world_id: world, served_revision: 31, canon_ids: collections }
              ]
            }
          }
        }
      : kind === "detail"
        ? {
            kind,
            world_id: world,
            revision: 31,
            event_id: event,
            page: 0
          }
        : {
            kind,
            world_id: world,
            revision: 31,
            collection_id: collection,
            page: 0
          };
const samples = [];
for (let i = 0; i < repetitions; i++) {
  const { value, metrics } = await profilePublication(async () => {
    const response = await (kind === "search" ? search : shell)(
      new Request("http://localhost/graph/v5/shell", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      })
    );
    const text = await response.text();
    return {
      status: response.status,
      response_bytes: Buffer.byteLength(text),
      body: JSON.parse(text) as Record<string, unknown>
    };
  });
  const count = Array.isArray(value.body.entities)
    ? value.body.entities.length
    : null;
  samples.push({
    ...metrics,
    status: value.status,
    response_bytes: value.response_bytes,
    entities: count,
    truncated: value.body.truncated ?? null,
    error: value.body.error ?? null
  });
}
process.stdout.write(JSON.stringify(samples) + "\n");
