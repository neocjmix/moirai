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
          world_id: TEST_FIXTURE.worldId,
          slug: "first-test-event",
          kind: "atomic",
          title: TEST_FIXTURE.eventTitle,
          summary: "A test event used to verify the transaction path.",
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

function validateAgainstEmpty(input: CreateChangeSet) {
  const resolved = resolveCreateOperations(input, () => {
    throw new Error("unexpected generated ID");
  });
  return validateCandidateChangeSet(input, resolved.operations, {
    world: null,
    canons: [],
    timeSystems: [],
    canonTimeSystems: [],
    eventCanonMemberships: [],
    events: [],
    relations: [],
    narratives: []
  });
}

describe("create Change Set validation", () => {
  it("accepts ordered World, Canon and Event creates", () => {
    expect(() => validateCreateChangeSet(fixture())).not.toThrow();
  });

  it("rejects a partial Event reference with a stable error", () => {
    const input = fixture();
    const invalid = {
      ...input,
      operations: [
        input.operations[0]!,
        input.operations[2]!,
        input.operations[3]!
      ]
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
        path: "operations.2",
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
          : index === 3 && operation.entity_type === "event_canon_membership"
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
    expect(resolved.operations[3]?.value).toMatchObject({
      canon_id: TEST_FIXTURE.canonId
    });
  });

  it("accepts one Event participating in overlapping Canons without duplicating the Event", () => {
    const input = fixture();
    const secondCanonId = "01995c2a-7b00-7000-8000-000000000021";
    const overlapping: CreateChangeSet = {
      ...input,
      operations: [
        ...input.operations.slice(0, 2),
        {
          kind: "create",
          entity_type: "canon",
          entity_id: secondCanonId,
          value: {
            world_id: TEST_FIXTURE.worldId,
            slug: "second-canon",
            title: "Second Canon"
          }
        },
        ...input.operations.slice(2),
        {
          kind: "add",
          entity_type: "event_canon_membership",
          value: {
            event_id: TEST_FIXTURE.eventId,
            canon_id: secondCanonId
          }
        }
      ]
    };

    expect(() => validateAgainstEmpty(overlapping)).not.toThrow();
    expect(
      overlapping.operations.filter(
        (operation) => operation.entity_type === "event"
      )
    ).toHaveLength(1);
  });

  it("rejects an active Event with no Canon membership", () => {
    const input = fixture();
    const orphan = {
      ...input,
      operations: input.operations.slice(0, -1)
    } as CreateChangeSet;
    expect(() => validateAgainstEmpty(orphan)).toThrowError(
      expect.objectContaining({ code: "event_canon_membership_required" })
    );
  });

  it("rejects duplicate membership and removing the last active membership", () => {
    const input = fixture();
    const duplicate = {
      ...input,
      operations: [...input.operations, input.operations.at(-1)!]
    } as CreateChangeSet;
    expect(() => validateAgainstEmpty(duplicate)).toThrowError(
      expect.objectContaining({ code: "duplicate_canon_membership" })
    );

    const existing = validateAgainstEmpty(input);
    expect(existing).toEqual([]);
    const removal: CreateChangeSet = {
      ...input,
      change_set_id: "01995c2a-7b00-7000-8000-000000000022",
      expected_revision: 1,
      operations: [
        {
          kind: "remove",
          entity_type: "event_canon_membership",
          value: {
            event_id: TEST_FIXTURE.eventId,
            canon_id: TEST_FIXTURE.canonId
          }
        }
      ]
    };
    const resolved = resolveCreateOperations(removal, () => {
      throw new Error("unexpected generated ID");
    });
    const state = {
      world: {
        id: TEST_FIXTURE.worldId,
        slug: "test-world",
        title: TEST_FIXTURE.worldTitle,
        description: null
      },
      canons: [
        {
          id: TEST_FIXTURE.canonId,
          world_id: TEST_FIXTURE.worldId,
          slug: "test-canon",
          title: TEST_FIXTURE.canonTitle,
          description: null
        }
      ],
      timeSystems: [],
      canonTimeSystems: [],
      eventCanonMemberships: [
        { event_id: TEST_FIXTURE.eventId, canon_id: TEST_FIXTURE.canonId }
      ],
      events: [
        {
          id: TEST_FIXTURE.eventId,
          canon_id: TEST_FIXTURE.canonId,
          slug: "first-test-event",
          kind: "atomic" as const,
          title: TEST_FIXTURE.eventTitle,
          summary: null,
          roles: [],
          attributes: {}
        }
      ],
      relations: [],
      narratives: []
    };
    expect(() =>
      validateCandidateChangeSet(removal, resolved.operations, state)
    ).toThrowError(
      expect.objectContaining({ code: "event_canon_membership_required" })
    );

    const withdrawal: CreateChangeSet = {
      ...removal,
      change_set_id: "01995c2a-7b00-7000-8000-000000000023",
      operations: [
        {
          kind: "withdraw",
          entity_type: "event",
          value: { event_id: TEST_FIXTURE.eventId }
        },
        ...removal.operations
      ]
    };
    const withdrawalResolved = resolveCreateOperations(withdrawal, () => {
      throw new Error("unexpected generated ID");
    });
    expect(() =>
      validateCandidateChangeSet(
        withdrawal,
        withdrawalResolved.operations,
        state
      )
    ).not.toThrow();
  });

  it("canonicalizes object key order for idempotency digests", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(
      stableStringify({ a: 1, b: 2 })
    );
  });
});
