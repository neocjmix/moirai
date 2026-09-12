import type {
  CanonicalEventReference,
  MoiraiGraphDiagnostic,
  MoiraiGraphEvent,
  MoiraiGraphQueryResult,
  MoiraiGraphRelation,
  MoiraiGraphSourceAddress,
  MoiraiGraphTemporalPosition
} from "@moirai/contracts";

/** Downstream-only, rebuildable presentation input. Not a canonical API. */
export const PRESENTATION_INPUT_VERSION = "moirai-urdr-input/1";

export interface PresentationNode {
  readonly id: string;
  readonly identityKey: string;
  readonly reference: CanonicalEventReference;
  readonly shape: "point" | "region" | "anchor";
  readonly label: string;
  readonly visible: boolean;
  readonly contains: readonly string[];
  /** A shared Event's first merged position is NEVER applied to every Canon. */
  readonly temporalPosition: MoiraiGraphTemporalPosition | null;
}

export interface PresentationLink {
  readonly id: string;
  readonly identityKey: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly relation: MoiraiGraphRelation;
}

export interface PresentationScope {
  readonly id: string;
  readonly source: MoiraiGraphSourceAddress;
  readonly nodes: readonly PresentationNode[];
  readonly links: readonly PresentationLink[];
}

export interface PresentationInput {
  readonly algorithmVersion: typeof PRESENTATION_INPUT_VERSION;
  readonly scopes: readonly PresentationScope[];
  /** Complete v3 semantic result. Geometry must not overwrite this sidecar. */
  readonly sidecar: MoiraiGraphQueryResult;
  readonly diagnostics: readonly MoiraiGraphDiagnostic[];
}

const key = (parts: readonly (string | number)[]) =>
  encodeURIComponent(JSON.stringify(parts));

export function presentationIdentityKey(
  worldId: string,
  ref: CanonicalEventReference
): string {
  return ref.kind === "event"
    ? key([worldId, "event", ref.event_id])
    : key([
        worldId,
        "time_event",
        ref.time_system_ref.time_system_id,
        ref.definition_version,
        ref.coordinate
      ]);
}

export function presentationScopeKey(source: MoiraiGraphSourceAddress): string {
  return key([source.world_id, source.served_revision, source.canon_id]);
}

export function presentationNodeId(
  source: MoiraiGraphSourceAddress,
  ref: CanonicalEventReference
): string {
  const prefix = ref.kind === "time_event" ? "t_anchor_" : "m_event_";
  return (
    prefix +
    key([
      presentationScopeKey(source),
      presentationIdentityKey(source.world_id, ref)
    ])
  );
}

export function projectPresentationInput(
  result: MoiraiGraphQueryResult
): PresentationInput {
  if (result.contract_version !== 3)
    throw new Error("m46_unsupported_graph_result_version");
  const diagnostics: MoiraiGraphDiagnostic[] = [...result.diagnostics];
  const scopes: PresentationScope[] = [];
  const report = (
    code: string,
    source: MoiraiGraphSourceAddress,
    ids: readonly string[],
    message: string
  ) => {
    diagnostics.push({
      code,
      severity: "warning",
      source,
      affected_ids: [...ids].sort(),
      message
    });
  };
  const seenScopes = new Set<string>();
  for (const querySource of result.query.sources) {
    for (const canonId of querySource.canon_ids) {
      const source = {
        world_id: querySource.world_id,
        served_revision: querySource.served_revision,
        canon_id: canonId
      };
      const id = presentationScopeKey(source);
      if (seenScopes.has(id)) continue;
      seenScopes.add(id);
      if (
        !result.revision_vector.some(
          (r) =>
            r.world_id === source.world_id &&
            r.served_revision === source.served_revision
        )
      ) {
        report(
          "m46_source_revision_missing",
          source,
          [],
          "No matching pinned Revision; this scope is not drawable."
        );
        continue;
      }
      const events = result.events.filter(
        (e) =>
          e.world_id === source.world_id &&
          e.served_revision === source.served_revision &&
          e.matched_canon_ids.includes(canonId) &&
          e.canon_memberships.includes(canonId)
      );
      const eventById = new Map(events.map((e) => [e.id, e]));
      const nodes = new Map<string, PresentationNode>();
      const children = new Map<string, Set<string>>();
      const relations = result.relations
        .filter(
          (r) =>
            r.world_id === source.world_id &&
            r.served_revision === source.served_revision &&
            r.matched_canon_ids.includes(canonId) &&
            r.canon_memberships.includes(canonId)
        )
        .toSorted((a, b) => a.id.localeCompare(b.id));
      for (const relation of relations) {
        if (
          relation.type !== "contains" ||
          relation.source_ref.kind !== "event" ||
          relation.target_ref.kind !== "event"
        )
          continue;
        const members =
          children.get(relation.source_ref.event_id) ?? new Set<string>();
        members.add(relation.target_ref.event_id);
        children.set(relation.source_ref.event_id, members);
      }
      // Composite metadata is Canon-context evidence; during/boundary links do
      // not manufacture membership, unlike the legacy semantic-link shortcut.
      for (const composite of result.composites) {
        if (
          composite.world_id !== source.world_id ||
          composite.served_revision !== source.served_revision ||
          composite.canon_id !== canonId
        )
          continue;
        const members = children.get(composite.event_id) ?? new Set<string>();
        for (const child of composite.direct_child_event_ids)
          members.add(child);
        children.set(composite.event_id, members);
      }
      for (const event of events.toSorted((a, b) => a.id.localeCompare(b.id))) {
        const ref = { kind: "event" as const, event_id: event.id };
        const shared = event.matched_canon_ids.length > 1;
        if (shared)
          report(
            "m46_context_time_requires_resolution",
            source,
            [event.id],
            "Merged v3 temporal position is not a Canon-specific fact. Resolve this Canon's Relations before layout."
          );
        if (event.temporal_position.kind === "unplaced")
          report(
            "m46_event_unplaced",
            source,
            [event.id],
            "No drawable time is asserted. Original reason and evidence remain in the semantic sidecar."
          );
        const childRefs = [...(children.get(event.id) ?? [])].sort();
        const missing = childRefs.filter((child) => !eventById.has(child));
        if (missing.length)
          report(
            "m46_containment_partial",
            source,
            [event.id, ...missing],
            "Some child geometry is outside the result; membership remains in the sidecar."
          );
        const node: PresentationNode = {
          id: presentationNodeId(source, ref),
          identityKey: presentationIdentityKey(source.world_id, ref),
          reference: ref,
          shape: event.event_kind === "composite" ? "region" : "point",
          label: event.title,
          visible: true,
          contains: childRefs
            .filter((child) => eventById.has(child))
            .map((child) =>
              presentationNodeId(source, { kind: "event", event_id: child })
            ),
          temporalPosition: shared ? null : event.temporal_position
        };
        nodes.set(node.id, node);
      }
      const ensureEndpoint = (ref: CanonicalEventReference): string | null => {
        const nodeId = presentationNodeId(source, ref);
        if (nodes.has(nodeId)) return nodeId;
        if (ref.kind === "event") return null;
        const system = querySource.time_systems.find(
          (t) =>
            t.time_system_id === ref.time_system_ref.time_system_id &&
            t.definition_version === ref.definition_version
        );
        if (!system) return null;
        nodes.set(nodeId, {
          id: nodeId,
          identityKey: presentationIdentityKey(source.world_id, ref),
          reference: ref,
          shape: "anchor",
          label: ref.coordinate,
          visible: result.query.entity_filter.include_virtual_time_events,
          contains: [],
          temporalPosition: { kind: "exact", at: ref, evidence_ids: [] }
        });
        return nodeId;
      };
      for (const virtual of result.virtual_time_events) {
        if (
          virtual.world_id === source.world_id &&
          virtual.served_revision === source.served_revision &&
          virtual.canon_id === canonId
        )
          ensureEndpoint(virtual.reference);
      }
      const links: PresentationLink[] = [];
      for (const relation of relations) {
        const sourceId = ensureEndpoint(relation.source_ref);
        const targetId = ensureEndpoint(relation.target_ref);
        if (!sourceId || !targetId) {
          report(
            "m46_relation_endpoint_unavailable",
            source,
            [relation.id],
            "Relation omitted from geometry because a scoped endpoint is unavailable; the complete assertion remains in the sidecar."
          );
          continue;
        }
        links.push({
          id: "m_relation_" + key([id, relation.id]),
          identityKey: key([source.world_id, "relation", relation.id]),
          sourceId,
          targetId,
          relation
        });
      }
      for (const [kind, entries] of Object.entries({
        subjects: result.subjects,
        states: result.states,
        narratives: result.narratives
      })) {
        const items = entries.filter(
          (e) =>
            e.world_id === source.world_id &&
            e.served_revision === source.served_revision &&
            e.canon_id === canonId
        );
        if (items.length)
          report(
            "m46_sidecar_only",
            source,
            items.map((e) =>
              "id" in e
                ? e.id
                : "composite_event_id" in e
                  ? e.composite_event_id
                  : e.subject_handle_id
            ),
            `${kind} have no independent URDR geometry; all fields remain available through the semantic sidecar and inspector.`
          );
      }
      scopes.push({
        id,
        source,
        nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
        links
      });
    }
  }
  return {
    algorithmVersion: PRESENTATION_INPUT_VERSION,
    scopes,
    sidecar: result,
    diagnostics
  };
}

/** Stable lookup never depends on the displayed Canon instance or label. */
export function findPresentationEvent(
  input: PresentationInput,
  instanceId: string
): MoiraiGraphEvent | null {
  for (const scope of input.scopes) {
    const node = scope.nodes.find((n) => n.id === instanceId);
    if (node?.reference.kind === "event") {
      const eventId = node.reference.event_id;
      return (
        input.sidecar.events.find(
          (e) =>
            e.world_id === scope.source.world_id &&
            e.served_revision === scope.source.served_revision &&
            e.id === eventId
        ) ?? null
      );
    }
  }
  return null;
}
