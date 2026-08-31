import {
  CONTRACT_VERSION,
  SYNTHETIC_FIXTURE,
  type CreateChangeSet
} from "@moirai/contracts";
import { fileURLToPath } from "node:url";

import { commitCreateChangeSet, createDatabase } from "./index.js";

export function createSyntheticChangeSet(): CreateChangeSet {
  return {
    contract_version: CONTRACT_VERSION,
    change_set_id: SYNTHETIC_FIXTURE.changeSetId,
    world_id: SYNTHETIC_FIXTURE.worldId,
    expected_revision: 0,
    actor: "synthetic-bootstrap",
    intent: "Create the Milestone 1 synthetic World, Canon and Event",
    origins: [
      {
        kind: "human_instruction",
        summary: "Synthetic public fixture for delivery verification"
      }
    ],
    operations: [
      {
        kind: "create",
        entity_type: "world",
        entity_id: SYNTHETIC_FIXTURE.worldId,
        value: {
          slug: "lantern-archive",
          title: SYNTHETIC_FIXTURE.worldTitle,
          description:
            "A synthetic World that proves Moirai's first publication path."
        }
      },
      {
        kind: "create",
        entity_type: "canon",
        entity_id: SYNTHETIC_FIXTURE.canonId,
        value: {
          world_id: SYNTHETIC_FIXTURE.worldId,
          slug: "ember-canon",
          title: SYNTHETIC_FIXTURE.canonTitle,
          description: "One self-contained synthetic truth context."
        }
      },
      {
        kind: "create",
        entity_type: "event",
        entity_id: SYNTHETIC_FIXTURE.eventId,
        value: {
          canon_id: SYNTHETIC_FIXTURE.canonId,
          slug: "first-lantern",
          kind: "atomic",
          title: SYNTHETIC_FIXTURE.eventTitle,
          summary: "At dusk, the archive keeper lights the first lantern.",
          roles: [],
          attributes: {}
        }
      }
    ]
  };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const db = createDatabase(databaseUrl);
  try {
    const result = await commitCreateChangeSet(db, createSyntheticChangeSet());
    process.stdout.write(
      `synthetic fixture revision ${result.current_revision} (${result.idempotent_replay ? "replayed" : "committed"})\n`
    );
  } finally {
    await db.destroy();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "bootstrap failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
