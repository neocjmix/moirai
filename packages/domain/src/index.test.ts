import {
  CONTRACT_VERSION,
  SYNTHETIC_FIXTURE,
  type CreateChangeSet
} from "@moirai/contracts";
import { describe, expect, it } from "vitest";

import {
  ChangeSetError,
  stableStringify,
  validateCreateChangeSet
} from "./index.js";

function fixture(): CreateChangeSet {
  return {
    contract_version: CONTRACT_VERSION,
    change_set_id: SYNTHETIC_FIXTURE.changeSetId,
    world_id: SYNTHETIC_FIXTURE.worldId,
    expected_revision: 0,
    actor: "synthetic-bootstrap",
    intent: "Create fixture",
    origins: [{ kind: "human_instruction", summary: "Synthetic fixture only" }],
    operations: [
      {
        kind: "create",
        entity_type: "world",
        entity_id: SYNTHETIC_FIXTURE.worldId,
        value: { slug: "lantern-archive", title: SYNTHETIC_FIXTURE.worldTitle }
      },
      {
        kind: "create",
        entity_type: "canon",
        entity_id: SYNTHETIC_FIXTURE.canonId,
        value: {
          world_id: SYNTHETIC_FIXTURE.worldId,
          slug: "ember-canon",
          title: SYNTHETIC_FIXTURE.canonTitle
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
          summary: "A synthetic event used to verify the publication path.",
          roles: [],
          attributes: {}
        }
      }
    ]
  };
}

describe("create Change Set validation", () => {
  it("accepts ordered World, Canon and Event creates", () => {
    expect(() => validateCreateChangeSet(fixture())).not.toThrow();
  });

  it("rejects a partial Event reference before persistence", () => {
    const input = fixture();
    const invalid = {
      ...input,
      operations: [input.operations[0]!, input.operations[2]!]
    };
    expect(() => validateCreateChangeSet(invalid)).toThrowError(ChangeSetError);
  });

  it("canonicalizes object key order for idempotency digests", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(
      stableStringify({ a: 1, b: 2 })
    );
  });
});
