import type {
  PublicCanon,
  PublicCanonTimeSystem,
  PublicEvent,
  PublicNarrative,
  PublicProcessContainmentEdge,
  PublicProcessDuration,
  PublicProcessProjection,
  PublicStateItem,
  PublicStateProjection,
  PublicRelation,
  PublicSearchEntry,
  PublicSubjectLineageEdge,
  PublicSubjectProjection,
  PublicTimelineProjection,
  PublicTemporalPlacement,
  PublicTimeSystem,
  PublicWorld,
  SubjectHandleRecord
} from "@moirai/contracts";
import { createHash } from "node:crypto";

export const TIMELINE_ALGORITHM_VERSION = "m4-timeline-v1";
export const SUBJECT_ALGORITHM_VERSION = "m4-subject-v1";
export const PROCESS_ALGORITHM_VERSION = "m4-process-v1";
export const STATE_ALGORITHM_VERSION = "m4-state-membership-v1";

export interface CanonicalRevisionView {
  readonly world: PublicWorld;
  readonly canons: readonly PublicCanon[];
  readonly timeSystems: readonly PublicTimeSystem[];
  readonly canonTimeSystems: readonly PublicCanonTimeSystem[];
  readonly events: readonly PublicEvent[];
  readonly temporalPlacements: readonly PublicTemporalPlacement[];
  readonly relations: readonly PublicRelation[];
  readonly narratives: readonly PublicNarrative[];
}

export interface ProjectionDocument {
  readonly key: string;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface TimelineProjectionParameters {
  readonly canonId: string;
  readonly timeSystemId: string;
}

export interface SubjectProjectionBundle {
  readonly handles: readonly SubjectHandleRecord[];
  readonly projections: readonly PublicSubjectProjection[];
}

export const STATE_RULES = Object.freeze([
  {
    state_type: "membership",
    event_role: "state:membership",
    start_patterns: ["starts"],
    end_patterns: ["ends"],
    subject_resolver: "boundary_subject",
    overlap_policy: "allow",
    algorithm_version: STATE_ALGORITHM_VERSION
  }
] as const);

export function projectStates(
  source: CanonicalRevisionView,
  sourceRevision: number,
  subjects: SubjectProjectionBundle = projectSubjects(source, sourceRevision)
): readonly PublicStateProjection[] {
  const projections: PublicStateProjection[] = [];
  const subjectByEvent = new Map<string, PublicSubjectProjection>();
  for (const subject of subjects.projections) {
    for (const eventId of subject.member_event_ids) {
      subjectByEvent.set(eventId, subject);
    }
  }

  for (const canon of [...source.canons].sort((a, b) =>
    a.id.localeCompare(b.id)
  )) {
    const events = source.events
      .filter((event) => event.canon_id === canon.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    const stateEvents = events.filter(
      (event) =>
        event.kind === "composite" &&
        event.roles.includes("state") &&
        event.roles.includes("state:membership")
    );
    const relations = source.relations
      .filter(
        (relation) =>
          relation.canon_id === canon.id && relation.direction === "directed"
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const items: PublicStateItem[] = [];

    for (const stateEvent of stateEvents) {
      const starts = relations.filter(
        (relation) =>
          relation.type === "starts" &&
          relation.target_event_id === stateEvent.id
      );
      const ends = relations.filter(
        (relation) =>
          relation.type === "ends" && relation.target_event_id === stateEvent.id
      );
      const baseDiagnostics: PublicStateItem["diagnostics"] = [
        ...(starts.length === 0
          ? [
              {
                code: "state_boundary_missing" as const,
                affected_ids: [stateEvent.id]
              }
            ]
          : []),
        ...(starts.length > 1 || ends.length > 1
          ? [
              {
                code: "state_evidence_conflict" as const,
                affected_ids: [...starts, ...ends]
                  .map((relation) => relation.id)
                  .sort()
              }
            ]
          : [])
      ];
      const startEventId =
        starts.length === 1 ? starts[0]!.source_event_id : null;
      const endEventId = ends.length === 1 ? ends[0]!.source_event_id : null;
      const startSubject = startEventId
        ? subjectByEvent.get(startEventId)
        : undefined;
      const endSubject = endEventId
        ? subjectByEvent.get(endEventId)
        : undefined;
      const subjectConflict = Boolean(
        startSubject &&
        endEventId &&
        (!endSubject ||
          endSubject.subject_handle_id !== startSubject.subject_handle_id)
      );
      const subject =
        startSubject && !subjectConflict ? startSubject : undefined;
      const subjectDiagnostics: PublicStateItem["diagnostics"] =
        startEventId && !subject
          ? [
              {
                code: subjectConflict
                  ? "state_evidence_conflict"
                  : "state_subject_unresolved",
                affected_ids: [
                  startEventId,
                  ...(endEventId ? [endEventId] : [])
                ].sort()
              }
            ]
          : [];
      const common = {
        state_event_id: stateEvent.id,
        state_type: "membership" as const,
        label: stateEvent.title,
        subject_handle_id: subject?.subject_handle_id ?? null,
        value:
          typeof stateEvent.attributes.state_value === "string"
            ? stateEvent.attributes.state_value
            : null,
        start_event_id: startEventId,
        end_event_id: endEventId,
        open_ended: ends.length === 0
      };
      const boundaryEvidence = [
        stateEvent.id,
        ...(startEventId ? [startEventId] : []),
        ...(endEventId ? [endEventId] : []),
        ...starts.map((relation) => relation.id),
        ...ends.map((relation) => relation.id),
        ...(subject?.identity_relation_ids ?? [])
      ];
      const startPlacements = startEventId
        ? source.temporalPlacements.filter(
            (placement) => placement.event_id === startEventId
          )
        : [];
      const timeSystemIds = [
        ...new Set(startPlacements.map((placement) => placement.time_system_id))
      ].sort();
      if (
        baseDiagnostics.length > 0 ||
        subjectDiagnostics.length > 0 ||
        timeSystemIds.length === 0
      ) {
        const diagnostics: PublicStateItem["diagnostics"] = [
          ...baseDiagnostics,
          ...subjectDiagnostics,
          ...(timeSystemIds.length === 0 &&
          baseDiagnostics.length === 0 &&
          subjectDiagnostics.length === 0
            ? [
                {
                  code: "state_time_unresolved" as const,
                  affected_ids: [
                    stateEvent.id,
                    ...(startEventId ? [startEventId] : [])
                  ].sort()
                }
              ]
            : [])
        ];
        items.push({
          ...common,
          time_system_id: null,
          start_earliest: null,
          start_latest: null,
          end_earliest: null,
          end_latest: null,
          duration: null,
          certainty: "unresolved",
          evidence_ids: [...new Set(boundaryEvidence)].sort(),
          diagnostics,
          completeness: "unresolved"
        });
        continue;
      }

      for (const timeSystemId of timeSystemIds) {
        const startAt = startPlacements.filter(
          (p) => p.time_system_id === timeSystemId
        );
        const endAt = endEventId
          ? source.temporalPlacements.filter(
              (p) =>
                p.event_id === endEventId && p.time_system_id === timeSystemId
            )
          : [];
        const reversed =
          startAt.length === 1 &&
          endAt.length === 1 &&
          (endAt[0]!.latest_end ?? endAt[0]!.latest_start).value <
            startAt[0]!.earliest_start.value;
        const conflict =
          startAt.length !== 1 ||
          (endEventId !== null && endAt.length !== 1) ||
          reversed;
        if (conflict) {
          const diagnostics = [
            {
              code: "state_evidence_conflict" as const,
              affected_ids: [...startAt, ...endAt].map((p) => p.id).sort()
            }
          ];
          items.push({
            ...common,
            time_system_id: timeSystemId,
            start_earliest: null,
            start_latest: null,
            end_earliest: null,
            end_latest: null,
            duration: null,
            certainty: "unresolved",
            evidence_ids: [
              ...boundaryEvidence,
              ...diagnostics[0]!.affected_ids
            ].sort(),
            diagnostics,
            completeness: "unresolved"
          });
          continue;
        }
        const start = startAt[0]!;
        const end = endAt[0];
        const endEarliest = end
          ? (end.earliest_end ?? end.earliest_start).value
          : null;
        const endLatest = end
          ? (end.latest_end ?? end.latest_start).value
          : null;
        const minimum = end
          ? Math.max(0, endEarliest! - start.latest_start.value)
          : null;
        const maximum = end
          ? Math.max(0, endLatest! - start.earliest_start.value)
          : null;
        const exact =
          start.certainty === "exact" &&
          (!end || end.certainty === "exact") &&
          start.earliest_start.value === start.latest_start.value &&
          (!end || (endEarliest === endLatest && minimum === maximum));
        const evidenceIds = [
          ...boundaryEvidence,
          start.id,
          ...(end ? [end.id] : [])
        ];
        items.push({
          ...common,
          time_system_id: timeSystemId,
          start_earliest: start.earliest_start.value,
          start_latest: start.latest_start.value,
          end_earliest: endEarliest,
          end_latest: endLatest,
          duration:
            end && minimum !== null && maximum !== null
              ? {
                  minimum,
                  maximum,
                  kind: exact ? "exact" : "range",
                  precision:
                    start.precision === end.precision
                      ? start.precision
                      : "mixed",
                  evidence_ids: [start.id, end.id].sort()
                }
              : null,
          certainty: exact ? "exact" : "range",
          evidence_ids: [...new Set(evidenceIds)].sort(),
          diagnostics: [],
          completeness: "complete"
        });
      }
    }
    const diagnostics = items.flatMap((item) => item.diagnostics);
    const semantic = {
      world_id: source.world.id,
      source_revision: sourceRevision,
      projection_type: "state" as const,
      algorithm_version: STATE_ALGORITHM_VERSION,
      parameters_digest: digest({ canon_id: canon.id, rules: STATE_RULES }),
      canon_id: canon.id,
      rules: STATE_RULES,
      items: items.sort(
        (a, b) =>
          a.state_event_id.localeCompare(b.state_event_id) ||
          (a.time_system_id ?? "").localeCompare(b.time_system_id ?? "")
      ),
      evidence: [...new Set(items.flatMap((item) => item.evidence_ids))].sort(),
      diagnostics,
      completeness:
        diagnostics.length === 0 ? ("complete" as const) : ("partial" as const)
    };
    projections.push({ ...semantic, semantic_digest: digest(semantic) });
  }
  return projections;
}

export function projectProcesses(
  source: CanonicalRevisionView,
  sourceRevision: number
): readonly PublicProcessProjection[] {
  const projections: PublicProcessProjection[] = [];
  for (const canon of [...source.canons].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    const events = source.events
      .filter((event) => event.canon_id === canon.id)
      .sort((left, right) => left.id.localeCompare(right.id));
    const eventIds = new Set(events.map((event) => event.id));
    const relations = source.relations
      .filter(
        (relation) =>
          relation.canon_id === canon.id &&
          eventIds.has(relation.source_event_id) &&
          eventIds.has(relation.target_event_id)
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    const contains = relations.filter(
      (relation) => relation.type === "contains"
    );
    const childrenByParent = new Map<string, PublicRelation[]>();
    for (const relation of contains) {
      const children = childrenByParent.get(relation.source_event_id) ?? [];
      children.push(relation);
      childrenByParent.set(relation.source_event_id, children);
    }
    for (const children of childrenByParent.values()) {
      children.sort(
        (left, right) =>
          left.target_event_id.localeCompare(right.target_event_id) ||
          left.id.localeCompare(right.id)
      );
    }

    for (const process of events.filter(
      (event) => event.kind === "composite" && event.roles.includes("process")
    )) {
      const directRelations = childrenByParent.get(process.id) ?? [];
      const descendants = new Set<string>();
      const containmentByRelation = new Map<
        string,
        PublicProcessContainmentEdge
      >();
      const cycleIds = new Set<string>();
      const cycleVisitState = new Map<string, "visiting" | "done">();
      const visitForCycles = (parentId: string): void => {
        cycleVisitState.set(parentId, "visiting");
        for (const relation of childrenByParent.get(parentId) ?? []) {
          const childId = relation.target_event_id;
          const state = cycleVisitState.get(childId);
          if (state === "visiting") {
            cycleIds.add(parentId);
            cycleIds.add(childId);
            continue;
          }
          if (state !== "done") visitForCycles(childId);
        }
        cycleVisitState.set(parentId, "done");
      };
      visitForCycles(process.id);

      const shortestDepth = new Map<string, number>([[process.id, 0]]);
      const pending = [process.id];
      while (pending.length > 0) {
        const parentId = pending.shift()!;
        const parentDepth = shortestDepth.get(parentId)!;
        for (const relation of childrenByParent.get(parentId) ?? []) {
          const childId = relation.target_event_id;
          const depth = parentDepth + 1;
          const previousEdge = containmentByRelation.get(relation.id);
          if (!previousEdge || depth < previousEdge.depth) {
            containmentByRelation.set(relation.id, {
              relation_id: relation.id,
              parent_event_id: parentId,
              child_event_id: childId,
              depth
            });
          }
          if (childId === process.id) continue;
          descendants.add(childId);
          const previousDepth = shortestDepth.get(childId);
          if (previousDepth === undefined || depth < previousDepth) {
            shortestDepth.set(childId, depth);
            pending.push(childId);
          }
        }
      }
      descendants.delete(process.id);
      const descendantIds = [...descendants].sort();
      const descendantSet = new Set(descendantIds);
      const boundaryCandidate = (type: "starts" | "ends"): string[] =>
        [
          ...new Set(
            relations
              .filter(
                (relation) =>
                  relation.type === type &&
                  ((relation.source_event_id === process.id &&
                    descendantSet.has(relation.target_event_id)) ||
                    (relation.target_event_id === process.id &&
                      descendantSet.has(relation.source_event_id)))
              )
              .map((relation) =>
                relation.source_event_id === process.id
                  ? relation.target_event_id
                  : relation.source_event_id
              )
          )
        ].sort();
      const precedence = relations.filter(
        (relation) =>
          relation.type === "precedes" &&
          descendantSet.has(relation.source_event_id) &&
          descendantSet.has(relation.target_event_id)
      );
      const explicitStarts = boundaryCandidate("starts");
      const explicitEnds = boundaryCandidate("ends");
      const startEventIds =
        explicitStarts.length > 0
          ? explicitStarts
          : descendantIds.filter(
              (eventId) =>
                !precedence.some(
                  (relation) => relation.target_event_id === eventId
                )
            );
      const endEventIds =
        explicitEnds.length > 0
          ? explicitEnds
          : descendantIds.filter(
              (eventId) =>
                !precedence.some(
                  (relation) => relation.source_event_id === eventId
                )
            );
      const internalRelations = relations.filter(
        (relation) =>
          relation.type !== "contains" &&
          descendantSet.has(relation.source_event_id) &&
          descendantSet.has(relation.target_event_id)
      );
      const durations: PublicProcessDuration[] = [];
      for (const timeSystem of source.timeSystems
        .filter((item) =>
          source.canonTimeSystems.some(
            (link) =>
              link.canon_id === canon.id && link.time_system_id === item.id
          )
        )
        .sort((left, right) => left.id.localeCompare(right.id))) {
        const placements = source.temporalPlacements
          .filter(
            (placement) =>
              placement.time_system_id === timeSystem.id &&
              descendantSet.has(placement.event_id)
          )
          .sort((left, right) => left.id.localeCompare(right.id));
        const placedEvents = new Set(placements.map((item) => item.event_id));
        const hasInterval = placements.some(
          (item) => item.earliest_end !== null && item.latest_end !== null
        );
        if (
          placements.length === 0 ||
          (!hasInterval && placedEvents.size < 2)
        ) {
          continue;
        }
        const startEarliest = Math.min(
          ...placements.map((item) => item.earliest_start.value)
        );
        const startLatest = Math.min(
          ...placements.map((item) => item.latest_start.value)
        );
        const endEarliest = Math.max(
          ...placements.map(
            (item) => item.earliest_end?.value ?? item.earliest_start.value
          )
        );
        const endLatest = Math.max(
          ...placements.map(
            (item) => item.latest_end?.value ?? item.latest_start.value
          )
        );
        const minimum = Math.max(0, endEarliest - startLatest);
        const maximum = Math.max(0, endLatest - startEarliest);
        const precisions = [
          ...new Set(placements.map((item) => item.precision))
        ];
        durations.push({
          time_system_id: timeSystem.id,
          start_earliest: startEarliest,
          start_latest: startLatest,
          end_earliest: endEarliest,
          end_latest: endLatest,
          minimum,
          maximum,
          kind:
            minimum === maximum &&
            placements.every((item) => item.certainty === "exact")
              ? "exact"
              : "range",
          precision: precisions.length === 1 ? precisions[0]! : "mixed",
          evidence_ids: placements.map((item) => item.id)
        });
      }
      const narratives = source.narratives
        .filter(
          (narrative) =>
            narrative.scope_type === "event" &&
            narrative.scope_id === process.id
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      const diagnostics: PublicProcessProjection["diagnostics"] = [
        ...(directRelations.length === 0
          ? [{ code: "empty_process" as const, affected_ids: [process.id] }]
          : []),
        ...(cycleIds.size > 0
          ? [
              {
                code: "process_containment_cycle" as const,
                affected_ids: [...cycleIds].sort()
              }
            ]
          : []),
        ...(durations.length === 0
          ? [
              {
                code: "process_duration_unresolved" as const,
                affected_ids: [process.id, ...descendantIds]
              }
            ]
          : [])
      ];
      const containment = [...containmentByRelation.values()].sort(
        (left, right) =>
          left.depth - right.depth ||
          left.relation_id.localeCompare(right.relation_id)
      );
      const evidence = [
        process.id,
        ...containment.map((item) => item.relation_id),
        ...internalRelations.map((item) => item.id),
        ...durations.flatMap((item) => item.evidence_ids),
        ...narratives.map((item) => item.id)
      ]
        .filter((id, index, values) => values.indexOf(id) === index)
        .sort();
      const semantic = {
        world_id: source.world.id,
        source_revision: sourceRevision,
        projection_type: "process" as const,
        algorithm_version: PROCESS_ALGORITHM_VERSION,
        parameters_digest: digest({
          canon_id: canon.id,
          process_event_id: process.id
        }),
        canon_id: canon.id,
        process_event_id: process.id,
        label: process.title,
        direct_child_event_ids: directRelations
          .map((relation) => relation.target_event_id)
          .sort(),
        descendant_event_ids: descendantIds,
        containment,
        start_event_ids: startEventIds,
        end_event_ids: endEventIds,
        internal_relation_ids: internalRelations.map((item) => item.id),
        narrative_ids: narratives.map((item) => item.id),
        durations,
        evidence,
        diagnostics,
        completeness:
          diagnostics.length === 0
            ? ("complete" as const)
            : ("partial" as const)
      };
      projections.push({ ...semantic, semantic_digest: digest(semantic) });
    }
  }
  return projections.sort((left, right) =>
    left.process_event_id.localeCompare(right.process_event_id)
  );
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function stronglyConnectedComponents(
  eventIds: readonly string[],
  relations: readonly PublicRelation[]
): readonly (readonly string[])[] {
  const adjacency = new Map(eventIds.map((id) => [id, [] as string[]]));
  for (const relation of relations) {
    adjacency.get(relation.source_event_id)?.push(relation.target_event_id);
  }
  for (const targets of adjacency.values()) targets.sort();

  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const inStack = new Set<string>();
  const components: string[][] = [];

  const visit = (eventId: string): void => {
    const index = nextIndex++;
    indices.set(eventId, index);
    lowLinks.set(eventId, index);
    stack.push(eventId);
    inStack.add(eventId);

    for (const targetId of adjacency.get(eventId) ?? []) {
      if (!indices.has(targetId)) {
        visit(targetId);
        lowLinks.set(
          eventId,
          Math.min(lowLinks.get(eventId)!, lowLinks.get(targetId)!)
        );
      } else if (inStack.has(targetId)) {
        lowLinks.set(
          eventId,
          Math.min(lowLinks.get(eventId)!, indices.get(targetId)!)
        );
      }
    }

    if (lowLinks.get(eventId) !== indices.get(eventId)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop()!;
      inStack.delete(member);
      component.push(member);
      if (member === eventId) break;
    }
    components.push(component.sort());
  };

  for (const eventId of [...eventIds].sort()) {
    if (!indices.has(eventId)) visit(eventId);
  }
  return components.sort((left, right) => left[0]!.localeCompare(right[0]!));
}

function structuralRanks(
  components: readonly (readonly string[])[],
  relations: readonly PublicRelation[]
): ReadonlyMap<string, number> {
  const componentByEvent = new Map<string, number>();
  components.forEach((component, index) => {
    for (const eventId of component) componentByEvent.set(eventId, index);
  });
  const outgoing = new Map<number, Set<number>>();
  const incoming = new Map<number, Set<number>>();
  components.forEach((_, index) => {
    outgoing.set(index, new Set());
    incoming.set(index, new Set());
  });
  for (const relation of relations) {
    const source = componentByEvent.get(relation.source_event_id)!;
    const target = componentByEvent.get(relation.target_event_id)!;
    if (source === target) continue;
    outgoing.get(source)!.add(target);
    incoming.get(target)!.add(source);
  }
  const remainingIncoming = new Map(
    [...incoming].map(([index, sources]) => [index, new Set(sources)])
  );
  const rank = new Map<number, number>();
  const ready = components
    .map((_, index) => index)
    .filter((index) => remainingIncoming.get(index)!.size === 0)
    .sort((left, right) =>
      components[left]![0]!.localeCompare(components[right]![0]!)
    );
  while (ready.length > 0) {
    const current = ready.shift()!;
    const predecessors = [...incoming.get(current)!];
    rank.set(
      current,
      predecessors.length === 0
        ? 0
        : Math.max(...predecessors.map((item) => rank.get(item) ?? 0)) + 1
    );
    for (const target of [...outgoing.get(current)!].sort((left, right) =>
      components[left]![0]!.localeCompare(components[right]![0]!)
    )) {
      remainingIncoming.get(target)!.delete(current);
      if (remainingIncoming.get(target)!.size === 0) {
        ready.push(target);
        ready.sort((left, right) =>
          components[left]![0]!.localeCompare(components[right]![0]!)
        );
      }
    }
  }
  return new Map(
    [...componentByEvent].map(([eventId, component]) => [
      eventId,
      rank.get(component) ?? 0
    ])
  );
}

export function projectTimeline(
  source: CanonicalRevisionView,
  sourceRevision: number,
  parameters: TimelineProjectionParameters
): PublicTimelineProjection {
  const canon = source.canons.find((item) => item.id === parameters.canonId);
  const timeSystem = source.timeSystems.find(
    (item) => item.id === parameters.timeSystemId
  );
  const linked = source.canonTimeSystems.some(
    (item) =>
      item.canon_id === parameters.canonId &&
      item.time_system_id === parameters.timeSystemId
  );
  if (!canon || !timeSystem || !linked || canon.world_id !== source.world.id) {
    throw new Error("timeline_projection_scope_invalid");
  }

  const events = sorted(
    source.events.filter((event) => event.canon_id === parameters.canonId)
  );
  const eventIds = new Set(events.map((event) => event.id));
  const precedence = sorted(
    source.relations.filter(
      (relation) =>
        relation.canon_id === parameters.canonId &&
        relation.type === "precedes" &&
        eventIds.has(relation.source_event_id) &&
        eventIds.has(relation.target_event_id)
    )
  );
  const placements = sorted(
    source.temporalPlacements.filter(
      (placement) =>
        placement.time_system_id === parameters.timeSystemId &&
        eventIds.has(placement.event_id)
    )
  );
  const placementsByEvent = new Map<string, PublicTemporalPlacement[]>();
  for (const placement of placements) {
    const current = placementsByEvent.get(placement.event_id) ?? [];
    current.push(placement);
    placementsByEvent.set(placement.event_id, current);
  }

  const authored = events
    .flatMap((event) => {
      const values = placementsByEvent.get(event.id) ?? [];
      if (values.length === 0) return [];
      return [
        {
          event,
          placements: values,
          start: Math.min(...values.map((item) => item.earliest_start.value)),
          end: Math.max(...values.map((item) => item.latest_start.value))
        }
      ];
    })
    .sort(
      (left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.event.id.localeCompare(right.event.id)
    );
  const authoredGroup = new Map<string, number>();
  let group = -1;
  let groupEnd = Number.NEGATIVE_INFINITY;
  for (const item of authored) {
    if (item.start > groupEnd) group += 1;
    authoredGroup.set(item.event.id, group);
    groupEnd = Math.max(groupEnd, item.end);
  }

  const components = stronglyConnectedComponents(
    events.map((event) => event.id),
    precedence
  );
  const ranks = structuralRanks(components, precedence);
  const structurallyConnected = new Set(
    precedence.flatMap((relation) => [
      relation.source_event_id,
      relation.target_event_id
    ])
  );
  const cycleComponents = components.filter(
    (component) =>
      component.length > 1 ||
      precedence.some(
        (relation) =>
          relation.source_event_id === component[0] &&
          relation.target_event_id === component[0]
      )
  );
  const unplacedIds = events
    .filter(
      (event) =>
        !placementsByEvent.has(event.id) && !structurallyConnected.has(event.id)
    )
    .map((event) => event.id);
  const items = events
    .map((event) => {
      const eventPlacements = placementsByEvent.get(event.id) ?? [];
      const eventRelations = precedence.filter(
        (relation) =>
          relation.source_event_id === event.id ||
          relation.target_event_id === event.id
      );
      if (eventPlacements.length > 0) {
        const rangeStart = Math.min(
          ...eventPlacements.map((item) => item.earliest_start.value)
        );
        const rangeEnd = Math.max(
          ...eventPlacements.map((item) => item.latest_start.value)
        );
        const certainty = eventPlacements.reduce<
          PublicTemporalPlacement["certainty"]
        >((leastCertain, placement) => {
          const certaintyRank = { exact: 0, approximate: 1, uncertain: 2 };
          return certaintyRank[placement.certainty] >
            certaintyRank[leastCertain]
            ? placement.certainty
            : leastCertain;
        }, "exact");
        return {
          event_id: event.id,
          placement_kind: "authored_coordinate" as const,
          range_start: rangeStart,
          range_end: rangeEnd,
          structural_rank: ranks.get(event.id) ?? null,
          unordered_group: `authored:${authoredGroup.get(event.id)}`,
          display_label:
            eventPlacements.length === 1
              ? eventPlacements[0]!.display_label
              : null,
          certainty,
          evidence_ids: [
            ...eventPlacements.map((item) => item.id),
            ...eventRelations.map((item) => item.id)
          ].sort()
        };
      }
      if (structurallyConnected.has(event.id)) {
        const rank = ranks.get(event.id) ?? 0;
        return {
          event_id: event.id,
          placement_kind: "structural_order" as const,
          range_start: null,
          range_end: null,
          structural_rank: rank,
          unordered_group: `structural:${rank}`,
          display_label: null,
          certainty: null,
          evidence_ids: eventRelations.map((item) => item.id).sort()
        };
      }
      return {
        event_id: event.id,
        placement_kind: "unplaced" as const,
        range_start: null,
        range_end: null,
        structural_rank: null,
        unordered_group: "unplaced",
        display_label: null,
        certainty: null,
        evidence_ids: []
      };
    })
    .sort((left, right) => {
      const kindOrder = {
        authored_coordinate: 0,
        structural_order: 1,
        unplaced: 2
      } as const;
      return (
        kindOrder[left.placement_kind] - kindOrder[right.placement_kind] ||
        (left.range_start ?? left.structural_rank ?? 0) -
          (right.range_start ?? right.structural_rank ?? 0) ||
        left.event_id.localeCompare(right.event_id)
      );
    });
  const diagnostics = [
    ...cycleComponents.map((component) => ({
      code: "timeline_cycle" as const,
      affected_ids: component
    })),
    ...(unplacedIds.length > 0
      ? [
          {
            code: "timeline_unplaced" as const,
            affected_ids: unplacedIds
          }
        ]
      : [])
  ];
  const semantic = {
    world_id: source.world.id,
    source_revision: sourceRevision,
    projection_type: "timeline" as const,
    algorithm_version: TIMELINE_ALGORITHM_VERSION,
    parameters_digest: digest({
      canon_id: parameters.canonId,
      time_system_id: parameters.timeSystemId
    }),
    canon_id: parameters.canonId,
    time_system_id: parameters.timeSystemId,
    items,
    evidence: [
      ...placements.map((item) => item.id),
      ...precedence.map((item) => item.id)
    ].sort(),
    diagnostics,
    completeness:
      diagnostics.length === 0 ? ("complete" as const) : ("partial" as const)
  };
  return { ...semantic, semantic_digest: digest(semantic) };
}

const EQUIVALENCE_RELATION_TYPES = new Set<PublicRelation["type"]>([
  "identity_continues",
  "identity_instance_of"
]);
const LINEAGE_RELATION_TYPES = new Set<PublicRelation["type"]>([
  "identity_splits",
  "identity_merges"
]);

function deterministicSubjectHandleId(
  worldId: string,
  canonId: string,
  anchorEventId: string
): string {
  const value = createHash("sha256")
    .update(`moirai-subject:${worldId}:${canonId}:${anchorEventId}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  value[12] = "5";
  value[16] = ((Number.parseInt(value[16]!, 16) & 0x3) | 0x8).toString(16);
  const compact = value.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function subjectComponents(
  events: readonly PublicEvent[],
  equivalence: readonly PublicRelation[]
): readonly (readonly string[])[] {
  const parent = new Map(events.map((event) => [event.id, event.id]));
  const find = (id: string): string => {
    const current = parent.get(id)!;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const join = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    parent.set(second!, first!);
  };
  for (const relation of equivalence) {
    if (
      parent.has(relation.source_event_id) &&
      parent.has(relation.target_event_id)
    ) {
      join(relation.source_event_id, relation.target_event_id);
    }
  }
  const components = new Map<string, string[]>();
  for (const event of events) {
    const root = find(event.id);
    const members = components.get(root) ?? [];
    members.push(event.id);
    components.set(root, members);
  }
  return [...components.values()]
    .map((members) => members.sort())
    .sort((left, right) => left[0]!.localeCompare(right[0]!));
}

export function projectSubjects(
  source: CanonicalRevisionView,
  sourceRevision: number,
  previousHandles: readonly SubjectHandleRecord[] = []
): SubjectProjectionBundle {
  const allHandles: SubjectHandleRecord[] = [];
  const allProjections: PublicSubjectProjection[] = [];

  for (const canon of sorted(source.canons)) {
    const events = sorted(
      source.events.filter((event) => event.canon_id === canon.id)
    );
    const eventIds = new Set(events.map((event) => event.id));
    const identityRelations = sorted(
      source.relations.filter(
        (relation) =>
          relation.canon_id === canon.id &&
          (EQUIVALENCE_RELATION_TYPES.has(relation.type) ||
            LINEAGE_RELATION_TYPES.has(relation.type)) &&
          eventIds.has(relation.source_event_id) &&
          eventIds.has(relation.target_event_id)
      )
    );
    const equivalence = identityRelations.filter((relation) =>
      EQUIVALENCE_RELATION_TYPES.has(relation.type)
    );
    const lineage = identityRelations.filter((relation) =>
      LINEAGE_RELATION_TYPES.has(relation.type)
    );
    const previous = previousHandles.filter(
      (handle) => handle.canon_id === canon.id
    );
    const previousMemberIds = new Set(
      previous.flatMap((handle) => handle.member_event_ids)
    );
    const identityEventIds = new Set(
      identityRelations.flatMap((relation) => [
        relation.source_event_id,
        relation.target_event_id
      ])
    );
    const components = subjectComponents(events, equivalence).filter(
      (component) =>
        component.some((id) => identityEventIds.has(id)) ||
        component.some((id) => previousMemberIds.has(id))
    );
    const componentIndexByEvent = new Map<string, number>();
    components.forEach((component, index) => {
      for (const eventId of component)
        componentIndexByEvent.set(eventId, index);
    });

    const preferredComponent = new Map<string, number>();
    for (const handle of previous.filter(
      (item) => item.status !== "redirected"
    )) {
      const anchored = componentIndexByEvent.get(handle.anchor_event_id);
      if (anchored !== undefined) {
        preferredComponent.set(handle.id, anchored);
        continue;
      }
      const overlaps = components
        .map((component, index) => ({
          index,
          count: component.filter((id) => handle.member_event_ids.includes(id))
            .length,
          first: component[0]!
        }))
        .filter((item) => item.count > 0)
        .sort(
          (left, right) =>
            right.count - left.count || left.first.localeCompare(right.first)
        );
      if (overlaps[0]) preferredComponent.set(handle.id, overlaps[0].index);
    }

    const handleByComponent = new Map<number, SubjectHandleRecord>();
    const redirected = new Map<string, SubjectHandleRecord>();
    components.forEach((component, index) => {
      const candidates = previous
        .filter(
          (handle) =>
            handle.status !== "redirected" &&
            preferredComponent.get(handle.id) === index
        )
        .sort(
          (left, right) =>
            left.created_revision - right.created_revision ||
            left.id.localeCompare(right.id)
        );
      const winner = candidates[0];
      const anchorEventId =
        winner && component.includes(winner.anchor_event_id)
          ? winner.anchor_event_id
          : component[0]!;
      const active: SubjectHandleRecord = winner
        ? {
            ...winner,
            anchor_event_id: anchorEventId,
            status: "active",
            redirect_to: null,
            projection_revision: sourceRevision,
            member_event_ids: component
          }
        : {
            id: deterministicSubjectHandleId(
              source.world.id,
              canon.id,
              anchorEventId
            ),
            canon_id: canon.id,
            anchor_event_id: anchorEventId,
            status: "active",
            redirect_to: null,
            created_revision: sourceRevision,
            projection_revision: sourceRevision,
            member_event_ids: component
          };
      handleByComponent.set(index, active);
      for (const loser of candidates.slice(1)) {
        redirected.set(loser.id, {
          ...loser,
          status: "redirected",
          redirect_to: active.id,
          projection_revision: sourceRevision,
          member_event_ids: []
        });
      }
    });

    const assignedIds = new Set([
      ...[...handleByComponent.values()].map((handle) => handle.id),
      ...redirected.keys()
    ]);
    for (const handle of previous) {
      if (assignedIds.has(handle.id)) continue;
      if (handle.status === "redirected") {
        redirected.set(handle.id, handle);
      } else {
        redirected.set(handle.id, {
          ...handle,
          status: "unresolved",
          redirect_to: null,
          projection_revision: sourceRevision,
          member_event_ids: []
        });
      }
    }

    const activeHandles = [...handleByComponent.values()];
    const handleByEvent = new Map<string, SubjectHandleRecord>();
    for (const handle of activeHandles) {
      for (const eventId of handle.member_event_ids)
        handleByEvent.set(eventId, handle);
    }
    const lineageEdges = lineage.flatMap((relation) => {
      const sourceHandle = handleByEvent.get(relation.source_event_id);
      const targetHandle = handleByEvent.get(relation.target_event_id);
      if (!sourceHandle || !targetHandle || sourceHandle.id === targetHandle.id)
        return [];
      return [
        {
          relation_id: relation.id,
          type: relation.type as PublicSubjectLineageEdge["type"],
          source_subject_handle_id: sourceHandle.id,
          target_subject_handle_id: targetHandle.id
        }
      ];
    });

    for (const handle of activeHandles) {
      const members = new Set(handle.member_event_ids);
      const anchor = events.find(
        (event) => event.id === handle.anchor_event_id
      )!;
      const componentEquivalence = equivalence.filter(
        (relation) =>
          members.has(relation.source_event_id) &&
          members.has(relation.target_event_id)
      );
      const memberNarratives = sorted(
        source.narratives.filter(
          (narrative) =>
            narrative.canon_id === canon.id &&
            narrative.scope_type === "event" &&
            members.has(narrative.scope_id)
        )
      );
      const placements = sorted(
        source.temporalPlacements.filter((placement) =>
          members.has(placement.event_id)
        )
      );
      const placementsByTime = new Map<string, PublicTemporalPlacement[]>();
      for (const placement of placements) {
        const values = placementsByTime.get(placement.time_system_id) ?? [];
        values.push(placement);
        placementsByTime.set(placement.time_system_id, values);
      }
      const timeRanges = [...placementsByTime]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([timeSystemId, values]) => ({
          time_system_id: timeSystemId,
          earliest: Math.min(
            ...values.map((item) => item.earliest_start.value)
          ),
          latest: Math.max(
            ...values.map(
              (item) => item.latest_end?.value ?? item.latest_start.value
            )
          ),
          evidence_ids: values.map((item) => item.id).sort()
        }));
      const incoming = lineageEdges
        .filter((edge) => edge.target_subject_handle_id === handle.id)
        .sort((left, right) =>
          left.relation_id.localeCompare(right.relation_id)
        );
      const outgoing = lineageEdges
        .filter((edge) => edge.source_subject_handle_id === handle.id)
        .sort((left, right) =>
          left.relation_id.localeCompare(right.relation_id)
        );
      const evidence = [
        ...handle.member_event_ids,
        ...componentEquivalence.map((relation) => relation.id),
        ...incoming.map((edge) => edge.relation_id),
        ...outgoing.map((edge) => edge.relation_id),
        ...memberNarratives.map((narrative) => narrative.id),
        ...placements.map((placement) => placement.id)
      ]
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort();
      const semantic = {
        world_id: source.world.id,
        source_revision: sourceRevision,
        projection_type: "subject" as const,
        algorithm_version: SUBJECT_ALGORITHM_VERSION,
        parameters_digest: digest({ canon_id: canon.id }),
        canon_id: canon.id,
        subject_handle_id: handle.id,
        anchor_event_id: handle.anchor_event_id,
        label: anchor.title,
        label_evidence_event_id: anchor.id,
        member_event_ids: handle.member_event_ids,
        identity_relation_ids: componentEquivalence.map(
          (relation) => relation.id
        ),
        instance_relation_ids: componentEquivalence
          .filter((relation) => relation.type === "identity_instance_of")
          .map((relation) => relation.id),
        lineage: { incoming, outgoing },
        narrative_ids: memberNarratives.map((narrative) => narrative.id),
        time_ranges: timeRanges,
        evidence,
        diagnostics: [],
        completeness: "complete" as const
      };
      allProjections.push({ ...semantic, semantic_digest: digest(semantic) });
    }
    allHandles.push(...activeHandles, ...redirected.values());
  }

  return {
    handles: [...allHandles].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    projections: [...allProjections].sort((left, right) =>
      left.subject_handle_id.localeCompare(right.subject_handle_id)
    )
  };
}

function sorted<T extends { readonly id: string }>(
  items: readonly T[]
): readonly T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function allowlistView(view: CanonicalRevisionView): CanonicalRevisionView {
  return {
    world: {
      id: view.world.id,
      slug: view.world.slug,
      title: view.world.title,
      description: view.world.description
    },
    canons: view.canons.map((item) => ({
      id: item.id,
      world_id: item.world_id,
      slug: item.slug,
      title: item.title,
      description: item.description
    })),
    timeSystems: view.timeSystems.map((item) => ({
      id: item.id,
      world_id: item.world_id,
      slug: item.slug,
      title: item.title,
      kind: item.kind,
      definition_version: item.definition_version,
      definition: item.definition
    })),
    canonTimeSystems: view.canonTimeSystems.map((item) => ({
      id: item.id,
      canon_id: item.canon_id,
      time_system_id: item.time_system_id
    })),
    events: view.events.map((item) => ({
      id: item.id,
      canon_id: item.canon_id,
      slug: item.slug,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      roles: item.roles,
      attributes: item.attributes
    })),
    temporalPlacements: view.temporalPlacements.map((item) => ({
      id: item.id,
      event_id: item.event_id,
      time_system_id: item.time_system_id,
      kind: item.kind,
      earliest_start: item.earliest_start,
      latest_start: item.latest_start,
      earliest_end: item.earliest_end,
      latest_end: item.latest_end,
      precision: item.precision,
      certainty: item.certainty,
      display_label: item.display_label
    })),
    relations: view.relations.map((item) => ({
      id: item.id,
      canon_id: item.canon_id,
      type: item.type,
      source_event_id: item.source_event_id,
      target_event_id: item.target_event_id,
      direction: item.direction,
      attributes: item.attributes
    })),
    narratives: view.narratives.map((item) => ({
      id: item.id,
      canon_id: item.canon_id,
      scope_type: item.scope_type,
      scope_id: item.scope_id,
      locale: item.locale,
      kind: item.kind,
      title: item.title,
      body: item.body,
      public_references: item.public_references.map((reference) => ({
        label: reference.label,
        url: reference.url
      }))
    }))
  };
}

function narrativeText(
  narratives: readonly PublicNarrative[],
  scopeType: PublicNarrative["scope_type"],
  scopeId: string
): string {
  return narratives
    .filter(
      (item) => item.scope_type === scopeType && item.scope_id === scopeId
    )
    .flatMap((item) => [
      item.title ?? "",
      item.body,
      ...item.public_references.flatMap((reference) => [
        reference.label,
        reference.url
      ])
    ])
    .join(" ")
    .trim();
}

function searchEntries(
  view: CanonicalRevisionView,
  revision: number,
  subjects: readonly PublicSubjectProjection[] = []
): readonly PublicSearchEntry[] {
  const worldEntry: PublicSearchEntry = {
    target_id: view.world.id,
    target_type: "world",
    canonical_url: `/worlds/${view.world.id}`,
    world_id: view.world.id,
    canon_id: null,
    title: view.world.title,
    text: [view.world.title, view.world.description ?? ""].join(" ").trim(),
    served_revision: revision
  };
  const canonEntries = sorted(view.canons).map((canon): PublicSearchEntry => ({
    target_id: canon.id,
    target_type: "canon",
    canonical_url: `/worlds/${view.world.id}/canons/${canon.id}`,
    world_id: view.world.id,
    canon_id: canon.id,
    title: canon.title,
    text: [
      canon.title,
      canon.description ?? "",
      narrativeText(view.narratives, "canon", canon.id)
    ]
      .join(" ")
      .trim(),
    served_revision: revision
  }));
  const eventEntries = sorted(view.events).map((event): PublicSearchEntry => ({
    target_id: event.id,
    target_type:
      event.kind === "composite" && event.roles.includes("process")
        ? "process"
        : "event",
    canonical_url: `/worlds/${view.world.id}/canons/${event.canon_id}/events/${event.id}`,
    world_id: view.world.id,
    canon_id: event.canon_id,
    title: event.title,
    text: [
      event.title,
      event.summary ?? "",
      narrativeText(view.narratives, "event", event.id)
    ]
      .join(" ")
      .trim(),
    served_revision: revision
  }));
  const subjectEntries = [...subjects]
    .sort((left, right) =>
      left.subject_handle_id.localeCompare(right.subject_handle_id)
    )
    .map((subject): PublicSearchEntry => ({
      target_id: subject.subject_handle_id,
      target_type: "subject",
      canonical_url: `/worlds/${view.world.id}/canons/${subject.canon_id}/subjects/${subject.subject_handle_id}`,
      world_id: view.world.id,
      canon_id: subject.canon_id,
      title: subject.label,
      text: [
        subject.label,
        ...subject.member_event_ids.map(
          (eventId) =>
            view.events.find((event) => event.id === eventId)?.title ?? ""
        )
      ]
        .join(" ")
        .trim(),
      served_revision: revision
    }));
  return [worldEntry, ...canonEntries, ...eventEntries, ...subjectEntries];
}

export function projectPublicDocuments(
  source: CanonicalRevisionView,
  revision: number,
  generatedAt: string,
  subjectBundle?: SubjectProjectionBundle
): readonly ProjectionDocument[] {
  const view = allowlistView(source);
  const subjects = subjectBundle ?? projectSubjects(view, revision);
  const prefix = `worlds/${view.world.id}/revisions/${revision}`;
  const metadata = {
    world_id: view.world.id,
    served_revision: revision,
    generated_at: generatedAt
  };
  const canons = sorted(view.canons);
  const events = sorted(view.events);
  const narratives = sorted(view.narratives);
  const timeSystems = sorted(view.timeSystems);
  const relations = sorted(view.relations);
  const temporalPlacements = sorted(view.temporalPlacements);
  const processes = projectProcesses(view, revision);
  const states = projectStates(view, revision, subjects);
  const timelineDocuments = sorted(view.canonTimeSystems).flatMap((link) => {
    if (
      !canons.some((canon) => canon.id === link.canon_id) ||
      !timeSystems.some((timeSystem) => timeSystem.id === link.time_system_id)
    ) {
      return [];
    }
    const projection = projectTimeline(view, revision, {
      canonId: link.canon_id,
      timeSystemId: link.time_system_id
    });
    return [
      {
        key: `${prefix}/graph/canons/${link.canon_id}/timeline-${link.time_system_id}.json`,
        value: { ...metadata, ...projection }
      }
    ];
  });
  const subjectDocuments = subjects.handles.map((handle) => {
    const projection = subjects.projections.find(
      (item) => item.subject_handle_id === handle.id
    );
    return {
      key: `${prefix}/subjects/${handle.id}.json`,
      value: {
        ...metadata,
        handle: {
          id: handle.id,
          canon_id: handle.canon_id,
          anchor_event_id: handle.anchor_event_id,
          status: handle.status,
          redirect_to: handle.redirect_to,
          created_revision: handle.created_revision,
          projection_revision: handle.projection_revision
        },
        canonical_url: `/worlds/${view.world.id}/canons/${handle.canon_id}/subjects/${handle.id}`,
        redirect_url: handle.redirect_to
          ? `/worlds/${view.world.id}/canons/${handle.canon_id}/subjects/${handle.redirect_to}`
          : null,
        subject: projection ?? null
      }
    };
  });
  const processDocuments = processes.map((process) => ({
    key: `${prefix}/graph/canons/${process.canon_id}/process-${process.process_event_id}.json`,
    value: { ...metadata, ...process }
  }));
  const stateDocuments = states.map((state) => ({
    key: `${prefix}/graph/canons/${state.canon_id}/states.json`,
    value: { ...metadata, ...state }
  }));
  return [
    {
      key: `${prefix}/world.json`,
      value: {
        ...metadata,
        world: view.world,
        canons,
        search_key: `${prefix}/search/en.json`
      }
    },
    ...canons.map((canon) => ({
      key: `${prefix}/canons/${canon.id}.json`,
      value: {
        ...metadata,
        canon,
        narratives: narratives.filter(
          (item) => item.scope_type === "canon" && item.scope_id === canon.id
        ),
        events: events.filter((event) => event.canon_id === canon.id),
        time_systems: timeSystems.filter((timeSystem) =>
          view.canonTimeSystems.some(
            (link) =>
              link.canon_id === canon.id &&
              link.time_system_id === timeSystem.id
          )
        ),
        timeline_artifacts: timelineDocuments
          .filter((document) =>
            document.key.includes(`/graph/canons/${canon.id}/`)
          )
          .map((document) => ({
            time_system_id: String(document.value.time_system_id),
            key: document.key,
            algorithm_version: String(document.value.algorithm_version)
          })),
        subject_artifacts: subjects.projections
          .filter((subject) => subject.canon_id === canon.id)
          .map((subject) => ({
            subject_handle_id: subject.subject_handle_id,
            key: `${prefix}/subjects/${subject.subject_handle_id}.json`,
            label: subject.label,
            member_count: subject.member_event_ids.length,
            algorithm_version: subject.algorithm_version,
            completeness: subject.completeness
          })),
        process_artifacts: processes
          .filter((process) => process.canon_id === canon.id)
          .map((process) => ({
            process_event_id: process.process_event_id,
            key: `${prefix}/graph/canons/${canon.id}/process-${process.process_event_id}.json`,
            label: process.label,
            direct_child_count: process.direct_child_event_ids.length,
            descendant_count: process.descendant_event_ids.length,
            algorithm_version: process.algorithm_version,
            completeness: process.completeness
          })),
        state_artifact:
          states
            .filter((state) => state.canon_id === canon.id)
            .map((state) => ({
              key: `${prefix}/graph/canons/${canon.id}/states.json`,
              item_count: state.items.length,
              algorithm_version: state.algorithm_version,
              completeness: state.completeness
            }))[0] ?? null
      }
    })),
    ...events.map((event) => {
      const eventRelations = relations.filter(
        (relation) =>
          relation.source_event_id === event.id ||
          relation.target_event_id === event.id
      );
      const relatedIds = new Set(
        eventRelations.flatMap((relation) => [
          relation.source_event_id,
          relation.target_event_id
        ])
      );
      relatedIds.delete(event.id);
      const placements = temporalPlacements.filter(
        (placement) => placement.event_id === event.id
      );
      const placementTimeIds = new Set(
        placements.map((placement) => placement.time_system_id)
      );
      const processProjection = processes.find(
        (process) => process.process_event_id === event.id
      );
      const relevantTimeIds = new Set([
        ...placementTimeIds,
        ...(processProjection?.durations.map(
          (duration) => duration.time_system_id
        ) ?? [])
      ]);
      return {
        key: `${prefix}/events/${event.id}.json`,
        value: {
          ...metadata,
          event,
          narratives: narratives.filter(
            (item) => item.scope_type === "event" && item.scope_id === event.id
          ),
          temporal_placements: placements,
          time_systems: timeSystems.filter((timeSystem) =>
            relevantTimeIds.has(timeSystem.id)
          ),
          relations: eventRelations,
          related_events: events.filter((candidate) =>
            relatedIds.has(candidate.id)
          ),
          subject_handle_ids: subjects.projections
            .filter((subject) => subject.member_event_ids.includes(event.id))
            .map((subject) => subject.subject_handle_id),
          process_artifact: processProjection
            ? {
                process_event_id: processProjection.process_event_id,
                key: `${prefix}/graph/canons/${processProjection.canon_id}/process-${processProjection.process_event_id}.json`,
                label: processProjection.label,
                direct_child_count:
                  processProjection.direct_child_event_ids.length,
                descendant_count: processProjection.descendant_event_ids.length,
                algorithm_version: processProjection.algorithm_version,
                completeness: processProjection.completeness
              }
            : null,
          parent_process_ids: processes
            .filter((process) =>
              process.descendant_event_ids.includes(event.id)
            )
            .map((process) => process.process_event_id)
        }
      };
    }),
    {
      key: `${prefix}/search/en.json`,
      value: {
        ...metadata,
        locale: "en",
        entries: searchEntries(view, revision, subjects.projections)
      }
    },
    ...timelineDocuments,
    ...subjectDocuments,
    ...processDocuments,
    ...stateDocuments
  ];
}
