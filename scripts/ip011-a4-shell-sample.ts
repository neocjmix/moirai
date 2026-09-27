/** Entire real v5 route: pointer + root + spatial + detail + adjacency reads. */
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
const input =
  kind === "viewport"
    ? {
        kind,
        world_id: world,
        revision: 31,
        time_system_id: "019f5000-1300-7000-8005-000000000001",
        collection_ids: collections,
        viewport: {
          canonIds: [world],
          bbox:
            shape === "dense" || shape === "sustained"
              ? { minX: -100000, maxX: 100000, minY: 203419, maxY: 203422 }
              : { minX: -356.6, maxX: -353.6, minY: 203419, maxY: 203422 },
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
            event_id: "019f5000-1300-7000-8001-000000000001",
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
