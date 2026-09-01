import {
  CONTRACT_VERSION,
  SYNTHETIC_FIXTURE,
  type CreateChangeSet
} from "@moirai/contracts";
import { describe, expect, it } from "vitest";

import {
  ChangeSetError,
  resolveCreateOperations,
  stableStringify,
  validateCandidateChangeSet,
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

  it("rejects a partial Event reference with a stable error", () => {
    const input = fixture();
    const invalid = {
      ...input,
      operations: [input.operations[0]!, input.operations[2]!]
    };
    const resolved = resolveCreateOperations(invalid, () => {
      throw new Error("unexpected generated ID");
    });
    const emptyState = {
      world: null,
      canons: [],
      timeSystems: [],
      canonTimeSystems: [],
      events: [],
      temporalPlacements: [],
      relations: [],
      narratives: []
    };
    expect(() =>
      validateCandidateChangeSet(invalid, resolved.operations, emptyState)
    ).toThrowError(ChangeSetError);
    try {
      validateCandidateChangeSet(invalid, resolved.operations, emptyState);
    } catch (error) {
      expect(error).toMatchObject({
        code: "dangling_reference",
        path: "operations.1.value.canon_id",
        retryable: false
      });
    }
  });

  it("resolves earlier client references and returns the ID mapping", () => {
    const input = fixture();
    const withClientReference: CreateChangeSet = {
      ...input,
      operations: input.operations.map((operation, index) =>
        index === 1
          ? { ...operation, client_ref: "created-canon" }
          : index === 2 && operation.entity_type === "event"
            ? {
                ...operation,
                value: {
                  ...operation.value,
                  canon_id: { client_ref: "created-canon" }
                }
              }
            : operation
      )
    };
    const resolved = resolveCreateOperations(withClientReference, () => {
      throw new Error("unexpected generated ID");
    });
    expect(resolved.idMapping["created-canon"]).toBe(SYNTHETIC_FIXTURE.canonId);
    expect(resolved.operations[2]?.value).toMatchObject({
      canon_id: SYNTHETIC_FIXTURE.canonId
    });
  });

  it("canonicalizes object key order for idempotency digests", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(
      stableStringify({ a: 1, b: 2 })
    );
  });
});
