import type {
  CanonicalEventReference,
  PublicRelationalTemporalProjection,
  PublicTemporalComposite,
  PublicTemporalExtent,
  PublicTemporalPosition,
  PublicSubjectProjection
} from "@moirai/contracts";
import {
  TEMPORAL_SOLVER_VERSION,
  calculateTemporalDifference,
  canonicalRelationEndpoints,
  endpointKey,
  resolveTimeEvent,
  solveTemporalGraph,
  stableStringify,
  temporalAdapterRegistry,
  type CompositeTemporalRelation,
  type TemporalConstraint,
  type ResolvedTimeEventReference
} from "@moirai/domain";
import { createHash } from "node:crypto";
import type { CanonicalRevisionView } from "./index.js";

export const RELATIONAL_TIME_ALGORITHM_VERSION =
  "event-relational-projection/1";

const unique = (ids: readonly string[]) => [...new Set(ids)].sort();

/** One immutable Canon graph, with no common numeric clock across Time Systems. */
export function projectRelationalTime(
  view: CanonicalRevisionView,
  revision: number,
  canonId: string,
  subjects: readonly PublicSubjectProjection[] = []
): PublicRelationalTemporalProjection {
  const events = view.events
    .filter((e) => e.canon_id === canonId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const inputRelations = view.relations
    .filter((r) => r.canon_id === canonId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const systems = view.timeSystems
    .filter((s) =>
      view.canonTimeSystems.some(
        (l) => l.canon_id === canonId && l.time_system_id === s.id
      )
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const registry = temporalAdapterRegistry(systems);
  const cleanRef = (ref: CanonicalEventReference): CanonicalEventReference =>
    ref.kind === "event"
      ? { kind: "event", event_id: ref.event_id }
      : {
          kind: "time_event",
          time_system_ref: {
            time_system_id: ref.time_system_ref.time_system_id
          },
          definition_version: ref.definition_version,
          coordinate: ref.coordinate
        };
  const relations = inputRelations.map((relation) => {
    const refs = canonicalRelationEndpoints(relation);
    if (!refs)
      throw new Error(`temporal_projection_missing_endpoints:${relation.id}`);
    return {
      id: relation.id,
      canon_id: relation.canon_id,
      type: relation.type,
      direction: relation.direction,
      attributes: relation.attributes,
      source_ref: cleanRef(refs.source),
      target_ref: cleanRef(refs.target)
    };
  });
  const constraints: TemporalConstraint[] = [];
  const structural: CompositeTemporalRelation[] = [];
  for (const relation of relations) {
    const endpoints = canonicalRelationEndpoints(relation);
    if (!endpoints)
      throw new Error(`temporal_projection_missing_endpoints:${relation.id}`);
    const edge = {
      id: relation.id,
      source: endpoints.source,
      target: endpoints.target
    };
    if (
      relation.type === "precedes" ||
      relation.type === "not_after" ||
      relation.type === "coincides"
    )
      constraints.push({ ...edge, type: relation.type });
    if (
      relation.type === "contains" ||
      relation.type === "starts" ||
      relation.type === "ends"
    )
      structural.push({ ...edge, type: relation.type });
  }
  const composites = events.filter((e) => e.kind === "composite");
  const complete = composites.filter((e) =>
    structural.some(
      (r) =>
        (r.type === "starts" || r.type === "ends") &&
        r.target.kind === "event" &&
        r.target.event_id === e.id
    )
  );
  const solved = solveTemporalGraph(
    {
      constraints,
      structural_relations: structural,
      complete_composite_ids: complete.map((e) => e.id)
    },
    registry
  );
  if (!solved.valid)
    throw new Error(
      `temporal_projection_invalid:${stableStringify(solved.diagnostics)}`
    );
  const positionById = new Map(solved.projections.map((p) => [p.event_id, p]));
  const positions: PublicTemporalPosition[] = events.map((event) => {
    const position = positionById.get(event.id) ?? {
      event_id: event.id,
      kind: "unresolved" as const,
      reason: "No position constraints",
      source_constraint_ids: [],
      algorithm_version: TEMPORAL_SOLVER_VERSION
    };
    const difference =
      position.kind === "bounded" && position.lower && position.upper
        ? calculateTemporalDifference(
            position.lower.time_event,
            position.upper.time_event,
            registry
          )
        : null;
    return {
      ...position,
      knowledge_span: difference && "value" in difference ? difference : null
    };
  });
  const point = (
    ref: CanonicalEventReference | null
  ): ResolvedTimeEventReference | null => {
    if (!ref) return null;
    if (ref.kind === "time_event") return resolveTimeEvent(ref, registry);
    const position = positionById.get(ref.event_id);
    return position?.kind === "exact" ? position.time_event : null;
  };
  const pointEvidence = (ref: CanonicalEventReference | null) =>
    ref?.kind === "event"
      ? (positionById.get(ref.event_id)?.source_constraint_ids ?? [])
      : [];
  const extent = (
    basis: PublicTemporalExtent["basis"],
    start: ResolvedTimeEventReference | null,
    end: ResolvedTimeEventReference | null,
    evidence: readonly string[]
  ): PublicTemporalExtent => {
    const difference =
      start && end ? calculateTemporalDifference(start, end, registry) : null;
    return {
      basis,
      kind: difference && "value" in difference ? "exact" : "unresolved",
      start,
      end,
      amount: difference && "value" in difference ? difference : null,
      evidence: unique(evidence),
      reason:
        difference && "message" in difference
          ? difference.message
          : difference
            ? null
            : "Boundary coordinates are not both known"
    };
  };
  // Reachability is a proof of authored inequality, never a fabricated date.
  const proof = (
    source: CanonicalEventReference,
    target: CanonicalEventReference,
    strict: boolean
  ): string[] | null => {
    const queue = [
      { key: endpointKey(source), strict: false, ids: [] as string[] }
    ];
    const seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]!;
      if (current.key === endpointKey(target) && (!strict || current.strict))
        return current.ids;
      const visitKey = `${current.key}:${current.strict}`;
      if (seen.has(visitKey)) continue;
      seen.add(visitKey);
      for (const edge of constraints) {
        const next =
          endpointKey(edge.source) === current.key
            ? edge.target
            : edge.type === "coincides" &&
                endpointKey(edge.target) === current.key
              ? edge.source
              : null;
        if (next)
          queue.push({
            key: endpointKey(next),
            strict: current.strict || edge.type === "precedes",
            ids: [...current.ids, edge.id]
          });
      }
    }
    return null;
  };
  const compositeItems: PublicTemporalComposite[] = composites.map((event) => {
    const boundaries = structural.filter(
      (r) => r.target.kind === "event" && r.target.event_id === event.id
    );
    const startEdge = boundaries.find((r) => r.type === "starts");
    const endEdge = boundaries.find((r) => r.type === "ends");
    const start = startEdge?.source ?? null,
      end = endEdge?.source ?? null;
    const childEdges = structural.filter(
      (r) =>
        r.type === "contains" &&
        r.source.kind === "event" &&
        r.source.event_id === event.id
    );
    const descendants = new Set<string>();
    const descendantRefs = new Map<string, CanonicalEventReference>();
    const membershipEvidence: string[] = [];
    const queue = [event.id];
    const visited = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const parent = queue[i]!;
      if (visited.has(parent)) continue;
      visited.add(parent);
      for (const edge of structural.filter(
        (r) =>
          r.type === "contains" &&
          r.source.kind === "event" &&
          r.source.event_id === parent
      )) {
        membershipEvidence.push(edge.id);
        descendantRefs.set(endpointKey(edge.target), edge.target);
        if (edge.target.kind === "event") {
          descendants.add(edge.target.event_id);
          queue.push(edge.target.event_id);
        }
      }
    }
    const coordinates: ResolvedTimeEventReference[] = [];
    const spanEvidence = [...membershipEvidence];
    let spanComplete = descendantRefs.size > 0;
    for (const ref of descendantRefs.values()) {
      const exact = point(ref);
      if (exact) {
        coordinates.push(exact);
        spanEvidence.push(...pointEvidence(ref));
        continue;
      }
      const position =
        ref.kind === "event" ? positionById.get(ref.event_id) : null;
      if (position?.kind === "bounded" && position.lower && position.upper) {
        coordinates.push(position.lower.time_event, position.upper.time_event);
        spanEvidence.push(...position.source_constraint_ids);
      } else spanComplete = false;
    }
    const first = coordinates[0];
    const sameSystem =
      first &&
      coordinates.every(
        (c) =>
          c.time_system_ref.time_system_id ===
            first.time_system_ref.time_system_id &&
          c.definition_version === first.definition_version
      );
    const adapter =
      first &&
      registry.get(
        first.time_system_ref.time_system_id,
        first.definition_version
      );
    if (sameSystem && adapter?.compare)
      coordinates.sort((a, b) => adapter.compare!(a.coordinate, b.coordinate));
    const span =
      spanComplete && sameSystem && adapter?.compare
        ? extent(
            "descendant_span",
            coordinates[0]!,
            coordinates.at(-1)!,
            spanEvidence
          )
        : extent("descendant_span", null, null, spanEvidence);
    const during =
      start && end
        ? events.flatMap((candidate) => {
            if (candidate.id === event.id || descendants.has(candidate.id))
              return [];
            const ref = { kind: "event" as const, event_id: candidate.id };
            const lower = proof(start, ref, false),
              upper = proof(ref, end, true);
            return lower && upper
              ? [
                  {
                    event_id: candidate.id,
                    membership: false as const,
                    evidence: unique([
                      ...lower,
                      ...upper,
                      ...[startEdge?.id, endEdge?.id].filter(
                        (id): id is string => !!id
                      )
                    ])
                  }
                ]
              : [];
          })
        : [];
    const startSubject =
      start?.kind === "event"
        ? subjects.find(
            (s) =>
              s.canon_id === canonId &&
              s.member_event_ids.includes(start.event_id)
          )
        : null;
    const endSubject =
      end?.kind === "event"
        ? subjects.find(
            (s) =>
              s.canon_id === canonId &&
              s.member_event_ids.includes(end.event_id)
          )
        : null;
    const sameSubject =
      startSubject &&
      endSubject &&
      startSubject.subject_handle_id === endSubject.subject_handle_id;
    return {
      event_id: event.id,
      start_ref: start,
      end_ref: end,
      duration: extent("explicit_boundaries", point(start), point(end), [
        ...[startEdge?.id, endEdge?.id].filter((id): id is string => !!id),
        ...pointEvidence(start),
        ...pointEvidence(end)
      ]),
      descendant_span: span,
      direct_children: childEdges.map((e) => e.target),
      descendant_event_ids: unique([...descendants]),
      during,
      membership_state: event.roles.includes("state:membership")
        ? {
            subject_handle_id: sameSubject
              ? startSubject.subject_handle_id
              : null,
            status: sameSubject ? "resolved" : "unresolved",
            reason: sameSubject
              ? null
              : "Boundary Events do not resolve to the same Subject"
          }
        : null
    };
  });
  const virtual = new Map(
    solved.virtual_time_events.map((ref) => [ref.id, ref])
  );
  for (const relation of structural)
    for (const ref of [relation.source, relation.target])
      if (ref.kind === "time_event") {
        const resolved = resolveTimeEvent(ref, registry);
        virtual.set(resolved.id, resolved);
      }
  const semantic = {
    projection_type: "event_relational_time" as const,
    algorithm_version: RELATIONAL_TIME_ALGORITHM_VERSION,
    solver_algorithm_version: TEMPORAL_SOLVER_VERSION,
    time_systems: systems,
    positions,
    composites: compositeItems,
    virtual_time_events: [...virtual.values()].sort((a, b) =>
      a.id.localeCompare(b.id)
    ),
    relations,
    evidence: relations.map((r) => r.id)
  };
  return {
    ...semantic,
    world_id: view.world.id,
    canon_id: canonId,
    source_revision: revision,
    semantic_digest: createHash("sha256")
      .update(stableStringify(semantic))
      .digest("hex")
  };
}
