/** CI-only publication fixture. This is not evidence of a live Clotho commit. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CreateChangeSet } from "../packages/contracts/src/index.js";
import {
  resolveCreateOperations,
  type ResolvedCreateOperation
} from "../packages/domain/src/index.js";
import {
  buildPublicationArtifacts,
  currentKey
} from "../packages/publication/src/index.js";
import type { CanonicalRevisionView } from "../packages/projections/src/index.js";

const base = new URL(
  "../docs/implementation/fixtures/temporal-expressiveness/",
  import.meta.url
);
const operations: ResolvedCreateOperation[] = [];
for (const name of ["bootstrap.change-plan.json", "success.change-plan.json"]) {
  const plan = {
    ...JSON.parse(await readFile(new URL(name, base), "utf8")),
    actor: "019f3b00-0000-7000-8000-000000000099"
  } as CreateChangeSet;
  operations.push(
    ...resolveCreateOperations(plan, () => {
      throw Error("Fixture requires explicit IDs");
    }).operations
  );
}
const rows = (type: string) =>
  operations
    .filter((o) => o.entity_type === type)
    .map((o) => ({ id: o.entity_id, ...o.value }));
const view = {
  world: rows("world")[0],
  canons: rows("canon"),
  timeSystems: rows("time_system"),
  canonTimeSystems: rows("canon_time_system"),
  events: rows("event"),
  relations: rows("relation"),
  narratives: rows("narrative")
} as CanonicalRevisionView;
const artifacts = buildPublicationArtifacts(view, 2, "2026-09-06T00:00:00Z");
const root = resolve(
  process.env.LOCAL_PUBLICATION_FIXTURE_DIR ??
    "/tmp/moirai-temporal-publication-fixture"
);
for (const item of [
  ...artifacts.documents,
  { key: artifacts.manifestKey, body: artifacts.manifestBody },
  { key: currentKey(view.world.id), body: JSON.stringify(artifacts.pointer) }
]) {
  const path = resolve(root, item.key);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, item.body);
}
process.stdout.write(
  "Prepared the separate Temporal Expressiveness Observatory CI publication fixture\n"
);
