import { expect, it } from "vitest";
import {
  createGregorianUtcAdapter,
  TemporalAdapterRegistry,
  solveTemporalConstraints,
  type TemporalConstraint,
  type TemporalEventReference
} from "./temporal.js";
import { solveTemporalGraph } from "./temporal-graph.js";

const registry = new TemporalAdapterRegistry([createGregorianUtcAdapter()]);
const event = (id: string): TemporalEventReference => ({
  kind: "event",
  event_id: id
});
const time = (second: string): TemporalEventReference => ({
  kind: "time_event",
  time_system_ref: { time_system_id: "proleptic-gregorian-utc" },
  definition_version: "1",
  coordinate: `2026-09-05T08:13:${second}.000000000000Z`
});

it("keeps normalization, projections and evidence independent of input order and equality direction", () => {
  const constraints: TemporalConstraint[] = [
    { id: "a", type: "coincides", source: event("a"), target: event("b") },
    { id: "b", type: "coincides", source: event("b"), target: time("22") },
    { id: "c", type: "precedes", source: event("a"), target: event("c") }
  ];
  const result = solveTemporalConstraints(constraints, registry);
  expect(
    result.projections.find((item) => item.event_id === "a")
  ).toMatchObject({ kind: "exact", source_constraint_ids: ["a", "b", "c"] });
  expect(
    solveTemporalConstraints(
      [...constraints]
        .reverse()
        .map((item) =>
          item.type === "coincides"
            ? { ...item, source: item.target, target: item.source }
            : item
        ),
      registry
    )
  ).toEqual(result);
});

it.each([
  ["22", "24", true],
  ["24", "22", false],
  ["22", "22", false]
] as const)(
  "validates complete boundary order %s to %s without an authored precedes",
  (start, end, valid) => {
    const result = solveTemporalGraph(
      {
        constraints: [],
        complete_composite_ids: ["composite"],
        structural_relations: [
          {
            id: "s",
            type: "starts",
            source: time(start),
            target: event("composite")
          },
          {
            id: "e",
            type: "ends",
            source: time(end),
            target: event("composite")
          },
          {
            id: "cs",
            type: "contains",
            source: event("composite"),
            target: time(start)
          },
          {
            id: "ce",
            type: "contains",
            source: event("composite"),
            target: time(end)
          }
        ]
      },
      registry
    );
    expect(result.valid).toBe(valid);
    expect(result.normalized_constraints).toEqual([]);
    if (!valid)
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ constraint_ids: ["e", "s"] })
      );
  }
);
