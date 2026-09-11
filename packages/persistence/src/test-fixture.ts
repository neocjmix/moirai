import { CONTRACT_VERSION, type CreateChangeSet } from "@moirai/contracts";
import { TEST_FIXTURE } from "@moirai/contracts/testing";

export function createTestChangeSet(): CreateChangeSet {
  return {
    contract_version: CONTRACT_VERSION,
    change_set_id: TEST_FIXTURE.changeSetId,
    world_id: TEST_FIXTURE.worldId,
    expected_revision: 0,
    actor: "test-actor",
    intent: "Create a transaction test World, Canon and Event",
    origins: [{ kind: "human_instruction", summary: "Test fixture" }],
    operations: [
      {
        kind: "create",
        entity_type: "world",
        entity_id: TEST_FIXTURE.worldId,
        value: {
          slug: "test-world",
          title: TEST_FIXTURE.worldTitle,
          description: "A test-only World."
        }
      },
      {
        kind: "create",
        entity_type: "canon",
        entity_id: TEST_FIXTURE.canonId,
        value: {
          world_id: TEST_FIXTURE.worldId,
          slug: "test-canon",
          title: TEST_FIXTURE.canonTitle,
          description: "A test-only Canon."
        }
      },
      {
        kind: "create",
        entity_type: "event",
        entity_id: TEST_FIXTURE.eventId,
        value: {
          world_id: TEST_FIXTURE.worldId,
          slug: "first-test-event",
          kind: "atomic",
          title: TEST_FIXTURE.eventTitle,
          summary: "The first test observation.",
          roles: [],
          attributes: {}
        }
      },
      {
        kind: "add",
        entity_type: "event_canon_membership",
        value: {
          event_id: TEST_FIXTURE.eventId,
          canon_id: TEST_FIXTURE.canonId
        }
      }
    ]
  };
}

export function createTestExpansionChangeSet(): CreateChangeSet {
  const fixture = TEST_FIXTURE;
  return {
    contract_version: CONTRACT_VERSION,
    change_set_id: fixture.expansionChangeSetId,
    world_id: fixture.worldId,
    expected_revision: 1,
    actor: "test-actor",
    intent: "Expand the transaction fixture",
    origins: [{ kind: "human_instruction", summary: "Test fixture" }],
    operations: [
      {
        kind: "create",
        entity_type: "time_system",
        entity_id: fixture.timeSystemId,
        client_ref: "test-time",
        value: {
          world_id: fixture.worldId,
          slug: "test-ordinal",
          title: "Test Ordinal",
          kind: "ordinal",
          definition_version: "1",
          definition: {
            coordinate_codec: "opaque-token-v1",
            capabilities: ["canonicalize", "equality"],
            unit: "step"
          }
        }
      },
      {
        kind: "create",
        entity_type: "canon_time_system",
        entity_id: fixture.canonTimeSystemId,
        value: {
          canon_id: fixture.canonId,
          time_system_id: { client_ref: "test-time" }
        }
      },
      {
        kind: "create",
        entity_type: "event",
        entity_id: fixture.secondEventId,
        client_ref: "second-event",
        value: {
          world_id: fixture.worldId,
          slug: "second-test-event",
          kind: "atomic",
          title: fixture.secondEventTitle,
          summary: "The second test observation.",
          roles: [],
          attributes: {}
        }
      },
      {
        kind: "add",
        entity_type: "event_canon_membership",
        value: {
          event_id: { client_ref: "second-event" },
          canon_id: fixture.canonId
        }
      },
      {
        kind: "create",
        entity_type: "event",
        entity_id: fixture.thirdEventId,
        client_ref: "third-event",
        value: {
          world_id: fixture.worldId,
          slug: "third-test-event",
          kind: "atomic",
          title: fixture.thirdEventTitle,
          summary: "The third test observation.",
          roles: [],
          attributes: {}
        }
      },
      {
        kind: "add",
        entity_type: "event_canon_membership",
        value: {
          event_id: { client_ref: "third-event" },
          canon_id: fixture.canonId
        }
      },
      {
        kind: "create",
        entity_type: "relation",
        entity_id: fixture.causalRelationId,
        value: {
          canon_id: fixture.canonId,
          type: "causes",
          source_ref: { kind: "event", event_id: fixture.eventId },
          target_ref: { kind: "event", client_ref: "second-event" },
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
          source_ref: { kind: "event", client_ref: "second-event" },
          target_ref: { kind: "event", client_ref: "third-event" },
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
          title: "Test narrative",
          body: "A deterministic publication test narrative.",
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
          scope_id: { client_ref: "second-event" },
          locale: "en",
          kind: "primary",
          title: "Second event narrative",
          body: "A deterministic Event narrative.",
          public_references: []
        }
      }
    ]
  };
}
