import { readFileSync } from "node:fs";
import {
  normalizeLegacyChangePlan,
  type CreateChangeSet
} from "@moirai/contracts";
import { describe, expect, it } from "vitest";

import {
  ChangeSetError,
  resolveEventReference,
  resolveCreateOperations,
  temporalAdapterRegistry,
  validateCandidateChangeSet,
  type CanonicalState
} from "./index.js";

const fixtureBase = new URL(
  "../../../docs/implementation/fixtures/temporal-expressiveness/",
  import.meta.url
);

function fixture(path: string): CreateChangeSet {
  return {
    ...normalizeLegacyChangePlan(
      JSON.parse(readFileSync(new URL(path, fixtureBase), "utf8"))
    ),
    actor: "019f3b00-0000-7000-8000-000000000099"
  } as CreateChangeSet;
}

function bootstrapState(): CanonicalState {
  const plan = fixture("bootstrap.change-plan.json");
  const { operations } = resolveCreateOperations(plan, () => {
    throw new Error("The fixed bootstrap fixture has explicit IDs");
  });
  validateCandidateChangeSet(plan, operations, {
    world: null,
    canons: [],
    timeSystems: [],
    canonTimeSystems: [],
    events: [],
    relations: [],
    narratives: []
  });
  const pick = (type: string) =>
    operations.filter(
      (operation) =>
        operation.kind === "create" && operation.entity_type === type
    );
  const world = pick("world")[0]!;
  return {
    world: { id: world.entity_id, ...world.value },
    canons: pick("canon").map((operation) => ({
      id: operation.entity_id,
      ...operation.value
    })),
    timeSystems: pick("time_system").map((operation) => ({
      id: operation.entity_id,
      ...operation.value
    })),
    canonTimeSystems: pick("canon_time_system").map((operation) => ({
      id: operation.entity_id,
      ...operation.value
    })),
    events: [],
    relations: [],
    narratives: []
  } as CanonicalState;
}

function resolved(path: string) {
  const plan = fixture(path);
  return { plan, ...resolveCreateOperations(plan, () => "") };
}

describe("TS-010 Change Plan validation", () => {
  it("accepts the canonical contract for every World", () => {
    const plan = fixture("success.change-plan.json");
    const disabled = {
      ...plan,
      world_id: "019f3b00-0000-7000-8000-000000000099"
    } as CreateChangeSet;
    expect(() =>
      resolveCreateOperations(
        disabled,
        () => "019f3b00-0000-7000-8000-000000000399"
      )
    ).not.toThrow();
  });

  it("accepts the full v2 corpus through the lossless ingress adapter", () => {
    const { plan, operations } = resolved("success.change-plan.json");
    expect(
      validateCandidateChangeSet(plan, operations, bootstrapState())
    ).toEqual([]);
    const eventOperations = operations.filter(
      (operation) =>
        operation.kind === "create" && operation.entity_type === "event"
    );
    expect(eventOperations).toHaveLength(11);
    expect(
      eventOperations.some((operation) =>
        operation.entity_id.startsWith("time-event://")
      )
    ).toBe(false);
    const references = operations
      .filter(
        (operation) =>
          operation.kind === "create" && operation.entity_type === "relation"
      )
      .flatMap((operation) => {
        const value = operation.value as {
          source_ref: { kind: string; coordinate?: string };
          target_ref: { kind: string; coordinate?: string };
        };
        return [value.source_ref, value.target_ref];
      })
      .filter(
        (reference): reference is { kind: "time_event"; coordinate: string } =>
          reference.kind === "time_event" &&
          typeof reference.coordinate === "string"
      )
      .map((reference) => reference.coordinate);
    expect(references).toContain("2026-09-05T08:13:21.123456789012Z");
    expect(references).toContain("2026-09-05T08:13:21.123456789013Z");
  });

  it("resolves the same virtual Time Event deterministically without mutating Canon state", () => {
    const state = bootstrapState();
    const reference = {
      kind: "time_event" as const,
      time_system_ref: {
        time_system_id: "019f3b00-0000-7000-8000-000000000003"
      },
      definition_version: "1",
      coordinate: "2026-09-05T08:13:21.123456789012Z"
    };
    const registry = temporalAdapterRegistry(state.timeSystems);
    const first = resolveEventReference(reference, registry);
    const second = resolveEventReference(reference, registry);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      persisted: false,
      coordinate: reference.coordinate
    });
    expect(state.events).toHaveLength(0);
    expect(state.relations).toHaveLength(0);
  });

  it.each([
    [
      "bad-cycle",
      "temporal_constraint_conflict",
      [
        "019f3b00-0000-7000-8000-000000000313",
        "019f3b00-0000-7000-8000-000000000314"
      ]
    ],
    [
      "bad-boundary",
      "composite_boundary_order_invalid",
      [
        "019f3b00-0000-7000-8000-000000000324",
        "019f3b00-0000-7000-8000-000000000325",
        "019f3b00-0000-7000-8000-000000000326"
      ]
    ],
    [
      "bad-system",
      "time_system_capability_missing",
      [
        "019f3b00-0000-7000-8000-000000000003",
        "019f3b00-0000-7000-8000-000000000331"
      ]
    ],
    [
      "bad-coordinate",
      "invalid_time_coordinate",
      ["019f3b00-0000-7000-8000-000000000342"]
    ],
    [
      "bad-duplicate-start",
      "composite_boundary_not_unique",
      [
        "019f3b00-0000-7000-8000-000000000352",
        "019f3b00-0000-7000-8000-000000000353"
      ]
    ]
  ])("rejects %s with its conflicting source evidence", (name, code, ids) => {
    const { plan, operations } = resolved(`rejection/${name}.change-plan.json`);
    let failure: unknown;
    try {
      validateCandidateChangeSet(plan, operations, bootstrapState());
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ChangeSetError);
    const issue = failure as ChangeSetError;
    expect(issue.code).toBe(code);
    expect(issue.affected_ids).toEqual(expect.arrayContaining(ids));
    if (name === "bad-coordinate") {
      expect(issue.recovery?.original_coordinate).toBe(
        "2026-09-05T08:13:21.1234567890120Z"
      );
    } else {
      expect(issue.recovery?.constraint_ids).toEqual(
        expect.arrayContaining(
          ids.filter(
            (id) =>
              id !== "019f3b00-0000-7000-8000-000000000003" &&
              id !== "019f3b00-0000-7000-8000-000000000331"
          )
        )
      );
    }
  });
});
