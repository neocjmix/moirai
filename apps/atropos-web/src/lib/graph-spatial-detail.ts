import type { EventDetailResponse } from "../urdr-port/shared/contracts";
import { graphSpatialQueryContext } from "./graph-spatial-query";
import {
  readGraphEventNarratives,
  readGraphRevision
} from "./graph-revision-source";
import { buildGraphUrlSearch } from "./moirai-graph-source-query";
import { moiraiSpatialReader } from "./moirai-spatial";
import { graphEventHref } from "./event-reading-navigation";
import { eventTimeSummary } from "./event-time-summary";
export async function graphSpatialDetail(
  state: unknown,
  id: string
): Promise<EventDetailResponse> {
  const { input, state: validated } = await graphSpatialQueryContext(state);
  const matchingScopes = input.scopes.filter(
    (s) => s.nodes.some((n) => n.id === id) || s.links.some((l) => l.id === id)
  );
  const scope = matchingScopes[0];
  if (!scope) throw Error("graph_identity_outside_query");
  const node = scope.nodes.find((n) => n.id === id);
  const link = scope.links.find((l) => l.id === id);
  const source = scope.source;
  const revision = await readGraphRevision(
    source.world_id,
    source.served_revision
  );
  const snapshot = revision.snapshots.find(
    (s) => s.canon.id === source.canon_id
  )!;
  const eventId =
    node?.reference.kind === "event" ? node.reference.event_id : null;
  const eventScopes = eventId
    ? matchingScopes.filter((candidate) =>
        candidate.nodes.some(
          (candidateNode) =>
            candidateNode.id === id &&
            candidateNode.reference.kind === "event" &&
            candidateNode.reference.event_id === eventId
        )
      )
    : [scope];
  const canonIds = eventScopes.map((candidate) => candidate.source.canon_id);
  const selectedSnapshots = canonIds.flatMap((canonId) => {
    const selected = revision.snapshots.find(
      (candidate) => candidate.canon.id === canonId
    );
    return selected ? [selected] : [];
  });
  const event = eventId ? snapshot.events.find((e) => e.id === eventId) : null;
  const narratives = eventId
    ? await readGraphEventNarratives(revision.manifest, canonIds, eventId)
    : [];
  const narrativeSections = selectedSnapshots.flatMap((selected) => {
    const selectedNarratives = narratives.filter(
      (narrative) => narrative.canon_id === selected.canon.id
    );
    return selectedNarratives.length
      ? [
          {
            canonId: selected.canon.id,
            canonLabel: selected.canon.title,
            narratives: selectedNarratives.map((narrative) => ({
              id: narrative.id,
              locale: narrative.locale,
              kind: narrative.kind,
              title: narrative.title,
              body: narrative.body,
              publicReferences: [...narrative.public_references]
            }))
          }
        ]
      : [];
  });
  const relations = eventId
    ? snapshot.temporal.relations.filter(
        (r) =>
          (r.source_ref.kind === "event" &&
            r.source_ref.event_id === eventId) ||
          (r.target_ref.kind === "event" && r.target_ref.event_id === eventId)
      )
    : link
      ? [link.relation]
      : [];
  const meta = await moiraiSpatialReader.scope(source).catch(() => null);
  const focus = eventId
    ? {
        kind: "event" as const,
        ...source,
        event_ref: { kind: "event" as const, event_id: eventId }
      }
    : null;
  const returnSearch = buildGraphUrlSearch("", { ...validated, focus });
  const stable = eventId
    ? graphEventHref({
        worldId: source.world_id,
        eventId,
        revision: source.served_revision,
        canonId: source.canon_id,
        graphSearch: returnSearch
      })
    : null;
  const detail = {
    source,
    identity: node?.reference ?? {
      kind: "relation",
      relation_id: link!.relation.id
    },
    event: event ?? null,
    relation: link?.relation ?? null,
    temporal_position: eventId
      ? (snapshot.temporal.positions.find((p) => p.event_id === eventId) ??
        null)
      : node?.reference,
    relations,
    composite: eventId
      ? (snapshot.temporal.composites.find((c) => c.event_id === eventId) ??
        null)
      : null,
    narratives,
    subjects: eventId
      ? snapshot.subjects.filter((s) =>
          s.subject?.member_event_ids.includes(eventId)
        )
      : [],
    geometry_status: meta?.unplaced.includes(id) ? "unplaced" : "presentation",
    diagnostics:
      meta?.diagnostics.filter(
        (d) =>
          d.affected_ids.includes(id) ||
          (eventId && d.affected_ids.includes(eventId))
      ) ?? []
  };
  const title = event?.title ?? node?.label ?? link?.relation.type ?? id;
  const notes = [
    narratives.length ? "" : event?.summary,
    meta?.unplaced.includes(id)
      ? "No supported geometry is available. The Event and its evidence remain available below."
      : "",
    ...narratives
      .filter((n) => n.kind !== "annotation")
      .flatMap((n) => [n.title ? `## ${n.title}` : "", n.body])
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    id,
    canonId: scope.id,
    type: event?.kind === "composite" ? "historical-event" : "historical-event",
    title,
    notes,
    narrativeSections,
    readingContext: {
      scopeLabel: `${revision.world.title} · ${selectedSnapshots.map((selected) => selected.canon.title).join(" / ")}`,
      stableEventHref: stable,
      observation: `World: ${source.world_id}\nRevision ${source.served_revision}\nCanon: ${source.canon_id}\n\n${JSON.stringify(detail, null, 2)}`
    },
    participantEventIds: [],
    figureHandleIds: [],
    contextEventIds: [],
    chronologySummary: eventId
      ? eventTimeSummary(snapshot.temporal, snapshot.events, eventId)
      : node?.reference.kind === "time_event"
        ? node.reference.coordinate
        : "시점은 아직 정해지지 않았습니다 / Time unresolved",
    placeEvents: [],
    people: [],
    causeEvents: relations.flatMap((relation) => {
      if (
        relation.type !== "causes" ||
        relation.source_ref.kind !== "event" ||
        relation.target_ref.kind !== "event" ||
        relation.target_ref.event_id !== eventId
      )
        return [];
      const cause = snapshot.events.find(
        (candidate) =>
          candidate.id ===
          (relation.source_ref.kind === "event"
            ? relation.source_ref.event_id
            : null)
      );
      return cause ? [{ id: cause.id, label: cause.title }] : [];
    }),
    resultEvents: relations.flatMap((relation) => {
      if (
        relation.type !== "causes" ||
        relation.source_ref.kind !== "event" ||
        relation.target_ref.kind !== "event" ||
        relation.source_ref.event_id !== eventId
      )
        return [];
      const effect = snapshot.events.find(
        (candidate) =>
          candidate.id ===
          (relation.target_ref.kind === "event"
            ? relation.target_ref.event_id
            : null)
      );
      return effect ? [{ id: effect.id, label: effect.title }] : [];
    })
  };
}
