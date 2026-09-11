import type {
  CanonicalEventReference,
  MoiraiGraphEvent,
  MoiraiGraphQueryResult,
  MoiraiGraphRelation,
  MoiraiGraphTimeEvent
} from "@moirai/contracts";

export const MOIRAI_GRAPH_VISIBLE_NODE_CAP = 2_500;

export type MoiraiLayoutNode = {
  readonly key: string;
  readonly worldId: string;
  readonly entityId: string;
  readonly kind: "event" | "time_event";
  readonly title: string;
  readonly detail: string;
  readonly placementKind:
    "exact" | "bounded" | "relative_only" | "mixed" | "unplaced" | "time_event";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly event: MoiraiGraphEvent | null;
  readonly timeEvent: MoiraiGraphTimeEvent | null;
};

export type MoiraiLayoutEdge = {
  readonly key: string;
  readonly relation: MoiraiGraphRelation;
  readonly sourceKey: string;
  readonly targetKey: string;
};

export type MoiraiLayoutLane = {
  readonly key: string;
  readonly label: string;
  readonly x: number;
};

export type MoiraiLayoutRegion = {
  readonly key: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly completeness: string;
};

export type MoiraiGraphLayout = {
  readonly nodes: readonly MoiraiLayoutNode[];
  readonly edges: readonly MoiraiLayoutEdge[];
  readonly lanes: readonly MoiraiLayoutLane[];
  readonly regions: readonly MoiraiLayoutRegion[];
  readonly width: number;
  readonly height: number;
  readonly omittedNodeCount: number;
  readonly omittedRelationCount: number;
  readonly diagnostics: readonly string[];
};

const NODE_WIDTH = 176;
const NODE_HEIGHT = 68;
const X_GAP = 220;
const Y_GAP = 116;
const MARGIN_X = 150;
const MARGIN_Y = 120;

export function graphEventKey(worldId: string, eventId: string): string {
  return `${worldId}:event:${eventId}`;
}

export function graphTimeReferenceKey(
  worldId: string,
  reference: Extract<CanonicalEventReference, { kind: "time_event" }>
): string {
  return [
    worldId,
    "time_event",
    reference.time_system_ref.time_system_id,
    reference.definition_version,
    reference.coordinate
  ].join(":");
}

function endpointKey(
  worldId: string,
  reference: CanonicalEventReference
): string {
  return reference.kind === "event"
    ? graphEventKey(worldId, reference.event_id)
    : graphTimeReferenceKey(worldId, reference);
}

function positionDetail(event: MoiraiGraphEvent): string {
  const position = event.temporal_position;
  if (position.kind === "exact")
    return position.at.kind === "time_event"
      ? `exact · ${position.at.coordinate}`
      : `exact · ${position.at.event_id}`;
  if (position.kind === "bounded") {
    const lower =
      position.lower?.kind === "time_event" ? position.lower.coordinate : null;
    const upper =
      position.upper?.kind === "time_event" ? position.upper.coordinate : null;
    return `bounded · ${lower ?? "−∞"} … ${upper ?? "+∞"}`;
  }
  if (position.kind === "relative_only")
    return `relative-only · rank ${position.rank}`;
  if (position.kind === "mixed")
    return `mixed · rank ${position.rank} · ${position.bounds.length} bounds`;
  return `unplaced · ${position.reason_code}`;
}

function positionSortKey(event: MoiraiGraphEvent): string {
  const position = event.temporal_position;
  if (position.kind === "exact")
    return `0:${position.at.kind === "time_event" ? position.at.coordinate : position.at.event_id}`;
  if (position.kind === "bounded") {
    const lower =
      position.lower?.kind === "time_event" ? position.lower.coordinate : "";
    return `1:${lower}:${event.id}`;
  }
  if (position.kind === "relative_only")
    return `2:${position.component_id}:${String(position.rank).padStart(12, "0")}`;
  if (position.kind === "mixed")
    return `3:${position.component_id}:${String(position.rank).padStart(12, "0")}`;
  return `4:${position.reason_code}:${event.id}`;
}

function eventLaneKeys(result: MoiraiGraphQueryResult): Map<string, string> {
  const keys = new Map<string, string>();
  for (const subject of result.subjects)
    for (const eventId of subject.member_event_ids) {
      const key = graphEventKey(subject.world_id, eventId);
      if (!keys.has(key))
        keys.set(
          key,
          `subject:${subject.world_id}:${subject.subject_handle_id}`
        );
    }
  for (const event of result.events) {
    const key = graphEventKey(event.world_id, event.id);
    if (!keys.has(key)) keys.set(key, `world:${event.world_id}`);
  }
  return keys;
}

export function layoutMoiraiGraph(
  result: MoiraiGraphQueryResult,
  cap = MOIRAI_GRAPH_VISIBLE_NODE_CAP
): MoiraiGraphLayout {
  const safeCap = Math.max(0, Math.min(MOIRAI_GRAPH_VISIBLE_NODE_CAP, cap));
  const uniqueEvents = [
    ...new Map(
      result.events.map((event) => [
        graphEventKey(event.world_id, event.id),
        event
      ])
    ).values()
  ].toSorted((left, right) =>
    `${positionSortKey(left)}:${left.world_id}:${left.id}`.localeCompare(
      `${positionSortKey(right)}:${right.world_id}:${right.id}`
    )
  );
  const uniqueTimes = [
    ...new Map(
      result.virtual_time_events.map((event) => [
        graphTimeReferenceKey(event.world_id, event.reference),
        event
      ])
    ).values()
  ].toSorted((left, right) =>
    graphTimeReferenceKey(left.world_id, left.reference).localeCompare(
      graphTimeReferenceKey(right.world_id, right.reference)
    )
  );
  const visibleEvents = uniqueEvents.slice(0, safeCap);
  const visibleTimes = uniqueTimes.slice(
    0,
    Math.max(0, safeCap - visibleEvents.length)
  );
  const laneKeyByEvent = eventLaneKeys(result);
  const laneLabels = new Map<string, string>();
  for (const subject of result.subjects)
    laneLabels.set(
      `subject:${subject.world_id}:${subject.subject_handle_id}`,
      `Subject · ${subject.label}`
    );
  for (const revision of result.revision_vector)
    laneLabels.set(
      `world:${revision.world_id}`,
      `World ${revision.world_id.slice(0, 8)} · r${revision.served_revision}`
    );
  const orderedLaneKeys = [
    ...new Set(
      visibleEvents.map((event) =>
        laneKeyByEvent.get(graphEventKey(event.world_id, event.id))!
      )
    )
  ].toSorted();
  const laneIndex = new Map(orderedLaneKeys.map((key, index) => [key, index]));
  const lanes = orderedLaneKeys.map((key, index) => ({
    key,
    label: laneLabels.get(key) ?? key,
    x: MARGIN_X + index * X_GAP
  }));
  const placementOffsets = {
    exact: 0,
    bounded: 1,
    relative_only: 2,
    mixed: 3,
    unplaced: 4
  } as const;
  const counters = new Map<string, number>();
  const nodes: MoiraiLayoutNode[] = visibleEvents.map((event) => {
    const laneKey = laneKeyByEvent.get(
      graphEventKey(event.world_id, event.id)
    )!;
    const bucket = `${event.temporal_position.kind}:${laneKey}`;
    const index = counters.get(bucket) ?? 0;
    counters.set(bucket, index + 1);
    const band = placementOffsets[event.temporal_position.kind];
    return {
      key: graphEventKey(event.world_id, event.id),
      worldId: event.world_id,
      entityId: event.id,
      kind: "event" as const,
      title: event.title,
      detail: positionDetail(event),
      placementKind: event.temporal_position.kind,
      x: MARGIN_X + (laneIndex.get(laneKey) ?? 0) * X_GAP,
      y: MARGIN_Y + band * 320 + index * Y_GAP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      event,
      timeEvent: null
    };
  });
  const timeStartX = MARGIN_X + Math.max(orderedLaneKeys.length, 1) * X_GAP;
  visibleTimes.forEach((event, index) =>
    nodes.push({
      key: graphTimeReferenceKey(event.world_id, event.reference),
      worldId: event.world_id,
      entityId: event.id,
      kind: "time_event",
      title: event.reference.coordinate,
      detail: `${event.reference.time_system_ref.time_system_id} · virtual`,
      placementKind: "time_event",
      x: timeStartX,
      y: MARGIN_Y + index * 92,
      width: 154,
      height: 54,
      event: null,
      timeEvent: event
    })
  );
  const nodeByKey = new Map(nodes.map((node) => [node.key, node]));
  const uniqueRelations = [
    ...new Map(
      result.relations.map((relation) => [
        `${relation.world_id}:relation:${relation.id}`,
        relation
      ])
    ).values()
  ];
  const edges: MoiraiLayoutEdge[] = [];
  let omittedRelationCount = 0;
  for (const relation of uniqueRelations) {
    const sourceKey = endpointKey(relation.world_id, relation.source_ref);
    const targetKey = endpointKey(relation.world_id, relation.target_ref);
    if (!nodeByKey.has(sourceKey) || !nodeByKey.has(targetKey)) {
      omittedRelationCount += 1;
      continue;
    }
    edges.push({
      key: `${relation.world_id}:relation:${relation.id}`,
      relation,
      sourceKey,
      targetKey
    });
  }
  const regions: MoiraiLayoutRegion[] = [];
  for (const composite of result.composites) {
    const members = composite.descendant_event_ids
      .map((id) => nodeByKey.get(graphEventKey(composite.world_id, id)))
      .filter((node): node is MoiraiLayoutNode => Boolean(node));
    const self = nodeByKey.get(
      graphEventKey(composite.world_id, composite.event_id)
    );
    if (self) members.push(self);
    if (members.length === 0) continue;
    const minX = Math.min(...members.map((node) => node.x)) - 28;
    const minY = Math.min(...members.map((node) => node.y)) - 34;
    const maxX = Math.max(...members.map((node) => node.x + node.width)) + 28;
    const maxY = Math.max(...members.map((node) => node.y + node.height)) + 34;
    regions.push({
      key: `${composite.world_id}:${composite.canon_id}:${composite.event_id}`,
      label: `Composite · ${self?.title ?? composite.event_id}`,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      completeness: composite.completeness
    });
  }
  const omittedNodeCount =
    uniqueEvents.length + uniqueTimes.length - nodes.length;
  const diagnostics = [
    ...(omittedNodeCount > 0
      ? [`visible_node_cap: ${omittedNodeCount} nodes omitted after ${safeCap}`]
      : []),
    ...(omittedRelationCount > 0
      ? [`endpoint_outside_scope: ${omittedRelationCount} relations omitted`]
      : []),
    ...(result.budget.truncated
      ? [
          `query_budget_truncated: ${result.budget.next_scope_hint ?? "narrow scope"}`
        ]
      : []),
    ...result.compatibility
      .filter((item) => item.status !== "native" || !item.lossless)
      .map((item) => `compatibility:${item.status}:${item.reason_code}`),
    ...result.diagnostics.map((item) => `${item.code}: ${item.message}`)
  ];
  const width = Math.max(960, timeStartX + 360);
  const height = Math.max(
    720,
    ...nodes.map((node) => node.y + node.height + 180),
    ...regions.map((region) => region.y + region.height + 120)
  );
  return {
    nodes,
    edges,
    lanes,
    regions,
    width,
    height,
    omittedNodeCount,
    omittedRelationCount,
    diagnostics
  };
}
