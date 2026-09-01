import {
  CONTRACT_VERSION,
  SYNTHETIC_FIXTURE,
  type CreateChangeSet
} from "@moirai/contracts";
import { fileURLToPath } from "node:url";

import {
  commitCreateChangeSet,
  createDatabase,
  getPublicationStatus
} from "./index.js";

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
            "A synthetic World that proves Moirai's publication path."
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

export function createSyntheticExpansionChangeSet(): CreateChangeSet {
  const fixture = SYNTHETIC_FIXTURE;
  return {
    contract_version: CONTRACT_VERSION,
    change_set_id: fixture.expansionChangeSetId,
    world_id: fixture.worldId,
    expected_revision: 1,
    actor: "private-synthetic-actor-m2",
    intent:
      "Expand the synthetic Canon with time, related Events and Narrative",
    origins: [
      { kind: "human_instruction", summary: "private-synthetic-origin-m2" }
    ],
    operations: [
      {
        kind: "create",
        entity_type: "time_system",
        entity_id: fixture.timeSystemId,
        client_ref: "ember-time",
        value: {
          world_id: fixture.worldId,
          slug: "ember-count",
          title: "Ember Count",
          kind: "ordinal",
          definition_version: "1",
          definition: { coordinate: "integer", unit: "bell" }
        }
      },
      {
        kind: "create",
        entity_type: "canon_time_system",
        entity_id: fixture.canonTimeSystemId,
        value: {
          canon_id: fixture.canonId,
          time_system_id: { client_ref: "ember-time" }
        }
      },
      {
        kind: "create",
        entity_type: "event",
        entity_id: fixture.secondEventId,
        client_ref: "eastern-answer",
        value: {
          canon_id: fixture.canonId,
          slug: "eastern-lantern-answers",
          kind: "atomic",
          title: fixture.secondEventTitle,
          summary: "A second light answers from the archive's eastern tower.",
          roles: [],
          attributes: {}
        }
      },
      {
        kind: "create",
        entity_type: "event",
        entity_id: fixture.thirdEventId,
        client_ref: "archive-opens",
        value: {
          canon_id: fixture.canonId,
          slug: "archive-opens",
          kind: "atomic",
          title: fixture.thirdEventTitle,
          summary: "The paired lights signal that the archive may open.",
          roles: [],
          attributes: {}
        }
      },
      {
        kind: "create",
        entity_type: "event_temporal_placement",
        entity_id: fixture.firstPlacementId,
        value: {
          event_id: fixture.eventId,
          time_system_id: { client_ref: "ember-time" },
          kind: "point",
          earliest_start: { value: 1 },
          latest_start: { value: 1 },
          precision: "bell",
          certainty: "exact",
          display_label: "First bell"
        }
      },
      {
        kind: "create",
        entity_type: "event_temporal_placement",
        entity_id: fixture.secondPlacementId,
        value: {
          event_id: { client_ref: "eastern-answer" },
          time_system_id: { client_ref: "ember-time" },
          kind: "point",
          earliest_start: { value: 2 },
          latest_start: { value: 2 },
          precision: "bell",
          certainty: "exact",
          display_label: "Second bell"
        }
      },
      {
        kind: "create",
        entity_type: "event_temporal_placement",
        entity_id: fixture.thirdPlacementId,
        value: {
          event_id: { client_ref: "archive-opens" },
          time_system_id: { client_ref: "ember-time" },
          kind: "point",
          earliest_start: { value: 3 },
          latest_start: { value: 4 },
          precision: "bell",
          certainty: "approximate",
          display_label: "Between the third and fourth bell"
        }
      },
      {
        kind: "create",
        entity_type: "relation",
        entity_id: fixture.causalRelationId,
        value: {
          canon_id: fixture.canonId,
          type: "causes",
          source_event_id: fixture.eventId,
          target_event_id: { client_ref: "eastern-answer" },
          direction: "directed",
          attributes: {}
        }
      },
      {
        kind: "create",
        entity_type: "relation",
        entity_id: fixture.structuralRelationId,
        value: {
          canon_id: fixture.canonId,
          type: "precedes",
          source_event_id: { client_ref: "eastern-answer" },
          target_event_id: { client_ref: "archive-opens" },
          direction: "directed",
          attributes: {}
        }
      },
      {
        kind: "create",
        entity_type: "narrative",
        entity_id: fixture.canonNarrativeId,
        value: {
          canon_id: fixture.canonId,
          scope_type: "canon",
          scope_id: fixture.canonId,
          locale: "en",
          kind: "primary",
          title: "When the lanterns answer",
          body: "Each evening begins with one deliberate flame. The answering light carries its signal across the archive, and the doors open only after both towers are visible.",
          public_references: []
        }
      },
      {
        kind: "create",
        entity_type: "narrative",
        entity_id: fixture.eventNarrativeId,
        value: {
          canon_id: fixture.canonId,
          scope_type: "event",
          scope_id: { client_ref: "eastern-answer" },
          locale: "en",
          kind: "primary",
          title: "An answer in the east",
          body: "The eastern keeper sees the first flame and raises a lantern in reply. The response is both acknowledgement and the next link in the opening sequence.",
          public_references: []
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
    let status = await getPublicationStatus(db, SYNTHETIC_FIXTURE.worldId);
    if (!status) {
      await commitCreateChangeSet(db, createSyntheticChangeSet());
      status = await getPublicationStatus(db, SYNTHETIC_FIXTURE.worldId);
    }
    if (status?.currentRevision === 1) {
      await commitCreateChangeSet(db, createSyntheticExpansionChangeSet());
      status = await getPublicationStatus(db, SYNTHETIC_FIXTURE.worldId);
    }
    if (status?.currentRevision !== 2) {
      throw new Error("synthetic fixture is not at the expected Revision 2");
    }
    process.stdout.write("synthetic fixture revision 2 ready\n");
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
