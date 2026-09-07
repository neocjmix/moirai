import { CONTRACT_VERSION, type CreateChangeSet } from "@moirai/contracts";
import { TEST_FIXTURE } from "@moirai/contracts/testing";
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
    change_set_id: TEST_FIXTURE.changeSetId,
    world_id: TEST_FIXTURE.worldId,
    expected_revision: 0,
    actor: "test-actor",
    intent: "Create fixture",
    origins: [{ kind: "human_instruction", summary: "Test fixture" }],
    operations: [
      {
        kind: "create",
        entity_type: "world",
        entity_id: TEST_FIXTURE.worldId,
        value: { slug: "test-world", title: TEST_FIXTURE.worldTitle }
      },
      {
        kind: "create",
        entity_type: "canon",
        entity_id: TEST_FIXTURE.canonId,
        value: {
          world_id: TEST_FIXTURE.worldId,
          slug: "test-canon",
          title: TEST_FIXTURE.canonTitle
        }
      },
      {
        kind: "create",
        entity_type: "event",
        entity_id: TEST_FIXTURE.eventId,
        value: {
          canon_id: TEST_FIXTURE.canonId,
          slug: "first-test-event",
          kind: "atomic",
          title: TEST_FIXTURE.eventTitle,
          summary: "A test event used to verify the transaction path.",
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
    expect(resolved.idMapping["created-canon"]).toBe(TEST_FIXTURE.canonId);
    expect(resolved.operations[2]?.value).toMatchObject({
      canon_id: TEST_FIXTURE.canonId
    });
  });

  it("canonicalizes object key order for idempotency digests", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(
      stableStringify({ a: 1, b: 2 })
    );
  });
});
