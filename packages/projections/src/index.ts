import type {
  PublicCanon,
  PublicCanonTimeSystem,
  PublicEvent,
  PublicNarrative,
  PublicRelation,
  PublicSearchEntry,
  PublicSubjectProjection,
  PublicTimeSystem,
  PublicWorld,
  SubjectHandleRecord
} from "@moirai/contracts";
import { endpointEventId } from "@moirai/domain";
import { createHash } from "node:crypto";
import { projectRelationalTime } from "./relational-time.js";

export {
  projectRelationalTime,
  RELATIONAL_TIME_ALGORITHM_VERSION
} from "./relational-time.js";

export const SUBJECT_ALGORITHM_VERSION = "event-relational-subject/1";

export interface CanonicalRevisionView {
  readonly world: PublicWorld;
  readonly canons: readonly PublicCanon[];
  readonly timeSystems: readonly PublicTimeSystem[];
  readonly canonTimeSystems: readonly PublicCanonTimeSystem[];
  readonly events: readonly PublicEvent[];
  readonly relations: readonly PublicRelation[];
  readonly narratives: readonly PublicNarrative[];
}

export interface ProjectionDocument {
  readonly key: string;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface SubjectProjectionBundle {
  readonly handles: readonly SubjectHandleRecord[];
  readonly projections: readonly PublicSubjectProjection[];
}

type EventRelation = PublicRelation & {
  readonly sourceId: string;
  readonly targetId: string;
};

function asEventRelation(relation: PublicRelation): EventRelation | null {
  const source = endpointEventId(relation.source_ref);
  const target = endpointEventId(relation.target_ref);
  return source && target
    ? { ...relation, sourceId: source, targetId: target }
    : null;
}

function sorted<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
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

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

const EQUIVALENCE = new Set<PublicRelation["type"]>([
  "identity_continues",
  "identity_instance_of"
]);
const LINEAGE = new Set<PublicRelation["type"]>([
  "identity_splits",
  "identity_merges"
]);

function subjectId(worldId: string, canonId: string, anchorId: string): string {
  const value = createHash("sha256")
    .update(`moirai-subject:${worldId}:${canonId}:${anchorId}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  value[12] = "5";
  value[16] = ((Number.parseInt(value[16]!, 16) & 0x3) | 0x8).toString(16);
  const compact = value.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function components(
  events: readonly PublicEvent[],
  relations: readonly EventRelation[]
): string[][] {
  const parent = new Map(events.map((event) => [event.id, event.id]));
  const find = (id: string): string => {
    const next = parent.get(id)!;
    if (next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  for (const relation of relations) {
    if (!parent.has(relation.sourceId) || !parent.has(relation.targetId))
      continue;
    const left = find(relation.sourceId);
    const right = find(relation.targetId);
    if (left !== right) {
      const [first, second] = [left, right].sort();
      parent.set(second!, first!);
    }
  }
  const result = new Map<string, string[]>();
  for (const event of events) {
    const root = find(event.id);
    const values = result.get(root) ?? [];
    values.push(event.id);
    result.set(root, values);
  }
  return [...result.values()]
    .map((values) => values.sort())
    .sort((left, right) => left[0]!.localeCompare(right[0]!));
}

export function projectSubjects(
  view: CanonicalRevisionView,
  revision: number,
  previous: readonly SubjectHandleRecord[] = []
): SubjectProjectionBundle {
  const handles: SubjectHandleRecord[] = [];
  const projections: PublicSubjectProjection[] = [];
  for (const canon of sorted(view.canons)) {
    const events = sorted(
      view.events.filter((event) => event.canon_id === canon.id)
    );
    const eventIds = new Set(events.map((event) => event.id));
    const identity = view.relations
      .filter(
        (relation) =>
          relation.canon_id === canon.id &&
          (EQUIVALENCE.has(relation.type) || LINEAGE.has(relation.type))
      )
      .map(asEventRelation)
      .filter((relation): relation is EventRelation => Boolean(relation))
      .filter(
        (relation) =>
          eventIds.has(relation.sourceId) && eventIds.has(relation.targetId)
      );
    const equivalence = identity.filter((relation) =>
      EQUIVALENCE.has(relation.type)
    );
    const involved = new Set(
      identity.flatMap((relation) => [relation.sourceId, relation.targetId])
    );
    const groups = components(events, equivalence).filter((group) =>
      group.some(
        (id) =>
          involved.has(id) ||
          previous.some((handle) => handle.member_event_ids.includes(id))
      )
    );
    const handleByEvent = new Map<string, SubjectHandleRecord>();
    for (const group of groups) {
      const prior = previous
        .filter(
          (handle) =>
            handle.canon_id === canon.id &&
            handle.status !== "redirected" &&
            group.some((id) => handle.member_event_ids.includes(id))
        )
        .sort(
          (left, right) =>
            left.created_revision - right.created_revision ||
            left.id.localeCompare(right.id)
        )[0];
      const anchor =
        prior && group.includes(prior.anchor_event_id)
          ? prior.anchor_event_id
          : group[0]!;
      const handle: SubjectHandleRecord = {
        id: prior?.id ?? subjectId(view.world.id, canon.id, anchor),
        canon_id: canon.id,
        anchor_event_id: anchor,
        status: "active",
        redirect_to: null,
        created_revision: prior?.created_revision ?? revision,
        projection_revision: revision,
        member_event_ids: group
      };
      handles.push(handle);
      for (const id of group) handleByEvent.set(id, handle);
    }
    const lineage = identity.flatMap((relation) => {
      if (!LINEAGE.has(relation.type)) return [];
      const source = handleByEvent.get(relation.sourceId);
      const target = handleByEvent.get(relation.targetId);
      return source && target && source.id !== target.id
        ? [
            {
              relation_id: relation.id,
              type: relation.type as "identity_splits" | "identity_merges",
              source_subject_handle_id: source.id,
              target_subject_handle_id: target.id
            }
          ]
        : [];
    });
    for (const handle of handles.filter((item) => item.canon_id === canon.id)) {
      const members = new Set(handle.member_event_ids);
      const anchor = events.find(
        (event) => event.id === handle.anchor_event_id
      )!;
      const relationIds = equivalence
        .filter(
          (relation) =>
            members.has(relation.sourceId) && members.has(relation.targetId)
        )
        .map((relation) => relation.id)
        .sort();
      const narrativeIds = view.narratives
        .filter(
          (narrative) =>
            narrative.scope_type === "event" && members.has(narrative.scope_id)
        )
        .map((narrative) => narrative.id)
        .sort();
      const incoming = lineage.filter(
        (edge) => edge.target_subject_handle_id === handle.id
      );
      const outgoing = lineage.filter(
        (edge) => edge.source_subject_handle_id === handle.id
      );
      const evidence = [
        ...handle.member_event_ids,
        ...relationIds,
        ...narrativeIds,
        ...incoming.map((edge) => edge.relation_id),
        ...outgoing.map((edge) => edge.relation_id)
      ].sort();
      const semantic = {
        world_id: view.world.id,
        source_revision: revision,
        projection_type: "subject" as const,
        algorithm_version: SUBJECT_ALGORITHM_VERSION,
        parameters_digest: digest({ canon_id: canon.id }),
        canon_id: canon.id,
        subject_handle_id: handle.id,
        anchor_event_id: handle.anchor_event_id,
        label: anchor.title,
        label_evidence_event_id: anchor.id,
        member_event_ids: handle.member_event_ids,
        identity_relation_ids: relationIds,
        instance_relation_ids: equivalence
          .filter(
            (relation) =>
              relation.type === "identity_instance_of" &&
              relationIds.includes(relation.id)
          )
          .map((relation) => relation.id),
        lineage: { incoming, outgoing },
        narrative_ids: narrativeIds,
        time_ranges: [],
        evidence,
        diagnostics: [],
        completeness: "complete" as const
      };
      projections.push({ ...semantic, semantic_digest: digest(semantic) });
    }
  }
  return {
    handles: sorted(handles),
    projections: [...projections].sort((left, right) =>
      left.subject_handle_id.localeCompare(right.subject_handle_id)
    )
  };
}

function narrativeText(
  view: CanonicalRevisionView,
  scope: "canon" | "event",
  id: string
): string {
  return view.narratives
    .filter((item) => item.scope_type === scope && item.scope_id === id)
    .map((item) => `${item.title ?? ""} ${item.body}`)
    .join(" ")
    .trim();
}

function publicView(view: CanonicalRevisionView): CanonicalRevisionView {
  return {
    world: {
      id: view.world.id,
      slug: view.world.slug,
      title: view.world.title,
      description: view.world.description
    },
    canons: view.canons.map(({ id, world_id, slug, title, description }) => ({
      id,
      world_id,
      slug,
      title,
      description
    })),
    timeSystems: view.timeSystems.map(
      ({
        id,
        world_id,
        slug,
        title,
        kind,
        definition_version,
        definition
      }) => ({
        id,
        world_id,
        slug,
        title,
        kind,
        definition_version,
        definition
      })
    ),
    canonTimeSystems: view.canonTimeSystems.map(
      ({ id, canon_id, time_system_id }) => ({
        id,
        canon_id,
        time_system_id
      })
    ),
    events: view.events.map(
      ({ id, canon_id, slug, kind, title, summary, roles, attributes }) => ({
        id,
        canon_id,
        slug,
        kind,
        title,
        summary,
        roles,
        attributes
      })
    ),
    relations: view.relations.map(
      ({
        id,
        canon_id,
        type,
        source_ref,
        target_ref,
        direction,
        attributes
      }) => ({
        id,
        canon_id,
        type,
        source_ref,
        target_ref,
        direction,
        attributes
      })
    ),
    narratives: view.narratives.map(
      ({
        id,
        canon_id,
        scope_type,
        scope_id,
        locale,
        kind,
        title,
        body,
        public_references
      }) => ({
        id,
        canon_id,
        scope_type,
        scope_id,
        locale,
        kind,
        title,
        body,
        public_references: public_references.map(({ label, url }) => ({
          label,
          url
        }))
      })
    )
  };
}

function searchEntries(
  view: CanonicalRevisionView,
  revision: number,
  subjects: readonly PublicSubjectProjection[]
): PublicSearchEntry[] {
  const entries: PublicSearchEntry[] = [
    {
      target_id: view.world.id,
      target_type: "world",
      canonical_url: `/worlds/${view.world.id}`,
      world_id: view.world.id,
      canon_id: null,
      title: view.world.title,
      text: `${view.world.title} ${view.world.description ?? ""}`.trim(),
      served_revision: revision
    }
  ];
  for (const canon of sorted(view.canons))
    entries.push({
      target_id: canon.id,
      target_type: "canon",
      canonical_url: `/worlds/${view.world.id}/canons/${canon.id}`,
      world_id: view.world.id,
      canon_id: canon.id,
      title: canon.title,
      text: `${canon.title} ${canon.description ?? ""} ${narrativeText(view, "canon", canon.id)}`.trim(),
      served_revision: revision
    });
  for (const event of sorted(view.events))
    entries.push({
      target_id: event.id,
      target_type:
        event.kind === "composite" && event.roles.includes("process")
          ? "process"
          : "event",
      canonical_url: `/worlds/${view.world.id}/canons/${event.canon_id}/events/${event.id}`,
      world_id: view.world.id,
      canon_id: event.canon_id,
      title: event.title,
      text: `${event.title} ${event.summary ?? ""} ${narrativeText(view, "event", event.id)}`.trim(),
      served_revision: revision
    });
  for (const subject of subjects)
    entries.push({
      target_id: subject.subject_handle_id,
      target_type: "subject",
      canonical_url: `/worlds/${view.world.id}/canons/${subject.canon_id}/subjects/${subject.subject_handle_id}`,
      world_id: view.world.id,
      canon_id: subject.canon_id,
      title: subject.label,
      text: subject.label,
      served_revision: revision
    });
  return entries;
}

export function projectPublicDocuments(
  source: CanonicalRevisionView,
  revision: number,
  generatedAt: string,
  suppliedSubjects?: SubjectProjectionBundle
): readonly ProjectionDocument[] {
  const view = publicView(source);
  const subjects = suppliedSubjects ?? projectSubjects(view, revision);
  const prefix = `worlds/${view.world.id}/revisions/${revision}`;
  const metadata = {
    world_id: view.world.id,
    served_revision: revision,
    generated_at: generatedAt
  };
  const canons = sorted(view.canons);
  const events = sorted(view.events);
  const relations = sorted(view.relations);
  const narratives = sorted(view.narratives);
  const systems = sorted(view.timeSystems);
  const temporal = new Map(
    canons.map((canon) => [
      canon.id,
      projectRelationalTime(view, revision, canon.id, subjects.projections)
    ])
  );
  const documents: ProjectionDocument[] = [
    {
      key: `${prefix}/world.json`,
      value: {
        ...metadata,
        world: view.world,
        canons,
        search_key: `${prefix}/search/en.json`
      }
    }
  ];
  for (const canon of canons) {
    const projection = temporal.get(canon.id)!;
    documents.push(
      {
        key: `${prefix}/graph/canons/${canon.id}/temporal.json`,
        value: { ...metadata, ...projection }
      },
      {
        key: `${prefix}/canons/${canon.id}.json`,
        value: {
          ...metadata,
          canon,
          narratives: narratives.filter(
            (item) => item.scope_type === "canon" && item.scope_id === canon.id
          ),
          events: events.filter((event) => event.canon_id === canon.id),
          time_systems: systems.filter((system) =>
            view.canonTimeSystems.some(
              (link) =>
                link.canon_id === canon.id && link.time_system_id === system.id
            )
          ),
          temporal_artifact: {
            key: `${prefix}/graph/canons/${canon.id}/temporal.json`,
            algorithm_version: projection.algorithm_version
          },
          subject_artifacts: subjects.projections
            .filter((subject) => subject.canon_id === canon.id)
            .map((subject) => ({
              subject_handle_id: subject.subject_handle_id,
              key: `${prefix}/subjects/${subject.subject_handle_id}.json`,
              label: subject.label,
              member_count: subject.member_event_ids.length,
              algorithm_version: subject.algorithm_version,
              completeness: subject.completeness
            }))
        }
      }
    );
  }
  for (const event of events) {
    const eventRelations = relations.filter(
      (relation) =>
        endpointEventId(relation.source_ref) === event.id ||
        endpointEventId(relation.target_ref) === event.id
    );
    const relatedIds = new Set(
      eventRelations.flatMap((relation) =>
        [
          endpointEventId(relation.source_ref),
          endpointEventId(relation.target_ref)
        ].filter((id): id is string => Boolean(id))
      )
    );
    relatedIds.delete(event.id);
    documents.push({
      key: `${prefix}/events/${event.id}.json`,
      value: {
        ...metadata,
        event,
        narratives: narratives.filter(
          (item) => item.scope_type === "event" && item.scope_id === event.id
        ),
        temporal_artifact: {
          key: `${prefix}/graph/canons/${event.canon_id}/temporal.json`
        },
        time_systems: systems.filter((system) =>
          view.canonTimeSystems.some(
            (link) =>
              link.canon_id === event.canon_id &&
              link.time_system_id === system.id
          )
        ),
        relations: eventRelations,
        related_events: events.filter((candidate) =>
          relatedIds.has(candidate.id)
        ),
        subject_handle_ids: subjects.projections
          .filter((subject) => subject.member_event_ids.includes(event.id))
          .map((subject) => subject.subject_handle_id)
      }
    });
  }
  for (const subject of subjects.projections)
    documents.push({
      key: `${prefix}/subjects/${subject.subject_handle_id}.json`,
      value: {
        ...metadata,
        handle:
          subjects.handles.find(
            (candidate) => candidate.id === subject.subject_handle_id
          ) ?? null,
        canonical_url: `/worlds/${view.world.id}/canons/${subject.canon_id}/subjects/${subject.subject_handle_id}`,
        redirect_url: null,
        subject
      }
    });
  documents.push({
    key: `${prefix}/search/en.json`,
    value: {
      ...metadata,
      locale: "en",
      entries: searchEntries(view, revision, subjects.projections)
    }
  });
  return documents;
}
