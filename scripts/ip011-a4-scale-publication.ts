/** Complete local Publication for the real Next/URDR path. Synthetic only. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildV5WorldCompleteArtifacts } from "@moirai/graph-presentation/server";
import { scaleFixture } from "./ip011-a4-scale-fixture.js";
const count = Number(process.argv[2]);
const shape = process.argv[3] ?? "sparse";
const root = process.argv[4] ?? "";
if (!root) throw Error("a4_local_directory_required");
const state = scaleFixture(count, shape);
const started = performance.now();
const { artifacts } = await buildV5WorldCompleteArtifacts(state, 31);
const pointer = {
  format_version: "v5-publication/1",
  world_id: state.world.id,
  served_revision: 31,
  current_revision: 31,
  publication_target_revision: 31,
  projection_status: "ready",
  manifest_key: artifacts.root.key,
  manifest_sha256: createHash("sha256")
    .update(artifacts.root.body)
    .digest("hex"),
  generated_at: "2026-09-27T00:00:00.000Z"
};
const directories = new Set<string>();
let bytes = 0;
async function write(key: string, body: string) {
  const path = join(root, key);
  const dir = dirname(path);
  if (!directories.has(dir)) {
    await mkdir(dir, { recursive: true });
    directories.add(dir);
  }
  await writeFile(path, body);
  bytes += Buffer.byteLength(body);
}
for (const group of [artifacts.documents, artifacts.index, [artifacts.root]]) {
  for (let offset = 0; offset < group.length; offset += 32)
    await Promise.all(
      group.slice(offset, offset + 32).map((item) => write(item.key, item.body))
    );
}
await write(`worlds/${state.world.id}/current.json`, JSON.stringify(pointer));
process.stdout.write(
  JSON.stringify({
    phase: "complete_local_publication",
    count,
    shape,
    world_id: state.world.id,
    objects: artifacts.documents.length + artifacts.index.length + 2,
    bytes,
    build_and_write_ms: performance.now() - started
  }) + "\n"
);
