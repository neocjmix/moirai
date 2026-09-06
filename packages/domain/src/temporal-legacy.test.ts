import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type {
  PublicRelation,
  PublicTemporalPlacement,
  PublicTimeSystem
} from "@moirai/contracts";
import { TemporalAdapterRegistry } from "./temporal.js";
import { shadowLegacyTemporalState } from "./temporal-legacy.js";

interface ShadowEvidence {
  readonly time_systems: readonly PublicTimeSystem[];
  readonly temporal_placements: readonly PublicTemporalPlacement[];
  readonly relations: readonly PublicRelation[];
  readonly expected: {
    readonly classification_counts: Readonly<
      Record<"lossless" | "ambiguous" | "unsupported" | "conflicting", number>
    >;
    readonly ambiguous_placement_ids: readonly string[];
    readonly solver: {
      readonly valid: boolean;
      readonly diagnostic_codes: readonly string[];
      readonly exact_coordinates_by_event: Readonly<Record<string, string>>;
    };
  };
}

function readSyntheticRevision29Evidence(): ShadowEvidence {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../../docs/implementation/evidence/temporal-shadow-clotho-synthetic-r29.json",
        import.meta.url
      ),
      "utf8"
    )
  ) as ShadowEvidence;
}

const ordinal: PublicTimeSystem = {
  id: "ordinal",
  world_id: "world",
  slug: "sequence",
  title: "Sequence",
  kind: "ordinal",
  definition_version: "1",
  definition: { coordinate: "integer", unit: "step" }
};
const calendarLike: PublicTimeSystem = {
  ...ordinal,
  id: "year",
  slug: "year",
  title: "Year",
  definition: { coordinate: "integer", unit: "year" }
};
function placement(
  id: string,
  eventId: string,
  start: number,
  latest = start,
  overrides: Partial<PublicTemporalPlacement> = {}
): PublicTemporalPlacement {
  return {
    id,
    event_id: eventId,
    time_system_id: "ordinal",
    kind: "point",
    earliest_start: { value: start },
    latest_start: { value: latest },
    earliest_end: null,
    latest_end: null,
    precision: "step",
    certainty: "exact",
    display_label: null,
    ...overrides
  };
}
function shadow(
  temporalPlacements: readonly PublicTemporalPlacement[],
  relations: readonly PublicRelation[] = [],
  timeSystems: readonly PublicTimeSystem[] = [ordinal]
) {
  return shadowLegacyTemporalState(
    { temporalPlacements, relations, timeSystems },
    new TemporalAdapterRegistry()
  );
}

it("maps exact discrete ordinal points to a lossless virtual Time Event constraint", () => {
  const result = shadow([placement("p", "event", 42)]);
  expect(result.reads).toEqual([
    expect.objectContaining({
      classification: "lossless",
      constraints: [
        expect.objectContaining({
          type: "coincides",
          target: expect.objectContaining({ coordinate: "42" })
        })
      ]
    })
  ]);
  expect(result.solver.valid).toBe(true);
});

it("keeps a discrete inclusive knowledge range without inventing a calendar boundary", () => {
  const result = shadow([placement("p", "event", 2, 4)]);
  expect(result.reads[0]).toMatchObject({ classification: "lossless" });
  expect(result.solver.projections[0]).toMatchObject({
    kind: "bounded",
    lower: { inclusive: true, time_event: { coordinate: "2" } },
    upper: { inclusive: true, time_event: { coordinate: "4" } }
  });
});

it("classifies calendar labels, duration-shaped intervals, and missing systems without conversion", () => {
  const interval = placement("interval", "duration", 2, 2, {
    kind: "interval",
    earliest_end: { value: 3 },
    latest_end: { value: 3 }
  });
  const missing = placement("missing", "missing-event", 1, 1, {
    time_system_id: "absent"
  });
  const year = placement("year-placement", "year-event", 220, 220, {
    time_system_id: "year",
    precision: "year"
  });
  const source = [interval, missing, year];
  const before = structuredClone(source);
  const result = shadow(source, [], [ordinal, calendarLike]);
  expect(result.reads.map((item) => item.classification)).toEqual([
    "ambiguous",
    "unsupported",
    "ambiguous"
  ]);
  expect(source).toEqual(before);
});

it("classifies exact placements as conflicting when existing authored order contradicts them", () => {
  const relations: PublicRelation[] = [
    {
      id: "a-before-b",
      canon_id: "canon",
      type: "precedes",
      source_event_id: "a",
      target_event_id: "b",
      direction: "directed",
      attributes: {}
    }
  ];
  const result = shadow(
    [placement("a-position", "a", 10), placement("b-position", "b", 5)],
    relations
  );
  expect(result.solver.valid).toBe(false);
  expect(result.reads.map((item) => item.classification)).toEqual([
    "conflicting",
    "conflicting"
  ]);
  expect(result.solver.diagnostics).toContainEqual(
    expect.objectContaining({
      constraint_ids: expect.arrayContaining([
        "a-before-b",
        "legacy:a-position:exact",
        "legacy:b-position:exact"
      ])
    })
  );
});

it("reproduces the read-only Clotho Synthetic revision 29 shadow report", () => {
  const evidence = readSyntheticRevision29Evidence();
  const result = shadow(
    evidence.temporal_placements,
    evidence.relations,
    evidence.time_systems
  );
  const counts = {
    lossless: 0,
    ambiguous: 0,
    unsupported: 0,
    conflicting: 0
  };
  for (const read of result.reads) counts[read.classification] += 1;
  expect(counts).toEqual(evidence.expected.classification_counts);
  expect(
    result.reads
      .filter((read) => read.classification === "ambiguous")
      .map((read) => read.placement_id)
      .sort()
  ).toEqual([...evidence.expected.ambiguous_placement_ids].sort());
  expect(
    result.authored_constraints.map((constraint) => constraint.id).sort()
  ).toEqual(evidence.relations.map((relation) => relation.id).sort());
  expect(result.solver.valid).toBe(evidence.expected.solver.valid);
  expect(
    result.solver.diagnostics.map((diagnostic) => diagnostic.code)
  ).toEqual(evidence.expected.solver.diagnostic_codes);
  const exactCoordinates = Object.fromEntries(
    result.solver.projections.flatMap((projection) =>
      projection.kind === "exact"
        ? [[projection.event_id, projection.time_event.coordinate]]
        : []
    )
  );
  expect(exactCoordinates).toEqual(
    evidence.expected.solver.exact_coordinates_by_event
  );
});
