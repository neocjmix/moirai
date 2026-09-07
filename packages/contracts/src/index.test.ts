import { describe, expect, it } from "vitest";

import {
  CONTRACT_VERSION,
  HEALTH_RESPONSE_SCHEMA,
  type CreateChangeSet
} from "./index.js";
import { TEST_FIXTURE } from "./testing.js";

describe("Milestone 2 contracts", () => {
  it("uses stable opaque UUIDv7 fixture identifiers", () => {
    for (const id of [
      TEST_FIXTURE.worldId,
      TEST_FIXTURE.canonId,
      TEST_FIXTURE.eventId,
      TEST_FIXTURE.changeSetId,
      TEST_FIXTURE.expansionChangeSetId,
      TEST_FIXTURE.timeSystemId,
      TEST_FIXTURE.secondEventId,
      TEST_FIXTURE.causalRelationId,
      TEST_FIXTURE.canonNarrativeId
    ]) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    }
  });

  it("types one World-scoped ordered create Change Set", () => {
    const changeSet: CreateChangeSet = {
      contract_version: CONTRACT_VERSION,
      change_set_id: TEST_FIXTURE.changeSetId,
      world_id: TEST_FIXTURE.worldId,
      expected_revision: 0,
      actor: "test-actor",
      intent: "Create the Milestone 1 test fixture",
      operations: [],
      origins: []
    };
    expect(changeSet.expected_revision).toBe(0);
  });
});

describe("health contract", () => {
  it("is versioned and rejects extra public fields", () => {
    expect(HEALTH_RESPONSE_SCHEMA.$id).toBe("moirai.health.v1");
    expect(HEALTH_RESPONSE_SCHEMA.additionalProperties).toBe(false);
  });
});
