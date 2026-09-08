import type {
  PublicGraphScopeArtifact,
  PublicGraphScopeLink,
  PublicGraphScopeNode
} from "@moirai/contracts";
import { endpointEventId } from "@moirai/domain";
import { createHash } from "node:crypto";
import type { CanonicalRevisionView } from "./index.js";

export const GRAPH_SCOPE_ALGORITHM_VERSION = "event-relational-graph-scope/1";

const MAX_CELLS = 1000;
const MAX_LABELS = 250;
const MAX_NODES = 200;
const COLUMNS = 4;

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
  canonId: string
): PublicGraphScopeArtifact {
  const sourceEvents = view.events
    .filter((event) => event.canon_id === canonId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const sourceRelations = view.relations
    .filter((relation) => relation.canon_id === canonId)
    .flatMap((relation) => {
      const source = endpointEventId(relation.source_ref);
      const target = endpointEventId(relation.target_ref);
      return source && target ? [{ relation, source, target }] : [];
    })
    .sort((left, right) => left.relation.id.localeCompare(right.relation.id));
  const selectedEvents = sourceEvents.slice(0, MAX_NODES);
  const selectedIds = new Set(selectedEvents.map((event) => event.id));
  const nodes: PublicGraphScopeNode[] = selectedEvents.map((event, index) => ({
    cell_id: eventCellId(event.id),
    event_id: event.id,
    title: event.title,
    kind: event.kind,
    roles: [...event.roles].sort(),
    x: 96 + (index % COLUMNS) * 208,
    y: 88 + Math.floor(index / COLUMNS) * 128,
    layout_basis: "stable_overview",
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
