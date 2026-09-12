import type { EventDetailResponse } from "../urdr-port/shared/contracts";
import { graphSpatialQueryContext } from "./graph-spatial-query";
import {
  readGraphEventNarratives,
  readGraphRevision
} from "./graph-revision-source";
import { buildGraphUrlSearch } from "./moirai-graph-source-query";
import { moiraiSpatialReader } from "./moirai-spatial";
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
    ? `/worlds/${source.world_id}/events/${eventId}?${new URLSearchParams({ revision: String(source.served_revision), mq: new URLSearchParams(returnSearch).get("mq")! })}`
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
    stable ? `[${"Open stable Event"}](${stable})` : "",
    `World: ${source.world_id}\n\nRevision: ${source.served_revision}\n\nCanon: ${source.canon_id}`,
    meta?.unplaced.includes(id)
      ? "No supported geometry is available. The Event and its evidence remain available below."
      : "",
    ...narratives.flatMap((n) => [
      n.title,
      n.body,
      ...n.public_references.map((ref) => `[${ref.label}](${ref.url})`)
    ]),
    "```json",
    JSON.stringify(detail, null, 2),
    "```"
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    id,
    canonId: scope.id,
    type: event?.kind === "composite" ? "historical-event" : "historical-event",
    title,
    notes,
    participantEventIds: [],
    figureHandleIds: [],
    contextEventIds: [],
    chronologySummary: `Revision ${source.served_revision} · ${source.canon_id}`,
    placeEvents: [],
    people: [],
    causeEvents: [],
    resultEvents: []
  };
}
