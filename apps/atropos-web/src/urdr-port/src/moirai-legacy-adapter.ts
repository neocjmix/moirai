import type {
  MoiraiGraphLegacyLoss,
  MoiraiGraphQueryResult,
  MoiraiLegacyViewportAdapter
} from "@moirai/contracts";
import type {
  GraphShellChartPlaneEntity,
  GraphShellViewportResponse
} from "@urdr/contracts";

export const MOIRAI_LEGACY_ADAPTER_VERSION = "moirai-to-urdr-viewport/1";
export const LEGACY_VIEWPORT_CELL_LIMIT = 2_500;

export type MoiraiLegacyViewportModel = GraphShellViewportResponse;

function sourceId(worldId: string, id: string) {
  return `${worldId}:${id}`;
}

function eventPosition(
  event: MoiraiGraphQueryResult["events"][number],
  index: number,
  worldIndex: number
) {
  const rank =
    event.temporal_position.kind === "relative_only" ||
    event.temporal_position.kind === "mixed"
      ? event.temporal_position.rank
      : index;
  return { x: worldIndex * 520 + (index % 4) * 112, y: rank * 96 };
}

export const adaptMoiraiGraphToLegacyViewport: MoiraiLegacyViewportAdapter<
  MoiraiLegacyViewportModel
> = (result) => {
  const losses: MoiraiGraphLegacyLoss[] = [];
  const maximum = Math.min(
    LEGACY_VIEWPORT_CELL_LIMIT,
    Math.max(1, result.query.budget.max_entities)
  );
  const returnedEvents = result.events.slice(0, maximum);
  const worldIds = [
    ...new Set(result.revision_vector.map((entry) => entry.world_id))
  ];
  const pointByKey = new Map<string, GraphShellChartPlaneEntity>();

  for (const [index, event] of returnedEvents.entries()) {
    const canonId = event.matched_canon_ids[0] ?? event.canon_memberships[0];
    if (!canonId) {
      losses.push({
        kind: "omitted",
        semantic_kind: "event",
        source_ids: [sourceId(event.world_id, event.id)],
        reason_code: "legacy_event_has_no_canon_slot",
        message: "The legacy viewport requires one display Canon slot."
      });
      continue;
    }
    const key = sourceId(event.world_id, event.id);
    pointByKey.set(key, {
      id: key,
      eventId: event.id,
      canonId,
      label: event.title,
      geometryKind: "point",
      validationState: "ok",
      contains: [],
      diagnostics: [],
      viewportClass: "visible",
      position: eventPosition(
        event,
        index,
        Math.max(0, worldIds.indexOf(event.world_id))
      )
    });
    if (event.canon_memberships.length > 1) {
      losses.push({
        kind: "approximated",
        semantic_kind: "event",
        source_ids: [key],
        reason_code: "legacy_single_canon_display_slot",
        message:
          "All Canon memberships remain canonical; the viewport displays one matched Canon slot."
      });
    }
  }

  if (result.events.length > returnedEvents.length) {
    losses.push({
      kind: "omitted",
      semantic_kind: "event",
      source_ids: [
        `${result.revision_vector.map((entry) => entry.world_id).join("+")}:query:event-overflow:${result.events.length - returnedEvents.length}`
      ],
      reason_code: "legacy_visible_cell_budget",
      message: `The legacy viewport is bounded to ${maximum} Event cells.`
    });
  }

  const edges: GraphShellChartPlaneEntity[] = [];
  for (const relation of result.relations) {
    if (
      relation.source_ref.kind !== "event" ||
      relation.target_ref.kind !== "event"
    ) {
      losses.push({
        kind: "unsupported",
        semantic_kind: "relation",
        source_ids: [sourceId(relation.world_id, relation.id)],
        reason_code: "legacy_virtual_time_endpoint",
        message:
          "The legacy viewport cannot render virtual Time Event endpoints."
      });
      continue;
    }
    const source = pointByKey.get(
      sourceId(relation.world_id, relation.source_ref.event_id)
    );
    const target = pointByKey.get(
      sourceId(relation.world_id, relation.target_ref.event_id)
    );
    if (
      !source ||
      !target ||
      source.geometryKind !== "point" ||
      target.geometryKind !== "point"
    ) {
      losses.push({
        kind: "omitted",
        semantic_kind: "relation",
        source_ids: [sourceId(relation.world_id, relation.id)],
        reason_code: "legacy_endpoint_outside_visible_budget",
        message:
          "At least one Relation endpoint is outside the visible Event budget."
      });
      continue;
    }
    edges.push({
      id: sourceId(relation.world_id, relation.id),
      eventId: relation.id,
      canonId: relation.matched_canon_ids[0] ?? relation.canon_memberships[0]!,
      label: relation.type.toUpperCase(),
      geometryKind: "segment",
      validationState: "ok",
      contains: [source.eventId, target.eventId],
      diagnostics: [],
      viewportClass: "visible",
      start: source.position,
      end: target.position
    });
    losses.push({
      kind: "approximated",
      semantic_kind: "relation",
      source_ids: [sourceId(relation.world_id, relation.id)],
      reason_code: "legacy_relation_geometry_noncanonical",
      message: "Viewport edge geometry is presentational and not canonical."
    });
  }

  const omittedGroups: readonly [
    MoiraiGraphLegacyLoss["semantic_kind"],
    readonly { readonly id?: string; readonly world_id: string }[],
    string
  ][] = [
    [
      "virtual_time_event",
      result.virtual_time_events,
      "legacy_virtual_time_event_unsupported"
    ],
    [
      "subject",
      result.subjects.map((item) => ({ ...item, id: item.subject_handle_id })),
      "legacy_subject_lane_unsupported"
    ],
    [
      "composite",
      result.composites.map((item) => ({ ...item, id: item.event_id })),
      "legacy_composite_evidence_unsupported"
    ],
    [
      "state",
      result.states.map((item, index) => ({
        ...item,
        id: `${item.composite_event_id}:${item.subject_handle_id}:${item.state_family}:${index}`
      })),
      "legacy_state_unsupported"
    ],
    ["narrative", result.narratives, "legacy_narrative_body_unsupported"],
    ["evidence", result.evidence, "legacy_evidence_unsupported"]
  ];
  for (const [semanticKind, items, reasonCode] of omittedGroups) {
    if (items.length === 0) continue;
    losses.push({
      kind: "unsupported",
      semantic_kind: semanticKind,
      source_ids: items.map((item, index) =>
        sourceId(item.world_id, item.id ?? `${semanticKind}:${index}`)
      ),
      reason_code: reasonCode,
      message: `The legacy viewport does not represent ${semanticKind}.`
    });
  }
  if (result.diagnostics.length > 0) {
    losses.push({
      kind: "omitted",
      semantic_kind: "diagnostic",
      source_ids: result.diagnostics.flatMap((item) => item.affected_ids),
      reason_code: "legacy_diagnostic_text_fallback",
      message: "Canonical diagnostics remain in the query island text fallback."
    });
  }

  const primaryRevision = result.revision_vector[0]?.served_revision ?? 0;
  return {
    viewport_model: {
      revision: primaryRevision,
      canonicalRevision: primaryRevision,
      lodLevel: result.query.budget.detail_level === "overview" ? 0 : 1,
      entities: [...pointByKey.values()],
      edges,
      regions: [],
      diagnostics: losses.map((loss) => ({
        code: loss.reason_code,
        severity: loss.kind === "unsupported" ? "warning" : "warning",
        message: loss.message
      })),
      truncated:
        result.budget.truncated || result.events.length > returnedEvents.length,
      cache: { stale: false },
      ...(result.budget.next_scope_hint ? { nextSuggestedLod: 1 } : {})
    },
    loss_report: {
      source_contract_version: result.contract_version,
      adapter_version: MOIRAI_LEGACY_ADAPTER_VERSION,
      losses,
      lossless: losses.length === 0
    }
  };
};
