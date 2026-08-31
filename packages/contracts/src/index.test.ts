import { describe, expect, it } from "vitest";

import {
  CONTRACT_VERSION,
  HEALTH_RESPONSE_SCHEMA,
  SYNTHETIC_FIXTURE,
  type CreateChangeSet
} from "./index.js";

describe("Milestone 1 contracts", () => {
  it("uses stable opaque UUIDv7 fixture identifiers", () => {
    for (const id of [
      SYNTHETIC_FIXTURE.worldId,
      SYNTHETIC_FIXTURE.canonId,
      SYNTHETIC_FIXTURE.eventId,
      SYNTHETIC_FIXTURE.changeSetId
    ]) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    }
  });

  it("types one World-scoped ordered create Change Set", () => {
    const changeSet: CreateChangeSet = {
      contract_version: CONTRACT_VERSION,
      change_set_id: SYNTHETIC_FIXTURE.changeSetId,
      world_id: SYNTHETIC_FIXTURE.worldId,
      expected_revision: 0,
      actor: "synthetic-bootstrap",
      intent: "Create the Milestone 1 synthetic fixture",
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
