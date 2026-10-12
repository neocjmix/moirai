import type { LabCamera } from "../../apps/atropos-web/src/labs/layout/preset.js";
import type { TstlProjection } from "../../packages/graph-presentation/src/tstl-validator.js";

export interface ViewEvent {
  eventId: string;
  x: number;
  referenceY: number;
  collectionIds: readonly string[];
}
export interface TstlViewState {
  mode: "A" | "B0";
  camera: LabCamera;
  selectedEventId: string | null;
  activeCollectionIds: string[];
  scopeCompositeIds: string[];
  collapsedPathKeys: string[];
  shownEventIds: string[];
  hiddenEventIds: string[];
}
export type OmissionReason =
  | "scope-filtered"
  | "path-collapsed"
  | "user-hidden"
  | "unplaced"
  | "outside-viewport";
export const pathKey = (parentId: string, childId: string) =>
  JSON.stringify([parentId, childId]);

/** An edge is a view path handle, never a new contains assertion. Walking the
 * DAG once preserves a shared Event reached through any other open path. */
export function reachableThroughOpenPaths(
  projection: TstlProjection,
  collapsedPathKeys: readonly string[]
): Set<string> {
  const blocked = new Set(collapsedPathKeys);
  const reached = new Set<string>();
  const pending = projection.eventIds.filter(
    (id) => !projection.parents[id]?.length
  );
  while (pending.length) {
    const id = pending.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const childId of projection.children[id] ?? [])
      if (!blocked.has(pathKey(id, childId))) pending.push(childId);
  }
  return reached;
}

export function inspectView(
  events: readonly ViewEvent[],
  projection: TstlProjection,
  state: TstlViewState
) {
  const collections = new Set(state.activeCollectionIds);
  const reached = reachableThroughOpenPaths(
    projection,
    state.collapsedPathKeys
  );
  const shown = new Set(state.shownEventIds);
  const hidden = new Set(state.hiddenEventIds);
  const { camera } = state;
  return events.map((event) => {
    const reasons: OmissionReason[] = [];
    if (!event.collectionIds.some((id) => collections.has(id)))
      reasons.push("scope-filtered");
    if (!reached.has(event.eventId) && !shown.has(event.eventId))
      reasons.push("path-collapsed");
    if (hidden.has(event.eventId)) reasons.push("user-hidden");
    if (!Number.isFinite(event.x) || !Number.isFinite(event.referenceY))
      reasons.push("unplaced");
    else if (
      Math.abs(event.x - camera.x) > camera.spanX / 2 ||
      Math.abs(event.referenceY - camera.y) > camera.spanY / 2
    )
      reasons.push("outside-viewport");
    return {
      eventId: event.eventId,
      visible: reasons.length === 0,
      reasons,
      reason: reasons[0] ?? null,
      revealRoute: `event:${event.eventId}`
    };
  });
}

export function switchComparison(
  state: TstlViewState,
  mode: TstlViewState["mode"]
): TstlViewState {
  return { ...state, mode };
}

/** Explicit reveal restores access, without changing the source or unfolding
 * other paths. A pin is dormant again when every Collection is turned off. */
export function revealEvent(
  state: TstlViewState,
  event: ViewEvent,
  focus = true
): TstlViewState {
  const hasCollection = event.collectionIds.some((id) =>
    state.activeCollectionIds.includes(id)
  );
  return {
    ...state,
    selectedEventId: event.eventId,
    activeCollectionIds: hasCollection
      ? state.activeCollectionIds
      : [...new Set([...state.activeCollectionIds, ...event.collectionIds])],
    shownEventIds: [...new Set([...state.shownEventIds, event.eventId])],
    hiddenEventIds: state.hiddenEventIds.filter((id) => id !== event.eventId),
    camera:
      focus && Number.isFinite(event.x) && Number.isFinite(event.referenceY)
        ? { ...state.camera, x: event.x, y: event.referenceY }
        : state.camera
  };
}

/** Counts are unique World leaf IDs projected onto the chosen Composite set;
 * Collections are an independent selection and never become contains. */
export function exactSignatureRows(
  projection: TstlProjection,
  scopeCompositeIds: readonly string[]
) {
  const groups = new Map<string, { signature: string[]; eventIds: string[] }>();
  const scope = [...new Set(scopeCompositeIds)].sort();
  for (const eventId of projection.leafIds) {
    const signature = scope.filter((id) =>
      projection.ancestors[eventId]?.includes(id)
    );
    const key = JSON.stringify(signature);
    let group = groups.get(key);
    if (!group) {
      group = { signature, eventIds: [] };
      groups.set(key, group);
    }
    group.eventIds.push(eventId);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, count: group.eventIds.length }))
    .sort(
      (a, b) =>
        b.signature.length - a.signature.length ||
        JSON.stringify(a.signature).localeCompare(JSON.stringify(b.signature))
    );
}
