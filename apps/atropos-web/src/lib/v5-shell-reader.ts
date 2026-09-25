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
  const detail = async (id: string): Promise<EventDetailResponse> => {
    const item = await event(id);
    if (!item) throw Error("v5_event_missing");
    const children = item.composite
      ? await reader.compositeChildren(id, 0)
      : null;
    const related = await Promise.all(
      (children?.child_event_ids ?? []).map(async (child) => ({
        id: child,
        label: (await event(child))?.event.title ?? child,
        sourceKind: "structural" as const
      }))
    );
    const narrative = item.narrative;
    return {
      id,
      canonId: worldId,
      type: item.composite ? "composite-event" : "historical-event",
      title: item.event.title,
      notes: "",
      participantEventIds: related.map((child) => child.id),
      figureHandleIds: [],
      contextEventIds: [],
      placeEvents: [],
      people: [],
      causeEvents: [],
      resultEvents: [],
      ...(related.length
        ? {
            readingLinks: {
              label: "하위 사건",
              items: related.map((child) => ({
                label: child.label,
                href: `/graph/v5?world=${worldId}&event=${child.id}`
              }))
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
        stableEventHref: `/graph/v5?world=${worldId}&event=${id}`,
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
  const collectionDetail = async (id: string): Promise<EventDetailResponse> => {
    const item = await reader.collection(id, 0);
    if (!item) throw Error("v5_collection_missing");
    const members = await Promise.all(
      item.event_ids.map(async (eventId) => ({
        label: (await event(eventId))?.event.title ?? eventId,
        href: `/graph/v5?world=${worldId}&event=${eventId}&collections=${id}`
      }))
    );
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
            }
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
    collectionDetail
  };
}
