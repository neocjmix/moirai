import type { EventDetailResponse } from "../urdr-port/shared/contracts";
import { graphSpatialQueryContext } from "./graph-spatial-query";
import {
  readGraphEventNarratives,
  readGraphRevision
} from "./graph-revision-source";
import { buildGraphUrlSearch } from "./moirai-graph-source-query";
import { moiraiSpatialReader } from "./moirai-spatial";
import { eventReadingSearch } from "./event-reading-navigation";
export async function graphSpatialDetail(
  state: unknown,
  id: string
): Promise<EventDetailResponse> {
  const { input, state: validated } = await graphSpatialQueryContext(state);
  const scope = input.scopes.find(
    (s) => s.nodes.some((n) => n.id === id) || s.links.some((l) => l.id === id)
  );
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
  const event = eventId ? snapshot.events.find((e) => e.id === eventId) : null;
  const narratives = eventId
    ? await readGraphEventNarratives(
        revision.manifest,
        source.canon_id,
        eventId
      )
    : [];
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
    ? `/worlds/${source.world_id}/events/${eventId}${eventReadingSearch(source.served_revision, returnSearch)}`
    : null;
  const position = eventId
    ? snapshot.temporal.positions.find((p) => p.event_id === eventId)
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
    ...narratives.flatMap((n) => [
      n.title ? `## ${n.title}` : "",
      n.body,
      ...n.public_references.map((ref) => `[${ref.label}](${ref.url})`)
    ])
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    id,
    canonId: scope.id,
    type: event?.kind === "composite" ? "historical-event" : "historical-event",
    title,
    notes,
    readingContext: {
      scopeLabel: `${revision.world.title} · ${snapshot.canon.title}`,
      stableEventHref: stable,
      observation: `World: ${source.world_id}\nRevision ${source.served_revision}\nCanon: ${source.canon_id}\n\n${JSON.stringify(detail, null, 2)}`
    },
    participantEventIds: [],
    figureHandleIds: [],
    contextEventIds: [],
    chronologySummary:
      position?.display_label ??
      (node?.reference.kind === "time_event"
        ? node.reference.coordinate
        : "시점은 아직 정해지지 않았습니다 / Time unresolved"),
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
