import type {
  CanonicalEventReference,
  MoiraiGraphQueryResult
} from "@moirai/contracts";

import type {
  GraphDiagnostic,
  GraphRelationMatch,
  GraphSearchEntity
} from "./moirai-graph-source-query";

function endpoint(ref: CanonicalEventReference): string {
  return ref.kind === "event"
    ? ref.event_id
    : `${ref.time_system_ref.time_system_id}:${ref.definition_version}:${ref.coordinate}`;
}

export function graphPresentationFromResult(result: MoiraiGraphQueryResult): {
  readonly entities: readonly GraphSearchEntity[];
  readonly relations: readonly GraphRelationMatch[];
  readonly diagnostics: readonly GraphDiagnostic[];
} {
  const entities: GraphSearchEntity[] = [
    ...result.events.map((event): GraphSearchEntity => ({
      identity: event.id,
      kind: "event",
      worldId: event.world_id,
      title: { ko: event.title, en: event.title },
      description: { ko: event.summary ?? "", en: event.summary ?? "" },
      canonMemberships: event.canon_memberships,
      eventKind: event.event_kind,
      roles: event.roles
    })),
    ...result.subjects.map((subject): GraphSearchEntity => ({
      identity: subject.subject_handle_id,
      kind: "subject",
      worldId: subject.world_id,
      title: { ko: subject.label, en: subject.label },
      description: {
        ko: "Derived Subject projection",
        en: "Derived Subject projection"
      },
      canonMemberships: [subject.canon_id],
      subjectHandleId: subject.subject_handle_id
    })),
    ...result.states.map((state): GraphSearchEntity => ({
      identity: `${state.composite_event_id}:${state.subject_handle_id}:${state.state_family}`,
      kind: "state",
      worldId: state.world_id,
      title: { ko: state.state_family, en: state.state_family },
      description: { ko: state.status, en: state.status },
      canonMemberships: [state.canon_id],
      subjectHandleId: state.subject_handle_id,
      compositeEventId: state.composite_event_id,
      stateFamily: state.state_family
    })),
    ...result.narratives.map((narrative): GraphSearchEntity => ({
      identity: narrative.id,
      kind: "narrative",
      worldId: narrative.world_id,
      title: {
        ko: narrative.title ?? narrative.narrative_kind,
        en: narrative.title ?? narrative.narrative_kind
      },
      description: { ko: narrative.body, en: narrative.body },
      canonMemberships: [narrative.canon_id]
    }))
  ];
  const relations = result.relations.map((relation): GraphRelationMatch => ({
    id: relation.id,
    worldId: relation.world_id,
    type: relation.type,
    sourceIdentity: endpoint(relation.source_ref),
    targetIdentity: endpoint(relation.target_ref),
    canonMemberships: relation.canon_memberships,
    matchedCanonIds: relation.matched_canon_ids,
    endpointEvidence: relation.evidence_ids,
    timeSystemEvidence: [
      ...new Set(
        [relation.source_ref, relation.target_ref].flatMap((ref) =>
          ref.kind === "time_event" ? [ref.time_system_ref.time_system_id] : []
        )
      )
    ]
  }));
  const diagnostics = result.diagnostics.map((diagnostic): GraphDiagnostic => ({
    code:
      diagnostic.code === "contradiction"
        ? "contradiction"
        : diagnostic.code.includes("truncat") ||
            diagnostic.code.includes("budget")
          ? "truncation"
          : diagnostic.code.includes("incompat")
            ? "incompatibility"
            : diagnostic.code.includes("unplaced")
              ? "unplaced"
              : "unresolved",
    severity: diagnostic.severity === "warning" ? "warning" : "informational",
    invalid: false,
    message: { ko: diagnostic.message, en: diagnostic.message }
  }));
  return { entities, relations, diagnostics };
}
