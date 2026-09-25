/** v5 facts adapted to the unchanged URDR renderer's private presentation contract.
 * canonId below is a World plane token, never canonical ownership. */
import { readV5ServedRoot, readV5StagedDocument } from "@moirai/publication/v5";
import { readPublicationObject } from "./publication";
import { createV5StagedAtroposReader } from "./v5-staged-reader";
import type {
  EventDetailResponse,
  GraphShellChartPlaneEntity
} from "../urdr-port/shared/contracts";

export async function v5ShellReader(worldId: string) {
  const objects = new Map<string, ReturnType<typeof readPublicationObject>>();
  const store = {
    get: (key: string) => {
      let value = objects.get(key);
      if (!value) {
        if (objects.size >= 1024) throw Error("v5_shell_read_budget");
        value = readPublicationObject(key);
        objects.set(key, value);
      }
      return value;
    }
  };
  const { pointer, rootBody } = await readV5ServedRoot(store, worldId);
  const reader = createV5StagedAtroposReader(
    store,
    rootBody,
    worldId,
    pointer.served_revision
  );
  const events = new Map<string, ReturnType<typeof reader.event>>();
  const event = (id: string) => {
    let value = events.get(id);
    if (!value) {
      value = reader.event(id);
      events.set(id, value);
    }
    return value;
  };
  const detail = async (id: string, page = 0): Promise<EventDetailResponse> => {
    const item = await event(id);
    if (!item) throw Error("v5_event_missing");
    const children = item.composite
      ? await reader.compositeChildren(id, page)
      : null;
    const related = await Promise.all(
      (children?.child_event_ids ?? []).map(async (child) => ({
        id: child,
        label: (await event(child))?.event.title ?? child,
        sourceKind: "structural" as const
      }))
    );
    const position = item.position as typeof item.position & {
      display_label?: string;
      time_event?: { coordinate: string };
    };
    const narrative = item.narrative;
    const childLinks = related.map((child) => ({
      label: child.label,
      href: `/graph/v5?world=${worldId}&event=${child.id}`
    }));
    if (children && page + 1 < children.page_count)
      childLinks.push({
        label: "다음 하위 사건",
        href: `/graph/v5?world=${worldId}&event=${id}&readPage=${page + 1}`
      });
    if (children && page > 0)
      childLinks.unshift({
        label: "이전 하위 사건",
        href: `/graph/v5?world=${worldId}&event=${id}&readPage=${page - 1}`
      });
    const adjacency =
      page < item.adjacency_page_count
        ? await reader.adjacency(id, page)
        : null;
    const relations = await Promise.all(
      (adjacency?.relation_ids ?? []).map(reader.relation)
    );
    const existingLinks = new Set(childLinks.map((link) => link.href));
    for (const relation of relations) {
      if (!relation || relation.type === "contains") continue;
      const outgoing =
        relation.source_ref.kind === "event" &&
        relation.source_ref.event_id === id;
      const other = outgoing ? relation.target_ref : relation.source_ref;
      if (other.kind !== "event") continue;
      const href = `/graph/v5?world=${worldId}&event=${other.event_id}`;
      if (existingLinks.has(href)) continue;
      existingLinks.add(href);
      const neighbor = await event(other.event_id);
      if (neighbor)
        childLinks.push({
          label: `${relation.type} ${outgoing ? "→" : "←"} ${neighbor.event.title}`,
          href
        });
    }
    if (
      adjacency?.next_page !== null &&
      adjacency?.next_page !== undefined &&
      !children
    )
      childLinks.push({
        label: "다음 연결",
        href: `/graph/v5?world=${worldId}&event=${id}&readPage=${adjacency.next_page}`
      });
    return {
      id,
      canonId: worldId,
      type: item.composite ? "composite-event" : "historical-event",
      title: item.event.title,
      chronologySummary:
        position.time_event?.coordinate ?? position.display_label ?? "",
      notes: "",
      participantEventIds: related.map((child) => child.id),
      figureHandleIds: [],
      contextEventIds: [],
      placeEvents: [],
      people: [],
      causeEvents: [],
      resultEvents: [],
      ...(childLinks.length
        ? {
            readingLinks: {
              label: item.composite ? "하위 사건과 연결" : "연결된 사건",
              items: childLinks
            }
          }
        : {}),
      narrativeSections: [
        {
          canonId: worldId,
          canonLabel: "World",
          narratives: [
            {
              id: narrative.id,
              locale: narrative.locale,
              kind: "primary",
              title: narrative.title,
              body: narrative.body,
              publicReferences: narrative.public_references.map((ref) => ({
                label: ref.label,
                url: ref.url
              }))
            },
            ...narrative.notes.map((note, index) => ({
              id: `${narrative.id}:note:${index}`,
              locale: narrative.locale,
              kind: "annotation" as const,
              title: note.title,
              body: note.body,
              publicReferences: note.public_references.map((ref) => ({
                label: ref.label,
                url: ref.url
              }))
            }))
          ]
        }
      ],
      readingContext: {
        scopeLabel: "World",
        stableEventHref: `/graph/events/${worldId}/${id}?revision=${pointer.served_revision}`,
        observation: item.position.kind === "unplaced" ? "미배치 사건" : ""
      }
    };
  };
  const shape = async (
    value: Awaited<ReturnType<typeof reader.viewport>>["shapes"][number]
  ): Promise<GraphShellChartPlaneEntity> => {
    const item = await event(value.event_id);
    if (!item) throw Error("v5_event_missing");
    const base = {
      id: value.event_id,
      eventId: value.event_id,
      canonId: worldId,
      label: item.event.title,
      validationState: "ok" as const,
      contains: [] as string[],
      diagnostics: [],
      viewportClass: "visible" as const
    };
    if (value.kind === "point")
      return { ...base, geometryKind: "point", position: value.position };
    if (value.kind === "segment")
      return {
        ...base,
        geometryKind: "segment",
        start: value.start,
        end: value.end
      };
    const children = await reader.compositeChildren(value.event_id, 0);
    return {
      ...base,
      contains: [...(children?.child_event_ids ?? [])],
      geometryKind: "region",
      worldBounds: value.bounds
    };
  };
  const edges = async (entities: readonly GraphShellChartPlaneEntity[]) => {
    const points = new Map(
      entities
        .filter((item) => item.geometryKind === "point")
        .map((item) => [item.eventId, item])
    );
    const ids = [...points.keys()].slice(0, 64);
    let truncated = points.size > ids.length;
    const relationIds = new Set<string>();
    for (const id of ids) {
      const page = await reader.adjacency(id, 0);
      if (page?.next_page !== null && page?.next_page !== undefined)
        truncated = true;
      for (const relationId of page?.relation_ids ?? [])
        relationIds.add(relationId);
    }
    const selectedIds = [...relationIds].sort().slice(0, 256);
    if (selectedIds.length < relationIds.size) truncated = true;
    const result: GraphShellChartPlaneEntity[] = [];
    for (const id of selectedIds) {
      const relation = await reader.relation(id);
      if (
        !relation ||
        relation.type === "contains" ||
        relation.source_ref.kind !== "event" ||
        relation.target_ref.kind !== "event"
      )
        continue;
      const source = points.get(relation.source_ref.event_id);
      const target = points.get(relation.target_ref.event_id);
      if (source?.geometryKind !== "point" || target?.geometryKind !== "point")
        continue;
      result.push({
        id: relation.id,
        eventId: source.eventId,
        canonId: worldId,
        label: relation.type,
        geometryKind: "segment",
        validationState: "ok",
        contains: [source.id, target.id],
        diagnostics: [],
        viewportClass: "visible",
        start: source.position,
        end: target.position
      });
    }
    return { edges: result, truncated };
  };
  const collectionDetail = async (
    id: string,
    page = 0
  ): Promise<EventDetailResponse> => {
    const item = await reader.collection(id, page);
    if (!item) throw Error("v5_collection_missing");
    const members = await Promise.all(
      item.event_ids.map(async (eventId) => ({
        label: (await event(eventId))?.event.title ?? eventId,
        href: `/graph/v5?world=${worldId}&event=${eventId}&collections=${id}`
      }))
    );
    if (item.next_page !== null)
      members.push({
        label: "다음 사건",
        href: `/graph/v5?world=${worldId}&collection=${id}&readPage=${item.next_page}`
      });
    if (page > 0)
      members.unshift({
        label: "이전 사건",
        href: `/graph/v5?world=${worldId}&collection=${id}&readPage=${page - 1}`
      });
    return {
      id: `collection:${id}`,
      canonId: worldId,
      type: "collection",
      title: item.collection.title,
      notes: "",
      participantEventIds: [],
      figureHandleIds: [],
      contextEventIds: [],
      placeEvents: [],
      people: [],
      causeEvents: [],
      resultEvents: [],
      narrativeSections: [
        {
          canonId: id,
          canonLabel: "Collection",
          narratives: [
            {
              id: item.narrative.id,
              locale: item.narrative.locale,
              title: item.narrative.title,
              body: item.narrative.body,
              kind: "primary",
              publicReferences: [...item.narrative.public_references]
            },
            ...item.narrative.notes.map((note, index) => ({
              id: `${item.narrative.id}:note:${index}`,
              locale: item.narrative.locale,
              title: note.title,
              body: note.body,
              kind: "annotation" as const,
              publicReferences: [...note.public_references]
            }))
          ]
        }
      ],
      readingLinks: { label: "포함된 사건", items: members },
      readingContext: {
        scopeLabel: "Collection",
        stableEventHref: null,
        observation: `${item.member_count} Events`
      }
    };
  };
  const memberships = async (id: string, collectionIds: readonly string[]) => {
    const matches = await Promise.all(
      collectionIds.map(async (collectionId) => {
        const body = await readV5StagedDocument(
          rootBody,
          `worlds/${worldId}/revisions/${pointer.served_revision}/v5/content/event-selection/${id}/${collectionId}.json`,
          async (key) => (await store.get(key)).body
        );
        return body === null ? null : collectionId;
      })
    );
    return matches.filter((id): id is string => id !== null);
  };
  return {
    reader,
    pointer,
    rootBody,
    store,
    event,
    detail,
    shape,
    memberships,
    collectionDetail,
    edges
  };
}
