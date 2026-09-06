import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { CreateChangeSet } from "../packages/contracts/src/index.js";
import {
  TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID,
  TEMPORAL_EXPRESSIVENESS_WORLD_ID
} from "../packages/contracts/src/index.js";
import { resolveCreateOperations } from "../packages/domain/src/index.js";
import {
  cloneWorldPlan,
  portableStringify,
  temporalSemanticFingerprint,
  type PortableWorld
} from "../skills/clotho/src/portability.js";

const fixtureBase = new URL(
  "../docs/implementation/fixtures/temporal-expressiveness/",
  import.meta.url
);
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, fixtureBase), "utf8")) as T;
const bootstrap = read<CreateChangeSet>("bootstrap.change-plan.json");
const success = read<CreateChangeSet>("success.change-plan.json");
const rejectionPaths = [
  "bad-cycle.change-plan.json",
  "bad-boundary.change-plan.json",
  "bad-system.change-plan.json",
  "bad-coordinate.change-plan.json",
  "bad-duplicate-start.change-plan.json"
] as const;
const rejection = rejectionPaths.map((name) => ({
  name,
  plan: read<CreateChangeSet>(`rejection/${name}`)
}));
const operations = [bootstrap, success].flatMap(
  (plan) =>
    resolveCreateOperations(
      { ...plan, actor: "019f3b00-0000-7000-8000-000000000099" },
      () => {
        throw new Error("fixture IDs must be explicit");
      }
    ).operations
);
const rows = (entityType: string) =>
  operations
    .filter((operation) => operation.entity_type === entityType)
    .map((operation) => ({ id: operation.entity_id, ...operation.value }));
const sourceView = {
  world: rows("world")[0],
  canons: rows("canon"),
  timeSystems: rows("time_system"),
  canonTimeSystems: rows("canon_time_system"),
  events: rows("event"),
  relations: rows("relation"),
  narratives: rows("narrative"),
  temporalPlacements: []
} as unknown as PortableWorld;
let sequence = 0x500;
const clone = cloneWorldPlan(
  sourceView,
  TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID,
  () => `019f3b00-0000-7000-8000-${(sequence++).toString(16).padStart(12, "0")}`
);
const applicationSha = process.env.EXPECTED_COMMIT_SHA ?? "";
if (!/^[a-f0-9]{40}$/.test(applicationSha))
  throw new Error("EXPECTED_COMMIT_SHA must be an exact full commit SHA");
const digest = (value: unknown) =>
  "sha256:" +
  createHash("sha256").update(portableStringify(value)).digest("hex");

process.stdout.write(
  JSON.stringify(
    {
      packet_version: 1,
      application_sha: applicationSha,
      target_worlds: {
        source: TEMPORAL_EXPRESSIVENESS_WORLD_ID,
        empty_import: TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID
      },
      credential_scope_required: [
        TEMPORAL_EXPRESSIVENESS_WORLD_ID,
        TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID
      ],
      source_change_plans: {
        bootstrap,
        success,
        rejection
      },
      import_change_plan: clone.plan,
      import_id_mapping: clone.id_mapping,
      expected_source_fingerprint: temporalSemanticFingerprint(sourceView),
      input_digests: {
        bootstrap: digest(bootstrap),
        success: digest(success),
        rejection: Object.fromEntries(
          rejection.map((item) => [item.name, digest(item.plan)])
        ),
        import: digest(clone.plan),
        import_id_mapping: digest(clone.id_mapping)
      },
      rollback: {
        application_sha: "350920bbdb3928f34e406940b9d9f0d95f7e8c65",
        migration_ledger_policy:
          "After migration 006 has executed, retain 006_event_relation_time in any rollback build even when runtime code returns to the M4-D application SHA",
        database_policy:
          "Do not delete or rewrite trial rows; stop publication advancement and preserve isolated append-only revisions as evidence",
        authorization_policy:
          "Remove the two trial World IDs from the temporary Clotho credential scope after verification",
        production_data_migration: false,
        legacy_placement_deletion: false
      }
    },
    null,
    2
  ) + "\n"
);
