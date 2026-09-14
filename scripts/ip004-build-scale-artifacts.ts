import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildPublicationArtifacts } from "../packages/publication/src/index.js";
import { buildSpatialArtifacts } from "../packages/graph-presentation/src/artifacts.js";
import { queryFromPublicationDocuments } from "../packages/graph-query/src/index.js";
import { ip004ScaleFixture } from "./ip004-scale-fixture.js";

// Separate build process: long synchronous work cannot starve Vitest's RPC.
// Output is only generated synthetic artifacts under an allocated temp root.
const count = Number(process.argv[2]);
const root = process.argv[3];
if (!root || !/^\/tmp\/moirai-ip004-scale-[a-zA-Z0-9]+$/.test(root))
  throw Error("generated_scale_root_required");
const fixture = ip004ScaleFixture(count);
const buildStarted = performance.now();
process.stdout.write(
  JSON.stringify({
    scale: count,
    phase: "canonical_publication_start",
    started_at: new Date().toISOString()
  }) + "\n"
);
let start = performance.now();
const publication = buildPublicationArtifacts(
  fixture,
  5,
  "2026-09-13T00:00:00Z"
);
const publicationMs = performance.now() - start;
process.stdout.write(
  JSON.stringify({
    scale: count,
    phase: "canonical_publication",
    ms: publicationMs,
    bytes: publication.documents.reduce(
      (n, d) => n + Buffer.byteLength(d.body),
      0
    ),
    objects: publication.documents.length,
    peak_rss_kib: process.resourceUsage().maxRSS
  }) + "\n"
);
// Flush phase output between separately measured synchronous builds.
await new Promise<void>((resolve) => setImmediate(resolve));
start = performance.now();
const graphInput = queryFromPublicationDocuments(
  publication.manifestBody,
  publication.documents
)!;
const graphInputMs = performance.now() - start;
start = performance.now();
const baked = buildSpatialArtifacts(graphInput, publication.manifestBody);
process.stdout.write(
  JSON.stringify({
    scale: count,
    phase: "spatial_publication",
    graph_input_ms: graphInputMs,
    ms: performance.now() - start,
    bytes: baked.documents.reduce((n, d) => n + Buffer.byteLength(d.body), 0),
    objects: baked.documents.length,
    peak_rss_kib: process.resourceUsage().maxRSS
  }) + "\n"
);
const documents = [
  ...publication.documents,
  ...baked.documents,
  { key: publication.manifestKey, body: publication.manifestBody },
  { key: baked.manifestKey, body: baked.manifestBody },
  {
    key: `worlds/${fixture.world.id}/current.json`,
    body: JSON.stringify(publication.pointer)
  }
];
for (let i = 0; i < documents.length; i += 32)
  await Promise.all(
    documents.slice(i, i + 32).map(async (d) => {
      const path = join(root, d.key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, d.body);
    })
  );

process.stdout.write(
  JSON.stringify({
    scale: count,
    phase: "build_complete",
    total_ms: performance.now() - buildStarted,
    peak_rss_kib: process.resourceUsage().maxRSS
  }) + "\n"
);
if (performance.now() - buildStarted > 180_000)
  throw Error("scale_build_latency_budget");
if (process.resourceUsage().maxRSS > 3 * 1024 * 1024)
  throw Error("scale_builder_rss_budget");
