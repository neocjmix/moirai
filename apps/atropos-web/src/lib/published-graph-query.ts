import { createHash } from "node:crypto";

import {
  MOIRAI_GRAPH_RESULT_CONTRACT_VERSION,
  type MoiraiGraphDiagnostic,
  type MoiraiGraphEvent,
  type MoiraiGraphNarrative,
  type MoiraiGraphQuery,
  type MoiraiGraphQueryResult,
  type MoiraiGraphRelation,
  type MoiraiGraphTimeEvent,
  type PublicEvent,
  type PublicNarrative,
  type PublicRelation,
  type PublicationManifest
} from "@moirai/contracts";

import {
  readCanon,
  readGraphScope,
  readRelationalTime,
  readSubject,
  readWorldEvent,
  selectPublicationRevision,
  type SelectedPublication
} from "./publication";

const MAX_SOURCES = 8;
const MAX_CANONS = 32;
const MAX_ENTITIES = 10_000;
const MAX_RELATIONS = 20_000;
const MAX_EVIDENCE = 40_000;

type CanonRead = Awaited<ReturnType<typeof readCanon>>;

export type PublishedGraphQueryReader = {
  readonly selectPublicationRevision: (
    worldId: string,
    revision: number
  ) => Promise<SelectedPublication>;
  readonly readCanon: (
    worldId: string,
    canonId: string,
    selected: SelectedPublication
  ) => Promise<CanonRead>;
  readonly readWorldEvent: (
    worldId: string,
    eventId: string,
    selected: SelectedPublication
  ) => Promise<{
    event: PublicEvent;
    narratives: readonly PublicNarrative[];
    relations: readonly PublicRelation[];
  }>;
  readonly readGraphScope: typeof readGraphScope;
  readonly readRelationalTime: typeof readRelationalTime;
  readonly readSubject: typeof readSubject;
};

const DEFAULT_READER: PublishedGraphQueryReader = {
  selectPublicationRevision,
  readCanon,
  readWorldEvent,
  readGraphScope,
  readRelationalTime,
  readSubject
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function validateBudget(query: MoiraiGraphQuery) {
  const canonCount = query.sources.reduce(
    (count, source) => count + source.canon_ids.length,
    0
  );
  if (
    query.sources.length === 0 ||
    query.sources.length > MAX_SOURCES ||
    canonCount > MAX_CANONS ||
    query.budget.max_entities > MAX_ENTITIES ||
    query.budget.max_relations > MAX_RELATIONS ||
    query.budget.max_evidence > MAX_EVIDENCE
  ) {
    throw new Error("graph query exceeds public composition limits");
  }
}

function sourceDigest(manifest: PublicationManifest) {
  return digest({
    format_version: manifest.format_version,
    served_revision: manifest.served_revision,
    documents: manifest.documents.map(({ key, sha256 }) => ({ key, sha256 }))
  });
}

function eventKey(worldId: string, eventId: string) {
  return `${worldId}:${eventId}`;
}

export async function composePublishedGraphQuery(
  query: MoiraiGraphQuery,
  reader: PublishedGraphQueryReader = DEFAULT_READER
): Promise<MoiraiGraphQueryResult> {
  validateBudget(query);
  const diagnostics: MoiraiGraphDiagnostic[] = [];
  const eventMap = new Map<string, MoiraiGraphEvent>();
  const relationMap = new Map<string, MoiraiGraphRelation>();
  const narrativeMap = new Map<string, MoiraiGraphNarrative>();
  const virtualMap = new Map<string, MoiraiGraphTimeEvent>();
  const subjectMap = new Map<
    string,
    MoiraiGraphQueryResult["subjects"][number]
  >();
  const compositeMap = new Map<
    string,
    MoiraiGraphQueryResult["composites"][number]
  >();
  const stateMap = new Map<string, MoiraiGraphQueryResult["states"][number]>();
  const revisionVector: MoiraiGraphQueryResult["revision_vector"][number][] =
    [];
  const sourceArtifactDigests: Record<string, string> = {};
  const timeSystems: MoiraiGraphQueryResult["time_systems"][number][] = [];
  const compatibility: MoiraiGraphQueryResult["compatibility"][number][] = [];

  await Promise.all(
    query.sources.map(async (source) => {
      try {
        const selected = await reader.selectPublicationRevision(
          source.world_id,
          source.served_revision
        );
        if (selected.pointer.served_revision !== source.served_revision) {
          throw new Error(
            "requested Publication Revision does not match selected artifact"
          );
        }
        const canonReads = await Promise.all(
          source.canon_ids.map((canonId) =>
            reader.readCanon(source.world_id, canonId, selected)
          )
        );
        if (
          canonReads.some((entry) => entry.canon.world_id !== source.world_id)
        ) {
          throw new Error("Publication Canon crossed World boundary");
        }
        const canonArtifacts = await Promise.all(
          canonReads.map(async (canonRead) => ({
            canonRead,
            temporal: await reader.readRelationalTime(
              source.world_id,
              canonRead.canon.id,
              canonRead.temporalArtifact,
              selected
            ),
            graph: canonRead.graphScopeArtifact
              ? await reader.readGraphScope(
                  source.world_id,
                  canonRead.canon.id,
                  canonRead.graphScopeArtifact,
                  selected
                )
              : null,
            subjects: await Promise.all(
              canonRead.subjectArtifacts.map((reference) =>
                reader.readSubject(
                  source.world_id,
                  canonRead.canon.id,
                  reference.subject_handle_id,
                  selected
                )
              )
            )
          }))
        );

        revisionVector.push({
          world_id: source.world_id,
          served_revision: source.served_revision
        });
        sourceArtifactDigests[`${source.world_id}@${source.served_revision}`] =
          sourceDigest(selected.manifest);

        for (const identity of source.time_systems) {
          const native =
            identity.definition_version ===
              query.temporal_frame.target.definition_version &&
            identity.adapter_identity ===
              query.temporal_frame.target.adapter_identity &&
            identity.comparison_domain ===
              query.temporal_frame.target.comparison_domain;
          compatibility.push({
            source: identity,
            target: query.temporal_frame.target,
            status: native ? "native" : "incompatible",
            reason_code: native
              ? "same_adapter_domain_and_definition"
              : "explicit_identity_mismatch",
            adapter_id: native ? identity.adapter_identity : null,
            lossless: native
          });
          timeSystems.push({
            world_id: source.world_id,
            served_revision: source.served_revision,
            identity,
            definition: {},
            capabilities: native ? ["equality", "compare"] : []
          });
        }

        const selectedEvents = new Map<string, PublicEvent>();
        for (const canonRead of canonReads) {
          for (const event of canonRead.events) {
            if (event.world_id !== source.world_id) {
              throw new Error("Publication Event crossed World boundary");
            }
            if (
              event.canon_memberships.some((id) =>
                source.canon_ids.includes(id)
              )
            ) {
              selectedEvents.set(event.id, event);
            }
          }
          for (const narrative of canonRead.narratives) {
            if (!source.canon_ids.includes(narrative.canon_id)) continue;
            narrativeMap.set(`${source.world_id}:${narrative.id}`, {
              world_id: source.world_id,
              canon_id: narrative.canon_id,
              served_revision: source.served_revision,
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
        }

        const documents = await Promise.all(
          [...selectedEvents.values()].map((event) =>
            reader.readWorldEvent(source.world_id, event.id, selected)
          )
        );
        for (const document of documents) {
          const event = document.event;
          const matchedCanonIds = event.canon_memberships.filter((id) =>
            source.canon_ids.includes(id)
          );
          if (
            !query.entity_filter.event_kinds.includes(event.kind) ||
            (query.entity_filter.roles.length > 0 &&
              !event.roles.some((role) =>
                query.entity_filter.roles.includes(role)
              ))
          ) {
            continue;
          }
          eventMap.set(eventKey(source.world_id, event.id), {
            world_id: source.world_id,
            served_revision: source.served_revision,
            canon_memberships: event.canon_memberships,
            matched_canon_ids: matchedCanonIds,
            id: event.id,
            slug: event.slug,
            event_kind: event.kind,
            title: event.title,
            summary: event.summary,
            roles: event.roles,
            attributes: event.attributes,
            temporal_position: {
              kind: "unplaced",
              reason_code: "temporal_artifact_composition_pending",
              evidence_ids: []
            },
            narrative_ids: document.narratives
              .filter((narrative) =>
                source.canon_ids.includes(narrative.canon_id)
              )
              .map((narrative) => narrative.id),
            evidence_ids: [
              `publication:${source.world_id}@${source.served_revision}`
            ]
          });
        }

        for (const { canonRead, temporal, graph, subjects } of canonArtifacts) {
          const canonId = canonRead.canon.id;
          if (graph?.truncated) {
            diagnostics.push({
              code: "graph_scope_truncated",
              severity: "warning",
              source: {
                world_id: source.world_id,
                canon_id: canonId,
                served_revision: source.served_revision
              },
              affected_ids: [],
              message: graph.next_scope_hint ?? "Graph scope is truncated."
            });
          }
          for (const position of temporal.positions) {
            const key = eventKey(source.world_id, position.event_id);
            const event = eventMap.get(key);
            if (!event) continue;
            const evidenceIds = position.source_constraint_ids;
            const timeReference = (
              value: NonNullable<typeof position.time_event>
            ) => ({
              kind: "time_event" as const,
              time_system_ref: value.time_system_ref,
              definition_version: value.definition_version,
              coordinate: value.coordinate
            });
            const temporalPosition: MoiraiGraphEvent["temporal_position"] =
              position.kind === "exact" && position.time_event
                ? {
                    kind: "exact",
                    at: timeReference(position.time_event),
                    evidence_ids: evidenceIds
                  }
                : position.kind === "bounded"
                  ? {
                      kind: "bounded",
                      lower: position.lower
                        ? timeReference(position.lower.time_event)
                        : null,
                      lower_inclusive: position.lower?.inclusive ?? false,
                      upper: position.upper
                        ? timeReference(position.upper.time_event)
                        : null,
                      upper_inclusive: position.upper?.inclusive ?? false,
                      evidence_ids: evidenceIds
                    }
                  : position.kind === "relative-only"
                    ? {
                        kind: "relative_only",
                        component_id: `${source.world_id}:${canonId}`,
                        rank: temporal.positions.indexOf(position),
                        evidence_ids: evidenceIds
                      }
                    : {
                        kind: "unplaced",
                        reason_code: position.reason ?? "unresolved",
                        evidence_ids: evidenceIds
                      };
            eventMap.set(key, {
              ...event,
              temporal_position: temporalPosition
            });
          }
          for (const timeEvent of temporal.virtual_time_events) {
            if (!query.entity_filter.include_virtual_time_events) continue;
            const reference = {
              kind: "time_event" as const,
              time_system_ref: timeEvent.time_system_ref,
              definition_version: timeEvent.definition_version,
              coordinate: timeEvent.coordinate
            };
            const id = digest(reference);
            virtualMap.set(`${source.world_id}:${canonId}:${id}`, {
              world_id: source.world_id,
              canon_id: canonId,
              served_revision: source.served_revision,
              id: `time-event:${id}`,
              persisted: false,
              reference,
              evidence_ids: temporal.evidence
            });
          }
          for (const composite of temporal.composites) {
            compositeMap.set(
              `${source.world_id}:${canonId}:${composite.event_id}`,
              {
                world_id: source.world_id,
                canon_id: canonId,
                served_revision: source.served_revision,
                event_id: composite.event_id,
                direct_child_event_ids: composite.direct_children.flatMap(
                  (reference) =>
                    reference.kind === "event" ? [reference.event_id] : []
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
                evidence_ids: [
                  ...composite.duration.evidence,
                  ...composite.descendant_span.evidence
                ],
                diagnostics: [
                  composite.duration.reason,
                  composite.descendant_span.reason
                ].filter((value): value is string => Boolean(value)),
                completeness:
                  composite.duration.kind === "exact" ||
                  composite.descendant_span.kind === "exact"
                    ? "complete"
                    : "unresolved"
              }
            );
            if (composite.membership_state) {
              stateMap.set(
                `${source.world_id}:${canonId}:${composite.event_id}:membership`,
                {
                  world_id: source.world_id,
                  canon_id: canonId,
                  served_revision: source.served_revision,
                  composite_event_id: composite.event_id,
                  subject_handle_id:
                    composite.membership_state.subject_handle_id ??
                    "unresolved",
                  state_family: "membership",
                  status: composite.membership_state.status,
                  value: null,
                  candidate_values: [],
                  open_ended: null,
                  start: {
                    earliest: composite.start_ref,
                    latest: composite.start_ref
                  },
                  end: {
                    earliest: composite.end_ref,
                    latest: composite.end_ref
                  },
                  algorithm_version: temporal.algorithm_version,
                  evidence_ids: temporal.evidence,
                  diagnostics: composite.membership_state.reason
                    ? [composite.membership_state.reason]
                    : [],
                  completeness:
                    composite.membership_state.status === "resolved"
                      ? "complete"
                      : "unresolved"
                }
              );
            }
          }
          for (const { document } of subjects) {
            if (!document.subject) continue;
            const subject = document.subject;
            subjectMap.set(
              `${source.world_id}:${canonId}:${subject.subject_handle_id}`,
              {
                world_id: source.world_id,
                canon_id: canonId,
                served_revision: source.served_revision,
                subject_handle_id: subject.subject_handle_id,
                label: subject.label,
                anchor_event_id: subject.anchor_event_id,
                member_event_ids: subject.member_event_ids,
                identity_relation_ids: [
                  ...subject.identity_relation_ids,
                  ...subject.instance_relation_ids
                ],
                lineage_relation_ids: [
                  ...subject.lineage.incoming,
                  ...subject.lineage.outgoing
                ].map((edge) => edge.relation_id),
                narrative_ids: subject.narrative_ids,
                evidence_ids: subject.evidence,
                diagnostics: subject.diagnostics.map((entry) => entry.code),
                completeness: subject.completeness
              }
            );
          }
          for (const publicTimeSystem of temporal.time_systems) {
            timeSystems.push({
              world_id: source.world_id,
              served_revision: source.served_revision,
              identity: {
                time_system_id: publicTimeSystem.id,
                definition_version: publicTimeSystem.definition_version,
                adapter_identity: `publication:${publicTimeSystem.kind}`,
                comparison_domain: `${source.world_id}:${publicTimeSystem.id}`
              },
              definition: publicTimeSystem.definition,
              capabilities: ["canonicalize", "equality", "compare", "boundary"]
            });
          }
        }

        const visibleEventIds = new Set(
          [...eventMap.values()]
            .filter((event) => event.world_id === source.world_id)
            .map((event) => event.id)
        );
        for (const relation of documents.flatMap(
          (document) => document.relations
        )) {
          if (
            relation.world_id !== source.world_id ||
            !query.relation_filter.types.includes(relation.type) ||
            !query.relation_filter.directions.includes(relation.direction)
          ) {
            continue;
          }
          const matchedCanonIds = relation.canon_memberships.filter((id) =>
            source.canon_ids.includes(id)
          );
          if (matchedCanonIds.length === 0) continue;
          const persistedEndpointIds = [
            relation.source_ref,
            relation.target_ref
          ].flatMap((reference) =>
            reference.kind === "event" ? [reference.event_id] : []
          );
          if (persistedEndpointIds.some((id) => !visibleEventIds.has(id))) {
            diagnostics.push({
              code: "relation_endpoint_outside_scope",
              severity: "warning",
              source: {
                world_id: source.world_id,
                served_revision: source.served_revision
              },
              affected_ids: [relation.id],
              message:
                "Relation omitted because a persisted endpoint is outside the selected scope."
            });
            continue;
          }
          relationMap.set(`${source.world_id}:${relation.id}`, {
            world_id: source.world_id,
            served_revision: source.served_revision,
            canon_memberships: relation.canon_memberships,
            matched_canon_ids: matchedCanonIds,
            id: relation.id,
            type: relation.type,
            direction: relation.direction,
            source_ref: relation.source_ref,
            target_ref: relation.target_ref,
            attributes: relation.attributes,
            evidence_ids: [
              `publication:${source.world_id}@${source.served_revision}`
            ]
          });
          if (query.entity_filter.include_virtual_time_events) {
            for (const reference of [
              relation.source_ref,
              relation.target_ref
            ]) {
              if (reference.kind !== "time_event") continue;
              const id = digest(reference);
              virtualMap.set(`${source.world_id}:${matchedCanonIds[0]}:${id}`, {
                world_id: source.world_id,
                canon_id: matchedCanonIds[0]!,
                served_revision: source.served_revision,
                id: `time-event:${id}`,
                persisted: false,
                reference,
                evidence_ids: [relation.id]
              });
            }
          }
        }
      } catch {
        diagnostics.push({
          code: "publication_source_unavailable",
          severity: "error",
          source: {
            world_id: source.world_id,
            served_revision: source.served_revision
          },
          affected_ids: source.canon_ids,
          message:
            "The requested immutable Publication source could not be composed."
        });
      }
    })
  );

  const events = [...eventMap.values()].toSorted((a, b) =>
    eventKey(a.world_id, a.id).localeCompare(eventKey(b.world_id, b.id))
  );
  const relations = [...relationMap.values()].toSorted((a, b) =>
    eventKey(a.world_id, a.id).localeCompare(eventKey(b.world_id, b.id))
  );
  const narratives = [...narrativeMap.values()].toSorted((a, b) =>
    eventKey(a.world_id, a.id).localeCompare(eventKey(b.world_id, b.id))
  );
  const truncated =
    events.length > query.budget.max_entities ||
    relations.length > query.budget.max_relations;
  const boundedEvents = events.slice(0, query.budget.max_entities);
  const boundedRelations = relations.slice(0, query.budget.max_relations);

  revisionVector.sort((a, b) => a.world_id.localeCompare(b.world_id));
  compatibility.sort((a, b) =>
    `${a.source.time_system_id}:${a.target.time_system_id}`.localeCompare(
      `${b.source.time_system_id}:${b.target.time_system_id}`
    )
  );
  timeSystems.sort((a, b) =>
    `${a.world_id}:${a.identity.time_system_id}`.localeCompare(
      `${b.world_id}:${b.identity.time_system_id}`
    )
  );
  diagnostics.sort((a, b) =>
    `${a.source.world_id ?? ""}:${a.code}:${a.affected_ids.join(",")}`.localeCompare(
      `${b.source.world_id ?? ""}:${b.code}:${b.affected_ids.join(",")}`
    )
  );
  const sortAddressed = <T extends { world_id: string }>(values: Iterable<T>) =>
    [...values].toSorted((a, b) => stable(a).localeCompare(stable(b)));
  return {
    contract_version: MOIRAI_GRAPH_RESULT_CONTRACT_VERSION,
    query,
    revision_vector: revisionVector,
    compatibility,
    time_systems: timeSystems,
    events: boundedEvents,
    virtual_time_events: sortAddressed(virtualMap.values()),
    relations: boundedRelations,
    subjects: sortAddressed(subjectMap.values()),
    composites: sortAddressed(compositeMap.values()),
    states: sortAddressed(stateMap.values()),
    narratives,
    evidence: [],
    diagnostics,
    algorithm_versions: { composition: "publication-query-composition/1" },
    source_artifact_digests: sourceArtifactDigests,
    completeness:
      revisionVector.length === 0
        ? "unresolved"
        : diagnostics.some((entry) => entry.severity === "error") || truncated
          ? "partial"
          : "complete",
    budget: {
      ...query.budget,
      returned_entities: boundedEvents.length,
      returned_relations: boundedRelations.length,
      returned_evidence: 0,
      truncated,
      next_scope_hint: truncated ? "reduce sources, filters, or scope" : null
    }
  };
}

export function publishedGraphQueryDigest(result: MoiraiGraphQueryResult) {
  return digest({
    query: result.query,
    revision_vector: result.revision_vector,
    source_artifact_digests: result.source_artifact_digests,
    events: result.events,
    relations: result.relations,
    narratives: result.narratives,
    diagnostics: result.diagnostics
  });
}
