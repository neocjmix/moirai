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
    relationCanonMemberships: [],
    events: [],
    relations: [],
    narratives: []
  });
}

describe("create Change Set validation", () => {
  it("accepts ordered World, Canon and Event creates", () => {
    expect(() => validateCreateChangeSet(fixture())).not.toThrow();
  });

  it("rejects a newly created Composite Event without an authored child", () => {
    const input = fixture();
    const incomplete = {
      ...input,
      operations: input.operations.map((operation) =>
        operation.entity_type === "event" && operation.kind === "create"
          ? {
              ...operation,
              value: { ...operation.value, kind: "composite" as const }
            }
          : operation
      )
    } as CreateChangeSet;

    expect(() => validateAgainstEmpty(incomplete)).toThrowError(
      expect.objectContaining({ code: "composite_children_required" })
    );
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
      eventCanonMemberships: [],
      relationCanonMemberships: [],
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
      relationCanonMemberships: [],
      events: [
        {
          id: TEST_FIXTURE.eventId,
          world_id: TEST_FIXTURE.worldId,
          canon_memberships: [TEST_FIXTURE.canonId],
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

describe("reader-first Narrative corrections", () => {
  const narrativeId = "01995c2a-7b00-7000-8000-000000000777";
  const value = {
    canon_id: TEST_FIXTURE.canonId,
    scope_type: "canon" as const,
    scope_id: TEST_FIXTURE.canonId,
    locale: "ko",
    kind: "primary" as const,
    title: "사건",
    body: "왕위가 바뀌었다.",
    public_references: []
  };
  const create = {
    kind: "create" as const,
    entity_type: "narrative" as const,
    entity_id: narrativeId,
    value
  };
  const update = {
    kind: "update" as const,
    entity_type: "narrative" as const,
    value: {
      ...value,
      narrative_id: narrativeId,
      body: "왕위 교체 이후 제도가 바뀌었다."
    }
  };
  it("corrects prose and classification under the same identity", () => {
    const input = {
      ...fixture(),
      operations: [
        ...fixture().operations,
        create,
        { ...update, value: { ...update.value, kind: "annotation" as const } }
      ]
    };
    expect(validateAgainstEmpty(input)).toEqual([]);
    expect(
      resolveCreateOperations(input, () => "unused").operations.at(-1)
        ?.entity_id
    ).toBe(narrativeId);
  });
  it("rejects unknown Narrative and scope changes", () => {
    expect(() =>
      validateAgainstEmpty({
        ...fixture(),
        operations: [...fixture().operations, update]
      })
    ).toThrow("Narrative does not exist");
    expect(() =>
      validateAgainstEmpty({
        ...fixture(),
        operations: [
          ...fixture().operations,
          create,
          { ...update, value: { ...update.value, locale: "en" } }
        ]
      })
    ).toThrow("preserve Canon, scope and locale");
  });
  it("flags process boilerplate but allows substantive historical uncertainty", () => {
    const input = (body: string) => ({
      ...fixture(),
      operations: [
        ...fixture().operations,
        { ...create, value: { ...value, body } }
      ]
    });
    expect(
      validateAgainstEmpty(input("이 Canon은 기존 사건을 재사용한다."))
    ).toMatchObject([{ code: "narrative_editorial_content" }]);
    expect(
      validateAgainstEmpty(input("사망 경위는 기록에 따라 다르게 전한다."))
    ).toEqual([]);
  });
});

describe("World metadata corrections", () => {
  const update = {
    kind: "update" as const,
    entity_type: "world" as const,
    value: {
      world_id: TEST_FIXTURE.worldId,
      slug: "test-world",
      title: "Expanded history",
      description: "1380–1598"
    }
  };
  it("preserves identity and accepts a title/description correction", () => {
    const input = {
      ...fixture(),
      operations: [...fixture().operations, update]
    };
    expect(validateAgainstEmpty(input)).toEqual([]);
    expect(
      resolveCreateOperations(input, () => "unused").operations.at(-1)
        ?.entity_id
    ).toBe(TEST_FIXTURE.worldId);
  });
  it("rejects another World, missing World and slug changes", () => {
    expect(() =>
      validateAgainstEmpty({ ...fixture(), operations: [update] })
    ).toThrow("existing Change Set World");
    for (const value of [
      { ...update.value, world_id: TEST_FIXTURE.eventId },
      { ...update.value, slug: "changed" }
    ]) {
      expect(() =>
        validateAgainstEmpty({
          ...fixture(),
          operations: [...fixture().operations, { ...update, value }]
        })
      ).toThrow();
    }
  });
});

describe("Event metadata corrections", () => {
  const update = {
    kind: "update" as const,
    entity_type: "event" as const,
    value: {
      event_id: TEST_FIXTURE.eventId,
      attributes: { date_precision: "year", date_original: "1573" }
    }
  };
  it("preserves Event identity and warns that descriptive dates are not coordinates", () => {
    const input = {
      ...fixture(),
      operations: [...fixture().operations, update]
    };
    expect(validateAgainstEmpty(input)).toMatchObject([
      {
        code: "descriptive_date_without_temporal_anchor",
        affected_ids: [TEST_FIXTURE.eventId, TEST_FIXTURE.canonId]
      }
    ]);
    expect(
      resolveCreateOperations(input, () => "unused").operations.at(-1)
        ?.entity_id
    ).toBe(TEST_FIXTURE.eventId);
  });
  it("does not demand explicit Time Event anchors for a thematic Composite", () => {
    const composite = "01995c2a-7b00-7000-8000-000000000777";
    const relation = "01995c2a-7b00-7000-8000-000000000778";
    const input: CreateChangeSet = {
      ...fixture(),
      operations: [
        ...fixture().operations,
        {
          kind: "create",
          entity_type: "event",
          entity_id: composite,
          value: {
            world_id: TEST_FIXTURE.worldId,
            slug: "aggregate",
            title: "Aggregate",
            kind: "composite",
            roles: [],
            attributes: {
              date_precision: "year",
              historical_range: [1573, 1600]
            }
          }
        },
        {
          kind: "add",
          entity_type: "event_canon_membership",
          value: { event_id: composite, canon_id: TEST_FIXTURE.canonId }
        },
        {
          kind: "create",
          entity_type: "relation",
          entity_id: relation,
          value: {
            world_id: TEST_FIXTURE.worldId,
            type: "contains",
            source_ref: { kind: "event", event_id: composite },
            target_ref: { kind: "event", event_id: TEST_FIXTURE.eventId },
            direction: "directed",
            attributes: {}
          }
        },
        {
          kind: "add",
          entity_type: "relation_canon_membership",
          value: { relation_id: relation, canon_id: TEST_FIXTURE.canonId }
        }
      ]
    };
    expect(validateAgainstEmpty(input)).toEqual([]);
  });
  it("rejects metadata updates to a missing Event", () => {
    expect(() =>
      validateAgainstEmpty({ ...fixture(), operations: [update] })
    ).toThrow();
  });
});
