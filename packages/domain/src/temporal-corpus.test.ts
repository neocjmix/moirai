import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TemporalAdapterRegistry,
  createGregorianUtcAdapter,
  createOpaqueCustomAdapter,
  solveTemporalConstraints,
  type TemporalConstraint,
  type TemporalEventReference
} from "./temporal.js";
import { solveTemporalGraph } from "./temporal-graph.js";

// Test-only extraction. This is not the production Change Plan validator.
type FixtureReference =
  TemporalEventReference | { kind: "event"; client_ref: string };
interface Fixture {
  operations: Array<{
    entity_id: string;
    entity_type: string;
    value: {
      type?: string;
      source_ref?: FixtureReference;
      target_ref?: FixtureReference;
    };
  }>;
}
const base = new URL(
  "../../../docs/implementation/fixtures/temporal-expressiveness/",
  import.meta.url
);
const registry = new TemporalAdapterRegistry([
  createGregorianUtcAdapter("019f3b00-0000-7000-8000-000000000003")
]);
function extract(file: string): TemporalConstraint[] {
  const fixture = JSON.parse(
    readFileSync(new URL(file, base), "utf8")
  ) as Fixture;
  const ref = (input: FixtureReference): TemporalEventReference =>
    input.kind === "event" && "client_ref" in input
      ? { kind: "event", event_id: input.client_ref }
      : input;
  return fixture.operations.flatMap((op) => {
    const type = op.value.type;
    if (
      op.entity_type !== "relation" ||
      (type !== "precedes" && type !== "not_after" && type !== "coincides")
    )
      return [];
    return [
      {
        id: op.entity_id,
        type,
        source: ref(op.value.source_ref!),
        target: ref(op.value.target_ref!)
      }
    ];
  });
}
describe("machine-readable Slice 0 corpus through the independent solver", () => {
  it("rejects the original duplicate-start plan with both boundary relation IDs", () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL("rejection/bad-duplicate-start.change-plan.json", base),
        "utf8"
      )
    ) as Fixture;
    const result = solveTemporalGraph(
      {
        constraints: [],
        complete_composite_ids: ["bad-duplicate-start"],
        structural_relations: fixture.operations
          .filter((op) => op.value.type === "starts")
          .map((op) => ({
            id: op.entity_id,
            type: "starts",
            source: op.value.source_ref as TemporalEventReference,
            target: { kind: "event", event_id: "bad-duplicate-start" }
          }))
      },
      registry
    );
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        constraint_ids: [
          "019f3b00-0000-7000-8000-000000000352",
          "019f3b00-0000-7000-8000-000000000353"
        ]
      })
    );
  });

  it("rejects the original cross-system plan after test-only client-ref resolution", () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL("rejection/bad-system.change-plan.json", base),
        "utf8"
      )
    ) as Fixture;
    const clock = fixture.operations.find(
      (op) => op.entity_type === "time_system"
    )!;
    const relation = fixture.operations.find(
      (op) => op.entity_type === "relation"
    )!;
    const custom = createOpaqueCustomAdapter({
      timeSystemId: clock.entity_id,
      definitionVersion: "1",
      canonicalPattern: /^cycle:\d{6}$/
    });
    const result = solveTemporalConstraints(
      [
        {
          id: relation.entity_id,
          type: "precedes",
          source: relation.value.source_ref as TemporalEventReference,
          target: {
            ...(relation.value.target_ref as Extract<
              TemporalEventReference,
              { kind: "time_event" }
            >),
            time_system_ref: { time_system_id: clock.entity_id }
          }
        }
      ],
      new TemporalAdapterRegistry([
        createGregorianUtcAdapter("019f3b00-0000-7000-8000-000000000003"),
        custom
      ])
    );
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        required_capability: "conversion",
        constraint_ids: [relation.entity_id]
      })
    );
  });

  it("matches expected bounded and exact coordinate outputs directly from the JSON plans", () => {
    const result = solveTemporalConstraints(
      extract("success.change-plan.json"),
      registry
    );
    expect(result.valid).toBe(true);
    const expected = JSON.parse(
      readFileSync(new URL("expected/solver-projection.json", base), "utf8")
    ) as {
      items: Array<{
        case_id: string;
        kind: string;
        lower?: string;
        upper?: string;
        coordinate?: string;
      }>;
    };
    for (const item of expected.items) {
      const actual = result.projections.find(
        (projection) => projection.event_id === item.case_id
      );
      if (item.kind === "bounded" || item.kind === "bounded_during") {
        expect(actual).toMatchObject({
          kind: "bounded",
          lower: { time_event: { coordinate: item.lower }, inclusive: true },
          upper: { time_event: { coordinate: item.upper }, inclusive: false }
        });
      } else if (item.kind === "exact") {
        expect(actual).toMatchObject({
          kind: "exact",
          time_event: { coordinate: item.coordinate }
        });
      } else if (item.kind === "relative_only") {
        expect(actual?.kind).toBe("relative-only");
      }
    }
  });
  it.each(["bad-cycle", "bad-boundary", "bad-coordinate"])(
    "rejects %s from the original JSON fixture",
    (name) => {
      const result = solveTemporalConstraints(
        extract(`rejection/${name}.change-plan.json`),
        registry
      );
      expect(result.valid).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(
        result.diagnostics.every(
          (diagnostic) => diagnostic.constraint_ids.length > 0
        )
      ).toBe(true);
    }
  );
});
