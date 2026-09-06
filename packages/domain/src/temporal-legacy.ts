import type {
  PublicRelation,
  PublicTemporalPlacement,
  PublicTimeSystem
} from "@moirai/contracts";
import {
  createIntegerOrdinalAdapter,
  solveTemporalConstraints,
  type TemporalAdapterRegistry,
  type TemporalConstraint,
  type TemporalEventReference
} from "./temporal.js";

export interface LegacyTemporalRead {
  readonly classification:
    "lossless" | "ambiguous" | "unsupported" | "conflicting";
  readonly placement_id: string;
  readonly reason: string;
  readonly constraints: readonly TemporalConstraint[];
}

export interface LegacyTemporalShadow {
  readonly reads: readonly LegacyTemporalRead[];
  readonly authored_constraints: readonly TemporalConstraint[];
  readonly solver: ReturnType<typeof solveTemporalConstraints>;
}

function definitionString(
  definition: Readonly<Record<string, unknown>>,
  key: string
): string | null {
  const value = definition[key];
  return typeof value === "string" ? value : null;
}

function canReadDiscreteInteger(system: PublicTimeSystem): boolean {
  return (
    definitionString(system.definition, "coordinate") === "integer" &&
    (system.kind === "ordinal" || system.kind === "relative") &&
    definitionString(system.definition, "unit") !== "year"
  );
}

/** One-way shadow input only. Never writes or deletes a legacy Placement. */
export function readLegacyTemporalPlacement(
  placement: PublicTemporalPlacement,
  system: PublicTimeSystem,
  registry: TemporalAdapterRegistry,
  authored: readonly TemporalConstraint[] = []
): LegacyTemporalRead {
  const result = (
    classification: LegacyTemporalRead["classification"],
    reason: string,
    constraints: readonly TemporalConstraint[] = []
  ): LegacyTemporalRead => ({
    classification,
    placement_id: placement.id,
    reason,
    constraints
  });
  if (placement.time_system_id !== system.id)
    return result(
      "unsupported",
      "Placement requires its original versioned integer Time System"
    );
  const values = [
    placement.earliest_start,
    placement.latest_start,
    placement.earliest_end,
    placement.latest_end
  ].filter((value) => value !== null);
  if (values.some((value) => !Number.isSafeInteger(value.value)))
    return result(
      "unsupported",
      "Numeric coordinate has already exceeded lossless integer representation"
    );
  if (placement.earliest_start.value > placement.latest_start.value)
    return result("conflicting", "Legacy earliest start is after latest start");
  if (
    placement.earliest_end !== null &&
    placement.latest_end !== null &&
    placement.earliest_end.value > placement.latest_end.value
  )
    return result("conflicting", "Legacy earliest end is after latest end");
  if (placement.kind === "interval")
    return result(
      "ambiguous",
      "Interval Placement does not identify explicit start/end Events; no boundary Events are invented"
    );
  if (placement.earliest_end || placement.latest_end)
    return result(
      "conflicting",
      "Point Placement unexpectedly contains end coordinates"
    );
  if (
    system.kind === "calendar" ||
    definitionString(system.definition, "unit") === "year" ||
    /^(year|month|day|ms|ps|millisecond|picosecond)$/i.test(placement.precision)
  )
    return result(
      "ambiguous",
      "Calendar or resolution labels do not establish lossless bucket boundary semantics"
    );
  if (!canReadDiscreteInteger(system))
    return result(
      "unsupported",
      "Placement requires an ordinal or relative integer Time System"
    );
  if (placement.certainty !== "exact")
    return result(
      "ambiguous",
      "Legacy certainty-to-assertion metadata migration is not yet specified"
    );
  const adapter = registry.get(system.id, system.definition_version);
  if (!adapter?.compare)
    return result(
      "unsupported",
      "No comparable adapter is registered for the original Time System version"
    );
  const point = (value: number): TemporalEventReference => ({
    kind: "time_event",
    time_system_ref: { time_system_id: system.id },
    definition_version: system.definition_version,
    coordinate: String(value)
  });
  const event: TemporalEventReference = {
    kind: "event",
    event_id: placement.event_id
  };
  const constraints: TemporalConstraint[] =
    placement.earliest_start.value === placement.latest_start.value
      ? [
          {
            id: `legacy:${placement.id}:exact`,
            type: "coincides",
            source: event,
            target: point(placement.earliest_start.value)
          }
        ]
      : [
          {
            id: `legacy:${placement.id}:lower`,
            type: "not_after",
            source: point(placement.earliest_start.value),
            target: event
          },
          {
            id: `legacy:${placement.id}:upper`,
            type: "not_after",
            source: event,
            target: point(placement.latest_start.value)
          }
        ];
  const solved = solveTemporalConstraints(
    [...authored, ...constraints],
    registry
  );
  if (!solved.valid)
    return result(
      "conflicting",
      solved.diagnostics.map((item) => item.message).join("; "),
      constraints
    );
  return result(
    "lossless",
    "Original integer position and inclusive knowledge bounds are preserved; no calendar conversion",
    constraints
  );
}

/**
 * Runs the legacy read adapter and the new solver against one immutable source
 * revision. It only returns a comparison report; it performs no Canon write.
 */
export function shadowLegacyTemporalState(
  source: {
    readonly temporalPlacements: readonly PublicTemporalPlacement[];
    readonly timeSystems: readonly PublicTimeSystem[];
    readonly relations: readonly PublicRelation[];
  },
  registry: TemporalAdapterRegistry
): LegacyTemporalShadow {
  const systems = new Map(
    source.timeSystems.map((system) => [system.id, system])
  );
  for (const system of systems.values()) {
    if (
      canReadDiscreteInteger(system) &&
      !registry.get(system.id, system.definition_version)
    ) {
      registry.register(
        createIntegerOrdinalAdapter({
          timeSystemId: system.id,
          definitionVersion: system.definition_version,
          unit: definitionString(system.definition, "unit") ?? "coordinate"
        })
      );
    }
  }
  const authored: TemporalConstraint[] = source.relations
    .filter((relation) => relation.type === "precedes")
    .map((relation) => ({
      id: relation.id,
      type: "precedes" as const,
      source: { kind: "event", event_id: relation.source_event_id },
      target: { kind: "event", event_id: relation.target_event_id }
    }));
  const initial = source.temporalPlacements.map((placement) => {
    const system = systems.get(placement.time_system_id);
    return system
      ? readLegacyTemporalPlacement(placement, system, registry, authored)
      : {
          classification: "unsupported" as const,
          placement_id: placement.id,
          reason: "Placement references a missing Time System",
          constraints: []
        };
  });
  const constraints = initial.flatMap((read) => read.constraints);
  const solver = solveTemporalConstraints(
    [...authored, ...constraints],
    registry
  );
  const diagnosticIds = new Set(
    solver.diagnostics.flatMap((diagnostic) => diagnostic.constraint_ids)
  );
  const reads = initial.map((read) =>
    read.classification === "lossless" &&
    read.constraints.some((constraint) => diagnosticIds.has(constraint.id))
      ? {
          ...read,
          classification: "conflicting" as const,
          reason: solver.diagnostics
            .filter((diagnostic) =>
              diagnostic.constraint_ids.some((id) =>
                read.constraints.some((constraint) => constraint.id === id)
              )
            )
            .map((diagnostic) => diagnostic.message)
            .join("; ")
        }
      : read
  );
  return { reads, authored_constraints: authored, solver };
}
