import { createHash } from "node:crypto";

import {
  MOIRAI_GRAPH_RESULT_CONTRACT_VERSION,
  type MoiraiGraphCompatibility,
  type MoiraiGraphDiagnostic,
  type MoiraiGraphEvidence,
  type MoiraiGraphEvent,
  type MoiraiGraphQuery,
  type MoiraiGraphQueryResult,
  type MoiraiGraphTemporalPosition,
  type MoiraiGraphTimeSystem,
  type MoiraiGraphTimeSystemIdentity,
  type PublicCanon,
  type PublicEvent,
  type PublicGraphScopeArtifact,
  type PublicNarrative,
  type PublicRelationalTemporalProjection,
  type PublicSubjectHandleDocument,
  type PublicTimeSystem,
  type PublicationManifest
} from "@moirai/contracts";

export const GRAPH_PUBLICATION_COMPOSER_VERSION =
  "publication-query-composer/1";

export interface GraphPublicationCanonSnapshot {
  readonly worldId: string;
  readonly servedRevision: number;
  readonly canon: PublicCanon;
  readonly events: readonly PublicEvent[];
  readonly narratives: readonly PublicNarrative[];
  readonly timeSystems: readonly PublicTimeSystem[];
  readonly temporal: PublicRelationalTemporalProjection;
  readonly graphScope: PublicGraphScopeArtifact | null;
  readonly subjects: readonly PublicSubjectHandleDocument[];
  readonly manifest: PublicationManifest;
}

export interface GraphPublicationFailure {
  readonly worldId: string;
  readonly servedRevision?: number;
  readonly canonId?: string;
  readonly code:
    "source_unavailable" | "source_timeout" | "source_budget_exceeded";
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)])
    );
  return value;
}

export function graphQueryDigest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

function strings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Publication definitions may opt into cross-World comparison explicitly.
 * Missing metadata fails closed to the exact Time System identity.
 */
export function publicTimeSystemIdentity(
  system: PublicTimeSystem
): MoiraiGraphTimeSystemIdentity {
  const adapter = system.definition.graph_adapter_identity;
  const domain = system.definition.comparison_domain;
  const codec = system.definition.coordinate_codec;
  return {
    time_system_id: system.id,
    definition_version: system.definition_version,
    adapter_identity:
      typeof adapter === "string" && adapter.length > 0
        ? adapter
        : typeof codec === "string" && codec.length > 0
          ? codec
          : system.id,
    comparison_domain:
      typeof domain === "string" && domain.length > 0
        ? domain
        : typeof codec === "string" && codec.length > 0
          ? codec
          : system.id
  };
}

function compatibility(
  source: MoiraiGraphTimeSystemIdentity,
  target: MoiraiGraphTimeSystemIdentity
): MoiraiGraphCompatibility {
  if (
    source.time_system_id === target.time_system_id &&
    source.definition_version !== target.definition_version
  ) {
    return {
      source,
      target,
      status: "definition_version_mismatch",
      reason_code: "definition_version_mismatch",
      adapter_id: null,
      lossless: false
    };
  }
  const lossless =
    source.adapter_identity === target.adapter_identity &&
    source.comparison_domain === target.comparison_domain;
  return {
    source,
    target,
    status: lossless ? "native" : "incompatible",
    reason_code: lossless
      ? "explicit_adapter_and_domain_match"
      : "adapter_identity_or_domain_mismatch",
    adapter_id: lossless ? source.adapter_identity : null,
    lossless
  };
}

function temporalPosition(
  eventId: string,
  temporal: PublicRelationalTemporalProjection,
  graphScope: PublicGraphScopeArtifact | null
): MoiraiGraphTemporalPosition {
  const position = temporal.positions.find((item) => item.event_id === eventId);
  const graphNode = graphScope?.nodes.find((node) => node.event_id === eventId);
  const evidence = position?.source_constraint_ids ?? [];
  if (position?.kind === "exact" && position.time_event)
    return { kind: "exact", at: position.time_event, evidence_ids: evidence };
  if (position?.kind === "bounded")
    return {
      kind: "bounded",
      lower: position.lower?.time_event ?? null,
      lower_inclusive: position.lower?.inclusive ?? false,
      upper: position.upper?.time_event ?? null,
      upper_inclusive: position.upper?.inclusive ?? false,
      evidence_ids: evidence
    };
  if (position?.kind === "relative-only" && graphNode)
    return {
      kind: "relative_only",
      component_id: graphNode.chronology.component_id,
      rank: graphNode.chronology.rank,
      evidence_ids: strings([...evidence, ...graphNode.chronology.evidence])
    };
  return {
    kind: "unplaced",
    reason_code: position?.reason ? "projection_unresolved" : "position_absent",
    evidence_ids: evidence
  };
}

function artifactEvidence(snapshot: GraphPublicationCanonSnapshot) {
  const docs = new Map(
    snapshot.manifest.documents.map((doc) => [doc.key, doc])
  );
  const prefix = `worlds/${snapshot.worldId}/revisions/${snapshot.servedRevision}`;
  const refs = [
    [`${prefix}/canons/${snapshot.canon.id}.json`, null],
    [
      `${prefix}/graph/canons/${snapshot.canon.id}/temporal.json`,
      snapshot.temporal.algorithm_version
    ],
    [
      `${prefix}/graph/canons/${snapshot.canon.id}/scope-overview.json`,
      snapshot.graphScope?.algorithm_version ?? null
    ]
  ] as const;
  return refs.flatMap(([key, algorithm]): MoiraiGraphEvidence[] => {
    const doc = docs.get(key);
    return doc
      ? [
          {
            world_id: snapshot.worldId,
            canon_id: snapshot.canon.id,
            served_revision: snapshot.servedRevision,
            id: `artifact:${doc.sha256}`,
            kind: "projection",
            source_ids: [snapshot.canon.id],
            algorithm_version: algorithm,
            artifact_key: key,
            artifact_sha256: doc.sha256
          }
        ]
      : [];
  });
}

export function composeGraphPublicationQuery(
  query: MoiraiGraphQuery,
  snapshots: readonly GraphPublicationCanonSnapshot[],
  failures: readonly GraphPublicationFailure[] = []
): MoiraiGraphQueryResult {
  const selected = new Map(
    query.sources.map((source) => [source.world_id, source] as const)
  );
  const applicable = snapshots
    .filter((snapshot) => {
      const source = selected.get(snapshot.worldId);
      return (
        source?.served_revision === snapshot.servedRevision &&
        source.canon_ids.includes(snapshot.canon.id)
      );
    })
    .toSorted((left, right) =>
      `${left.worldId}:${left.canon.id}`.localeCompare(
        `${right.worldId}:${right.canon.id}`
      )
    );
  const diagnostics: MoiraiGraphDiagnostic[] = failures.map((failure) => ({
    code: failure.code,
    severity: "warning",
    source: {
      world_id: failure.worldId,
      ...(failure.canonId ? { canon_id: failure.canonId } : {}),
      ...(failure.servedRevision !== undefined
        ? { served_revision: failure.servedRevision }
        : {})
    },
    affected_ids: failure.canonId ? [failure.canonId] : [failure.worldId],
    message:
      "A bounded public source could not be composed; other World revisions are unchanged."
  }));
  const eventMap = new Map<string, MoiraiGraphEvent>();
  const relationMap = new Map<
    string,
    MoiraiGraphQueryResult["relations"][number]
  >();
  const timeSystemMap = new Map<string, MoiraiGraphTimeSystem>();
  const timeEventMap = new Map<
    string,
    MoiraiGraphQueryResult["virtual_time_events"][number]
  >();
  const narrativeMap = new Map<
    string,
    MoiraiGraphQueryResult["narratives"][number]
  >();
  const subjectMap = new Map<
    string,
    MoiraiGraphQueryResult["subjects"][number]
  >();
  const compositeMap = new Map<
    string,
    MoiraiGraphQueryResult["composites"][number]
  >();
  const evidenceMap = new Map<string, MoiraiGraphEvidence>();
  const artifactDigests: Record<string, string> = {};
  const algorithms: Record<string, string> = {
    composer: GRAPH_PUBLICATION_COMPOSER_VERSION
  };

  for (const snapshot of applicable) {
    const source = selected.get(snapshot.worldId)!;
    const artifactEvidenceEntries = artifactEvidence(snapshot);
    for (const item of artifactEvidenceEntries) {
      evidenceMap.set(`${item.world_id}:${item.canon_id}:${item.id}`, item);
      if (item.artifact_key && item.artifact_sha256)
        artifactDigests[item.artifact_key] = item.artifact_sha256;
    }
    algorithms.relational_time = snapshot.temporal.algorithm_version;
    if (snapshot.graphScope)
      algorithms.graph_scope = snapshot.graphScope.algorithm_version;
    const projectionEvidence = artifactEvidenceEntries.map((item) => item.id);

    for (const system of snapshot.timeSystems) {
      const identity = publicTimeSystemIdentity(system);
      const capabilities = Array.isArray(system.definition.capabilities)
        ? system.definition.capabilities.filter(
            (value): value is MoiraiGraphTimeSystem["capabilities"][number] =>
              typeof value === "string" &&
              [
                "canonicalize",
                "equality",
                "compare",
                "boundary",
                "difference",
                "conversion"
              ].includes(value)
          )
        : [];
      timeSystemMap.set(`${snapshot.worldId}:${system.id}`, {
        world_id: snapshot.worldId,
        served_revision: snapshot.servedRevision,
        identity,
        definition: system.definition,
        capabilities
      });
    }
    for (const event of snapshot.events) {
      const key = `${snapshot.worldId}:${event.id}`;
      const previous = eventMap.get(key);
      const matched = event.canon_memberships.filter((id) =>
        source.canon_ids.includes(id)
      );
      eventMap.set(key, {
        world_id: snapshot.worldId,
        served_revision: snapshot.servedRevision,
        canon_memberships: strings(event.canon_memberships),
        matched_canon_ids: strings([
          ...(previous?.matched_canon_ids ?? []),
          ...matched
        ]),
        id: event.id,
        slug: event.slug,
        event_kind: event.kind,
        title: event.title,
        summary: event.summary,
        roles: event.roles,
        attributes: event.attributes,
        temporal_position:
          previous?.temporal_position ??
          temporalPosition(event.id, snapshot.temporal, snapshot.graphScope),
        narrative_ids: strings([
          ...(previous?.narrative_ids ?? []),
          ...snapshot.narratives
            .filter(
              (narrative) =>
                narrative.scope_type === "event" &&
                narrative.scope_id === event.id
            )
            .map((narrative) => narrative.id)
        ]),
        evidence_ids: strings([
          ...(previous?.evidence_ids ?? []),
          ...projectionEvidence,
          event.id
        ])
      });
    }
    for (const relation of snapshot.temporal.relations) {
      if (!query.relation_filter.types.includes(relation.type)) continue;
      const key = `${snapshot.worldId}:${relation.id}`;
      const previous = relationMap.get(key);
      relationMap.set(key, {
        world_id: snapshot.worldId,
        served_revision: snapshot.servedRevision,
        canon_memberships: strings(relation.canon_memberships),
        matched_canon_ids: strings([
          ...(previous?.matched_canon_ids ?? []),
          ...relation.canon_memberships.filter((id) =>
            source.canon_ids.includes(id)
          )
        ]),
        id: relation.id,
        type: relation.type,
        direction: relation.direction,
        source_ref: relation.source_ref,
        target_ref: relation.target_ref,
        attributes: relation.attributes,
        evidence_ids: strings([
          ...(previous?.evidence_ids ?? []),
          ...projectionEvidence,
          relation.id
        ])
      });
    }
    for (const timeEvent of snapshot.temporal.virtual_time_events) {
      const id = graphQueryDigest(timeEvent);
      timeEventMap.set(`${snapshot.worldId}:${snapshot.canon.id}:${id}`, {
        world_id: snapshot.worldId,
        canon_id: snapshot.canon.id,
        served_revision: snapshot.servedRevision,
        id,
        persisted: false,
        reference: timeEvent,
        evidence_ids: projectionEvidence
      });
    }
    for (const narrative of snapshot.narratives) {
      narrativeMap.set(`${snapshot.worldId}:${narrative.id}`, {
        world_id: snapshot.worldId,
        canon_id: narrative.canon_id,
        served_revision: snapshot.servedRevision,
        id: narrative.id,
        scope_type: narrative.scope_type,
        scope_id: narrative.scope_id,
        locale: narrative.locale,
        narrative_kind: narrative.kind,
        title: narrative.title,
        body: narrative.body,
        public_references: narrative.public_references
      });
    }
    for (const document of snapshot.subjects) {
      const subject = document.subject;
      if (!subject) continue;
      subjectMap.set(
        `${snapshot.worldId}:${snapshot.canon.id}:${subject.subject_handle_id}`,
        {
          world_id: snapshot.worldId,
          canon_id: snapshot.canon.id,
          served_revision: snapshot.servedRevision,
          subject_handle_id: subject.subject_handle_id,
          label: subject.label,
          anchor_event_id: subject.anchor_event_id,
          member_event_ids: subject.member_event_ids,
          identity_relation_ids: subject.identity_relation_ids,
          lineage_relation_ids: strings([
            ...subject.lineage.incoming.map((edge) => edge.relation_id),
            ...subject.lineage.outgoing.map((edge) => edge.relation_id)
          ]),
          narrative_ids: subject.narrative_ids,
          evidence_ids: strings([...subject.evidence, ...projectionEvidence]),
          diagnostics: subject.diagnostics.map((item) => item.code),
          completeness: subject.completeness
        }
      );
    }
    for (const composite of snapshot.temporal.composites) {
      compositeMap.set(
        `${snapshot.worldId}:${snapshot.canon.id}:${composite.event_id}`,
        {
          world_id: snapshot.worldId,
          canon_id: snapshot.canon.id,
          served_revision: snapshot.servedRevision,
          event_id: composite.event_id,
          direct_child_event_ids: composite.direct_children.flatMap((ref) =>
            ref.kind === "event" ? [ref.event_id] : []
          ),
          descendant_event_ids: composite.descendant_event_ids,
          boundary: {
            start_event_id:
              composite.start_ref?.kind === "event"
                ? composite.start_ref.event_id
                : null,
            end_event_id:
              composite.end_ref?.kind === "event"
                ? composite.end_ref.event_id
                : null
          },
          duration: { ...composite.duration },
          descendant_span: { ...composite.descendant_span },
          evidence_ids: strings([
            ...composite.duration.evidence,
            ...composite.descendant_span.evidence
          ]),
          diagnostics: [
            composite.duration.reason,
            composite.descendant_span.reason
          ].filter((item): item is string => Boolean(item)),
          completeness:
            composite.duration.kind === "exact" ||
            composite.descendant_span.kind === "exact"
              ? "complete"
              : "unresolved"
        }
      );
    }
  }

  if (query.entity_filter.include_states) {
    diagnostics.push({
      code: "state_projection_unavailable",
      severity: "info",
      source: {},
      affected_ids: [],
      message:
        "Publication v3 does not expose complete State values; none were inferred."
    });
  }
  const causalClaims = new Map<string, Set<string>>();
  for (const relation of relationMap.values()) {
    if (
      !["causes", "enables", "prevents", "influences"].includes(relation.type)
    )
      continue;
    const key = `${relation.world_id}:${JSON.stringify(relation.source_ref)}:${JSON.stringify(relation.target_ref)}`;
    const claims = causalClaims.get(key) ?? new Set<string>();
    claims.add(relation.type);
    causalClaims.set(key, claims);
  }
  for (const [key, claims] of causalClaims) {
    if (
      claims.has("prevents") &&
      (claims.has("causes") || claims.has("enables"))
    )
      diagnostics.push({
        code: "contradiction",
        severity: "info",
        source: {},
        affected_ids: [key],
        message:
          "Selected Canon contexts contain distinct contradictory assertions; this is valid knowledge, not a structural error."
      });
  }
  const allEvents = [...eventMap.values()]
    .filter(
      (event) =>
        query.entity_filter.event_kinds.includes(event.event_kind) &&
        (query.entity_filter.roles.length === 0 ||
          query.entity_filter.roles.some((role) => event.roles.includes(role)))
    )
    .toSorted((a, b) =>
      `${a.world_id}:${a.id}`.localeCompare(`${b.world_id}:${b.id}`)
    );
  const allSubjects = [...subjectMap.values()].filter(
    (subject) =>
      query.entity_filter.subject_handle_ids.length === 0 ||
      query.entity_filter.subject_handle_ids.includes(subject.subject_handle_id)
  );
  const visibleCompositeIds = new Set(
    allEvents
      .filter((event) => event.event_kind === "composite")
      .map((event) => event.id)
  );
  const allComposites = [...compositeMap.values()].filter((composite) =>
    visibleCompositeIds.has(composite.event_id)
  );
  const allNarratives = query.entity_filter.include_narratives
    ? [...narrativeMap.values()]
    : [];
  const maxEntities = query.budget.max_entities;
  const entityCount =
    allEvents.length +
    allSubjects.length +
    allComposites.length +
    allNarratives.length;
  let remaining = maxEntities;
  const take = <T>(items: readonly T[]) => {
    const result = items.slice(0, Math.max(remaining, 0));
    remaining -= result.length;
    return result;
  };
  const events = take(allEvents);
  const subjects = take(allSubjects);
  const composites = take(allComposites);
  const narratives = take(allNarratives);
  const relations = [...relationMap.values()].slice(
    0,
    query.budget.max_relations
  );
  const evidence = [...evidenceMap.values()].slice(
    0,
    query.budget.max_evidence
  );
  const truncated =
    entityCount > maxEntities ||
    relationMap.size > relations.length ||
    evidenceMap.size > evidence.length;
  if (truncated)
    diagnostics.push({
      code: "query_budget_truncated",
      severity: "warning",
      source: {},
      affected_ids: [],
      message:
        "The deterministic query budget was reached; narrow the source or scope."
    });
  const revisionVector = query.sources.map((source) => ({
    world_id: source.world_id,
    served_revision: source.served_revision
  }));
  artifactDigests["query"] = graphQueryDigest({
    query,
    revision_vector: revisionVector,
    algorithm_versions: algorithms,
    source_artifact_digests: artifactDigests
  });
  const sourceIdentities = query.sources.flatMap(
    (source) => source.time_systems
  );
  return {
    contract_version: MOIRAI_GRAPH_RESULT_CONTRACT_VERSION,
    query,
    revision_vector: revisionVector,
    compatibility: sourceIdentities.map((identity) =>
      compatibility(identity, query.temporal_frame.target)
    ),
    time_systems: [...timeSystemMap.values()],
    events,
    virtual_time_events: query.entity_filter.include_virtual_time_events
      ? [...timeEventMap.values()]
      : [],
    relations,
    subjects,
    composites,
    states: [],
    narratives,
    evidence,
    diagnostics,
    algorithm_versions: algorithms,
    source_artifact_digests: artifactDigests,
    completeness:
      failures.length > 0 || query.entity_filter.include_states || truncated
        ? "partial"
        : "complete",
    budget: {
      ...query.budget,
      returned_entities:
        events.length + subjects.length + composites.length + narratives.length,
      returned_relations: relations.length,
      returned_evidence: evidence.length,
      truncated,
      next_scope_hint: truncated
        ? "Narrow World, Canon, filters, or request a focused scope."
        : null
    }
  };
}
