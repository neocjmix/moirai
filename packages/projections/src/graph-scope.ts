import type {
  PublicGraphScopeArtifact,
  PublicGraphScopeLink,
  PublicGraphScopeNode,
  PublicRelationalTemporalProjection,
  PublicTemporalPosition
} from "@moirai/contracts";
import { endpointEventId, temporalAdapterRegistry } from "@moirai/domain";
import { createHash } from "node:crypto";
import type { CanonicalRevisionView } from "./index.js";

export const GRAPH_SCOPE_ALGORITHM_VERSION = "event-relational-graph-scope/2";

const MAX_CELLS = 1000;
const MAX_LABELS = 250;
const MAX_NODES = 200;
const COLUMN_GAP = 208;
const ROW_GAP = 128;

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

const eventCellId = (eventId: string) => `event:${eventId}`;
const relationCellId = (relationId: string) => `relation:${relationId}`;

/**
 * Builds a bounded, deterministic Canon overview. Coordinates are explicitly
 * presentation-only stable positions; vertical chronology is a later layout
 * algorithm and no inferred position is exported as authored time.
 */
export function projectCanonGraphScope(
  view: CanonicalRevisionView,
  revision: number,
  canonId: string,
  temporal: PublicRelationalTemporalProjection
): PublicGraphScopeArtifact {
  const sourceEvents = view.events
    .filter((event) => event.canon_memberships.includes(canonId))
    .sort((left, right) => left.id.localeCompare(right.id));
  const sourceRelations = view.relations
    .filter((relation) => relation.canon_memberships?.includes(canonId))
    .flatMap((relation) => {
      const source = endpointEventId(relation.source_ref);
      const target = endpointEventId(relation.target_ref);
      return source && target ? [{ relation, source, target }] : [];
    })
    .sort((left, right) => left.relation.id.localeCompare(right.relation.id));
  const selectedEvents = sourceEvents.slice(0, MAX_NODES);
  const selectedIds = new Set(selectedEvents.map((event) => event.id));
  const positions = new Map(
    temporal.positions.map((position) => [position.event_id, position])
  );
  const chronology = chronologyLayout(
    selectedEvents.map((event) => event.id),
    inputTemporalEdges(temporal, selectedIds),
    positions,
    temporal
  );
  const nodes: PublicGraphScopeNode[] = selectedEvents.map((event) => ({
    cell_id: eventCellId(event.id),
    event_id: event.id,
    title: event.title,
    kind: event.kind,
    roles: [...event.roles].sort(),
    x: 96 + chronology.get(event.id)!.column * COLUMN_GAP,
    y: 88 + chronology.get(event.id)!.rank * ROW_GAP,
    layout_basis: "inferred_chronology",
    chronology: chronology.get(event.id)!.public,
    canonical_url: `/worlds/${view.world.id}/canons/${canonId}/events/${event.id}`,
    evidence: [event.id]
  }));
  const linkBudget = MAX_CELLS - nodes.length;
  const eligibleRelations = sourceRelations.filter(
    ({ source, target }) => selectedIds.has(source) && selectedIds.has(target)
  );
  const links: PublicGraphScopeLink[] = eligibleRelations
    .slice(0, linkBudget)
    .map(({ relation, source, target }) => ({
      cell_id: relationCellId(relation.id),
      relation_id: relation.id,
      type: relation.type,
      direction: relation.direction,
      source_event_id: source,
      target_event_id: target,
      source_cell_id: eventCellId(source),
      target_cell_id: eventCellId(target),
      evidence: [relation.id, source, target].sort()
    }));
  const parameters = {
    canon_id: canonId,
    scope: "canon",
    lod: "overview",
    max_cells: MAX_CELLS,
    max_labels: MAX_LABELS
  };
  const semantic = {
    world_id: view.world.id,
    canon_id: canonId,
    source_revision: revision,
    served_revision: revision,
    projection_type: "graph_scope" as const,
    algorithm_version: GRAPH_SCOPE_ALGORITHM_VERSION,
    parameters_digest: digest(parameters),
    scope: { kind: "canon" as const, id: canonId },
    lod: "overview" as const,
    nodes,
    links,
    source_counts: {
      events: sourceEvents.length,
      event_relations: sourceRelations.length
    },
    budget: {
      max_cells: MAX_CELLS as 1000,
      max_labels: MAX_LABELS as 250,
      visible_cells: nodes.length + links.length,
      visible_labels: nodes.length
    },
    truncated:
      nodes.length < sourceEvents.length ||
      links.length < eligibleRelations.length,
    next_scope_hint:
      nodes.length < sourceEvents.length ||
      links.length < eligibleRelations.length
        ? "Choose a focus Event to request a narrower neighborhood scope."
        : null
  };
  return { ...semantic, semantic_digest: digest(semantic) };
}

interface OrderingEdge {
  readonly source: string;
  readonly target: string;
  readonly evidence: readonly string[];
}

function inputTemporalEdges(
  temporal: PublicRelationalTemporalProjection,
  selected: ReadonlySet<string>
): OrderingEdge[] {
  return temporal.relations.flatMap((relation) => {
    if (
      relation.type !== "precedes" &&
      relation.type !== "not_after" &&
      relation.type !== "coincides"
    )
      return [];
    const source = endpointEventId(relation.source_ref);
    const target = endpointEventId(relation.target_ref);
    if (!source || !target || !selected.has(source) || !selected.has(target))
      return [];
    const forward = { source, target, evidence: [relation.id] };
    return relation.type === "coincides"
      ? [forward, { source: target, target: source, evidence: [relation.id] }]
      : [forward];
  });
}

function coordinateKey(position: PublicTemporalPosition): {
  system: string;
  version: string;
  lower: { coordinate: string; inclusive: boolean } | null;
  upper: { coordinate: string; inclusive: boolean } | null;
} | null {
  if (position.kind === "exact" && position.time_event)
    return {
      system: position.time_event.time_system_ref.time_system_id,
      version: position.time_event.definition_version,
      lower: { coordinate: position.time_event.coordinate, inclusive: true },
      upper: { coordinate: position.time_event.coordinate, inclusive: true }
    };
  if (position.kind !== "bounded") return null;
  const system = position.lower?.time_event ?? position.upper?.time_event;
  if (!system) return null;
  return {
    system: system.time_system_ref.time_system_id,
    version: system.definition_version,
    lower: position.lower
      ? {
          coordinate: position.lower.time_event.coordinate,
          inclusive: position.lower.inclusive
        }
      : null,
    upper: position.upper
      ? {
          coordinate: position.upper.time_event.coordinate,
          inclusive: position.upper.inclusive
        }
      : null
  };
}

function chronologyLayout(
  eventIds: readonly string[],
  authoredEdges: readonly OrderingEdge[],
  positions: ReadonlyMap<string, PublicTemporalPosition>,
  temporal: PublicRelationalTemporalProjection
): Map<
  string,
  {
    column: number;
    rank: number;
    public: PublicGraphScopeNode["chronology"];
  }
> {
  const registry = temporalAdapterRegistry(temporal.time_systems);
  const coordinates = new Map(
    eventIds.flatMap((id) => {
      const value = positions.get(id);
      const key = value && coordinateKey(value);
      return key && registry.get(key.system, key.version)?.compare
        ? [[id, key] as const]
        : [];
    })
  );
  const edges = [...authoredEdges];
  for (let leftIndex = 0; leftIndex < eventIds.length; leftIndex++) {
    const leftId = eventIds[leftIndex]!;
    const left = coordinates.get(leftId);
    if (!left) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < eventIds.length;
      rightIndex++
    ) {
      const rightId = eventIds[rightIndex]!;
      const right = coordinates.get(rightId);
      if (
        !right ||
        left.system !== right.system ||
        left.version !== right.version
      )
        continue;
      const compare = registry.get(left.system, left.version)?.compare;
      if (!compare) continue;
      const before = (
        upper: { coordinate: string; inclusive: boolean } | null,
        lower: { coordinate: string; inclusive: boolean } | null
      ) => {
        if (!upper || !lower) return false;
        const order = compare(upper.coordinate, lower.coordinate);
        return (
          order < 0 || (order === 0 && (!upper.inclusive || !lower.inclusive))
        );
      };
      const leftBefore = before(left.upper, right.lower);
      const rightBefore = before(right.upper, left.lower);
      if (leftBefore)
        edges.push({
          source: leftId,
          target: rightId,
          evidence: positions
            .get(leftId)!
            .source_constraint_ids.concat(
              positions.get(rightId)!.source_constraint_ids
            )
        });
      if (rightBefore)
        edges.push({
          source: rightId,
          target: leftId,
          evidence: positions
            .get(leftId)!
            .source_constraint_ids.concat(
              positions.get(rightId)!.source_constraint_ids
            )
        });
    }
  }

  const neighbors = new Map(eventIds.map((id) => [id, new Set<string>()]));
  for (const edge of edges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }
  for (const [leftId, left] of coordinates)
    for (const [rightId, right] of coordinates)
      if (
        leftId !== rightId &&
        left.system === right.system &&
        left.version === right.version
      ) {
        neighbors.get(leftId)!.add(rightId);
        neighbors.get(rightId)!.add(leftId);
      }

  const components: string[][] = [];
  const seen = new Set<string>();
  for (const start of eventIds) {
    if (seen.has(start)) continue;
    const members: string[] = [];
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor]!;
      if (seen.has(id)) continue;
      seen.add(id);
      members.push(id);
      queue.push(...[...(neighbors.get(id) ?? [])].sort());
    }
    components.push(members.sort());
  }
  components.sort((left, right) => left[0]!.localeCompare(right[0]!));

  const result = new Map<
    string,
    {
      column: number;
      rank: number;
      public: PublicGraphScopeNode["chronology"];
    }
  >();
  let componentColumn = 0;
  components.forEach((members) => {
    const memberSet = new Set(members);
    const componentEdges = edges.filter(
      (edge) => memberSet.has(edge.source) && memberSet.has(edge.target)
    );
    const stronglyConnected = stronglyConnectedComponents(
      members,
      componentEdges
    );
    const groupByEvent = new Map(
      stronglyConnected.flatMap((group, index) =>
        group.map((id) => [id, index] as const)
      )
    );
    const groupRank = new Map(stronglyConnected.map((_, index) => [index, 0]));
    const groupEdges = [
      ...new Set(
        componentEdges.flatMap((edge) => {
          const source = groupByEvent.get(edge.source)!;
          const target = groupByEvent.get(edge.target)!;
          return source === target ? [] : [`${source}:${target}`];
        })
      )
    ].map((value) => value.split(":").map(Number) as [number, number]);
    for (let pass = 0; pass < stronglyConnected.length; pass++)
      for (const [source, target] of groupEdges)
        groupRank.set(
          target,
          Math.max(groupRank.get(target)!, groupRank.get(source)! + 1)
        );
    const rank = new Map(
      members.map((id) => [id, groupRank.get(groupByEvent.get(id)!)!])
    );
    const systemKeys = new Set(
      members.flatMap((id) => {
        const value = coordinates.get(id);
        return value ? [`${value.system}@${value.version}`] : [];
      })
    );
    const coordinateCount = members.filter((id) => coordinates.has(id)).length;
    const mode =
      coordinateCount === members.length && systemKeys.size === 1
        ? "coordinate"
        : coordinateCount === 0 && componentEdges.length > 0
          ? "relative"
          : coordinateCount > 0
            ? "mixed"
            : "unplaced";
    const soleSystem =
      mode === "coordinate" ? [...systemKeys][0]!.split("@")[0]! : null;
    const byRank = new Map<number, string[]>();
    for (const id of members) {
      const value = rank.get(id)!;
      byRank.set(value, [...(byRank.get(value) ?? []), id].sort());
    }
    const width = Math.max(...[...byRank.values()].map((ids) => ids.length));
    for (const id of members) {
      const evidence = [
        ...new Set([
          ...(positions.get(id)?.source_constraint_ids ?? []),
          ...componentEdges
            .filter((edge) => edge.source === id || edge.target === id)
            .flatMap((edge) => edge.evidence)
        ])
      ].sort();
      const componentId = `chronology:${digest({ members, system_keys: [...systemKeys].sort() }).slice(0, 16)}`;
      result.set(id, {
        column: componentColumn + byRank.get(rank.get(id)!)!.indexOf(id),
        rank: rank.get(id)!,
        public: {
          placement_kind: "inferred_layout",
          component_id: componentId,
          mode,
          rank: rank.get(id)!,
          time_system_ref: soleSystem ? { time_system_id: soleSystem } : null,
          evidence
        }
      });
    }
    componentColumn += width + 1;
  });
  return result;
}

function stronglyConnectedComponents(
  ids: readonly string[],
  edges: readonly OrderingEdge[]
): string[][] {
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of edges) outgoing.get(edge.source)?.push(edge.target);
  for (const targets of outgoing.values()) targets.sort();
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const groups: string[][] = [];
  let cursor = 0;
  const visit = (id: string) => {
    index.set(id, cursor);
    low.set(id, cursor++);
    stack.push(id);
    onStack.add(id);
    for (const target of outgoing.get(id) ?? []) {
      if (!index.has(target)) {
        visit(target);
        low.set(id, Math.min(low.get(id)!, low.get(target)!));
      } else if (onStack.has(target))
        low.set(id, Math.min(low.get(id)!, index.get(target)!));
    }
    if (low.get(id) !== index.get(id)) return;
    const group: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      group.push(member);
    } while (member !== id);
    groups.push(group.sort());
  };
  for (const id of ids) if (!index.has(id)) visit(id);
  return groups.sort((left, right) => left[0]!.localeCompare(right[0]!));
}
