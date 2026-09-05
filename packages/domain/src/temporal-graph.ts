import {
  TEMPORAL_SOLVER_VERSION,
  solveTemporalConstraints,
  resolveTimeEvent,
  validateCompleteCompositeBoundaries,
  type TemporalAdapterRegistry,
  type TemporalConstraint,
  type CompositeTemporalRelation,
  type TemporalEventReference,
  type TemporalSolveResult
} from "./temporal.js";

/** Pure validation of explicitly complete composites; no Canon mutations. */
export function solveTemporalGraph(
  input: {
    readonly constraints: readonly TemporalConstraint[];
    readonly structural_relations: readonly CompositeTemporalRelation[];
    readonly complete_composite_ids: readonly string[];
  },
  registry: TemporalAdapterRegistry
): TemporalSolveResult {
  const canonical = (ref: TemporalEventReference): TemporalEventReference => {
    if (ref.kind === "event") return ref;
    const resolved = resolveTimeEvent(ref, registry);
    return {
      kind: "time_event",
      time_system_ref: resolved.time_system_ref,
      definition_version: resolved.definition_version,
      coordinate: resolved.coordinate
    };
  };
  // Reuse the solver's guarded coordinate validation, including structural endpoints.
  const probes: TemporalConstraint[] = input.structural_relations.flatMap(
    (relation) =>
      [relation.source, relation.target].map((reference) => ({
        id: relation.id,
        type: "coincides" as const,
        source: reference,
        target: reference
      }))
  );
  const resolution = solveTemporalConstraints(probes, registry);
  if (!resolution.valid) return resolution;
  const structural = input.structural_relations.map((relation) => ({
    ...relation,
    source: canonical(relation.source),
    target: canonical(relation.target)
  }));
  const diagnostics = [
    ...validateCompleteCompositeBoundaries(
      input.complete_composite_ids,
      structural
    )
  ];
  const derived: TemporalConstraint[] = [];
  const origins = new Map<string, string[]>();
  for (const id of [...input.complete_composite_ids].sort()) {
    const boundaries = structural.filter(
      (relation) =>
        relation.target.kind === "event" && relation.target.event_id === id
    );
    const starts = boundaries.filter((relation) => relation.type === "starts");
    const ends = boundaries.filter((relation) => relation.type === "ends");
    if (starts.length !== 1 || ends.length !== 1) continue;
    const start = starts[0]!;
    const end = ends[0]!;
    // This is a validation constraint, not an authored or persisted Relation.
    const derivedId = `composite-order:${JSON.stringify([id, start.id, end.id])}`;
    origins.set(derivedId, [start.id, end.id]);
    derived.push({
      id: derivedId,
      type: "precedes",
      source: start.source,
      target: end.source
    });
  }
  const result = solveTemporalConstraints(
    [...input.constraints, ...derived],
    registry
  );
  const expand = (ids: readonly string[]) =>
    [...new Set(ids.flatMap((id) => origins.get(id) ?? [id]))].sort();
  const allDiagnostics = [
    ...diagnostics,
    ...result.diagnostics.map((item) => ({
      ...item,
      constraint_ids: expand(item.constraint_ids)
    }))
  ];
  return {
    ...result,
    valid: allDiagnostics.length === 0,
    // Never pretend that inferred validation edges were authored Canon input.
    normalized_constraints: result.normalized_constraints.filter(
      (item) => !origins.has(item.id)
    ),
    diagnostics: allDiagnostics,
    projections: result.projections.map((item) =>
      allDiagnostics.length > 0
        ? {
            event_id: item.event_id,
            kind: "unresolved",
            reason: "The temporal graph failed validation",
            source_constraint_ids: expand([
              ...item.source_constraint_ids,
              ...allDiagnostics.flatMap(
                (diagnostic) => diagnostic.constraint_ids
              )
            ]),
            algorithm_version: TEMPORAL_SOLVER_VERSION
          }
        : { ...item, source_constraint_ids: expand(item.source_constraint_ids) }
    )
  };
}
