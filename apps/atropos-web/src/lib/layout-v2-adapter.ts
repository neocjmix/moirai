import {
  DEFAULT_CONFIG,
  type SimulationConfig,
  type SimulationInput,
  type SimulationState
} from "@moirai/layout-simulation";
import {
  buildRenderConcaveHull,
  type LayoutShape
} from "@moirai/graph-presentation/layout-engine";
import {
  buildCompositePaddingProfile,
  type CompositePaddingProfile
} from "@moirai/graph-presentation/composite-padding-profile";
import type {
  GraphShellChartPlaneEntity,
  GraphShellViewportResponse
} from "../urdr-port/shared/contracts";
import type { LayoutV2Snapshot } from "./layout-v2-types";

type Point = { x: number; y: number };
type Box = { minX: number; maxX: number; minY: number; maxY: number };
const middle = (shape: LayoutShape): Point =>
  shape.kind === "point"
    ? { ...shape.position }
    : shape.kind === "segment"
      ? {
          x: (shape.start.x + shape.end.x) / 2,
          y: (shape.start.y + shape.end.y) / 2
        }
      : {
          x: (shape.bounds.minX + shape.bounds.maxX) / 2,
          y: (shape.bounds.minY + shape.bounds.maxY) / 2
        };
const boundsOf = (points: readonly Point[]): Box => ({
  minX: Math.min(...points.map((p) => p.x)),
  maxX: Math.max(...points.map((p) => p.x)),
  minY: Math.min(...points.map((p) => p.y)),
  maxY: Math.max(...points.map((p) => p.y))
});

/** Physical Events start at X=0. Each Composite gets one virtual hub connected
 * to its unique physical descendants (including nested descendants). Hubs are
 * physics-only; existing Y-sweep derives the displayed Composite geometry. */
export function prepareGraphSimulation(snapshot: LayoutV2Snapshot): {
  input: SimulationInput;
  config: SimulationConfig;
} {
  const nodes = snapshot.baseline.shapes
    .filter((shape) => shape.kind !== "region")
    .map((shape) => ({
      id: shape.event_id,
      y: middle(shape).y,
      x: 0,
      radius: 5
    }));
  const ids = new Set(nodes.map((node) => node.id));
  const events = new Map(snapshot.events.map((event) => [event.id, event]));
  const groups = snapshot.baseline.shapes
    .filter((shape) => shape.kind === "region")
    .map((shape) => {
      const members = new Set<string>(),
        visited = new Set<string>();
      const stack = [...(events.get(shape.event_id)?.childIds ?? [])];
      while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        if (ids.has(id)) members.add(id);
        else stack.push(...(events.get(id)?.childIds ?? []));
      }
      return { id: shape.event_id, members: [...members].sort() };
    })
    .filter((group) => group.members.length > 0);
  return {
    input: {
      nodes,
      groups,
      links: snapshot.relations
        .filter(
          (relation) =>
            ["causes", "precedes", "contains"].includes(relation.type) &&
            ids.has(relation.sourceId) &&
            ids.has(relation.targetId)
        )
        .map((relation) => ({
          id: relation.id,
          source: relation.sourceId,
          target: relation.targetId,
          kind: relation.type
        })),
      source: {
        worldId: snapshot.worldId,
        revision: snapshot.sourceRevision,
        digest: snapshot.inputDigest
      }
    },
    config: { ...DEFAULT_CONFIG }
  };
}

/** Rebuild only local presentation from the exact physics state. Temporal
 * endpoints, identity, authored hierarchy and the production Y-sweep algorithm
 * remain unchanged. No canonical writer or publication handle is reachable. */
export function projectGraphSimulation(
  snapshot: LayoutV2Snapshot,
  state: SimulationState,
  selection: {
    collectionIds: readonly string[];
    relationTypes: readonly string[];
  }
): GraphShellViewportResponse {
  const nodes = new Map(state.nodes.map((node) => [node.id, node]));
  const metadata = new Map(snapshot.events.map((event) => [event.id, event]));
  const shapes = new Map(
    snapshot.baseline.shapes.map((shape) => [shape.event_id, shape])
  );
  const physicalIds = snapshot.baseline.shapes
    .filter((shape) => shape.kind !== "region")
    .map((shape) => shape.event_id);
  if (
    nodes.size !== physicalIds.length ||
    state.nodes.length !== physicalIds.length
  )
    throw Error("layout_v2_state_identity_mismatch");
  for (const id of physicalIds) {
    const node = nodes.get(id),
      initial = middle(shapes.get(id)!);
    if (!node || node.y !== initial.y || !Number.isFinite(node.x))
      throw Error("layout_v2_state_temporal_mismatch");
  }
  const children = new Map(
    snapshot.events.map((event) => [event.id, [...event.childIds].sort()])
  );
  const parents = new Map<string, string[]>();
  for (const [id, childIds] of children)
    for (const child of childIds)
      parents.set(child, [...(parents.get(child) ?? []), id]);
  const support = new Map<string, Point[]>();
  const baselineSupport = new Map<string, Point[]>();
  const profiles = new Map<string, CompositePaddingProfile>();
  const depths = new Map<string, number>();
  const complete = new Map<string, boolean>();
  const positions = new Map<string, Point>();
  const moved = new Map<string, LayoutShape>();
  for (const [id, shape] of shapes) {
    if (shape.kind === "region") continue;
    const node = nodes.get(id)!;
    const dx = node.x - middle(shape).x;
    const next: LayoutShape =
      shape.kind === "point"
        ? {
            event_id: id,
            kind: "point",
            position: { x: node.x, y: shape.position.y }
          }
        : {
            event_id: id,
            kind: "segment",
            start: { x: shape.start.x + dx, y: shape.start.y },
            end: { x: shape.end.x + dx, y: shape.end.y }
          };
    moved.set(id, next);
    positions.set(id, next.kind === "segment" ? next.start : middle(next));
    baselineSupport.set(
      id,
      shape.kind === "point" ? [shape.position] : [shape.start, shape.end]
    );
    support.set(
      id,
      next.kind === "point"
        ? [next.position]
        : next.kind === "segment"
          ? [next.start, next.end]
          : []
    );
    complete.set(id, true);
  }
  // Same iterative bottom-up support and Y-sweep as v5-render-publication.
  const visiting = new Set<string>();
  const resolve = (id: string): void => {
    const stack = [{ id, exit: false }];
    while (stack.length) {
      const frame = stack.pop()!;
      if (frame.exit) {
        const shape = shapes.get(frame.id);
        const direct: Point[] = [],
          polygons: Point[][] = [];
        const childIds = children.get(frame.id) ?? [];
        for (const child of childIds) {
          const points = support.get(child) ?? [];
          if (shapes.get(child)?.kind === "region") polygons.push(points);
          else direct.push(...points);
        }
        const originalDirect: Point[] = [],
          originalPolygons: Point[][] = [];
        for (const child of childIds) {
          const points = baselineSupport.get(child) ?? [];
          if (shapes.get(child)?.kind === "region")
            originalPolygons.push(points);
          else originalDirect.push(...points);
        }
        baselineSupport.set(
          frame.id,
          buildRenderConcaveHull(originalDirect, originalPolygons)
        );
        const hull = buildRenderConcaveHull(direct, polygons);
        support.set(frame.id, hull);
        profiles.set(
          frame.id,
          buildCompositePaddingProfile(
            hull.length
              ? boundsOf(hull)
              : shape?.kind === "region"
                ? shape.bounds
                : { minY: 0, maxY: 0 },
            childIds.flatMap((child) =>
              profiles.has(child) ? [profiles.get(child)!] : []
            )
          )
        );
        complete.set(
          frame.id,
          shape?.kind === "region" &&
            childIds.length > 0 &&
            childIds.every(
              (child) => shapes.has(child) && complete.get(child) === true
            )
        );
        depths.set(
          frame.id,
          1 +
            Math.max(
              0,
              ...childIds
                .filter((child) => shapes.get(child)?.kind === "region")
                .map((child) => depths.get(child) ?? 1)
            )
        );
        visiting.delete(frame.id);
        continue;
      }
      if (support.has(frame.id)) continue;
      if (visiting.has(frame.id)) throw Error("layout_v2_contains_cycle");
      visiting.add(frame.id);
      stack.push({ id: frame.id, exit: true });
      for (const child of (children.get(frame.id) ?? []).toReversed())
        if (!support.has(child)) stack.push({ id: child, exit: false });
    }
  };
  const selected = new Set(selection.collectionIds);
  const included = new Set(
    snapshot.events
      .filter((event) => event.collectionIds.some((id) => selected.has(id)))
      .map((event) => event.id)
  );
  const queue = [...included];
  for (let i = 0; i < queue.length; i++)
    for (const parent of parents.get(queue[i]!) ?? [])
      if (!included.has(parent)) {
        included.add(parent);
        queue.push(parent);
      }
  const base = (id: string) => ({
    id,
    eventId: id,
    canonId: snapshot.worldId,
    label: metadata.get(id)?.title ?? id,
    validationState: "ok" as const,
    contains: [] as string[],
    diagnostics: [],
    viewportClass: "visible" as const
  });
  const entities: GraphShellChartPlaneEntity[] = [],
    regions: GraphShellChartPlaneEntity[] = [],
    edges: GraphShellChartPlaneEntity[] = [];
  for (const [id, shape] of shapes) {
    if (shape.kind === "region") {
      resolve(id);
      const points = support.get(id)!;
      // Preserve the production fallback for insufficient placed descendants.
      const polygon =
        points.length >= 3
          ? points
          : [
              { x: shape.bounds.minX, y: shape.bounds.minY },
              { x: shape.bounds.maxX, y: shape.bounds.minY },
              { x: shape.bounds.maxX, y: shape.bounds.maxY },
              { x: shape.bounds.minX, y: shape.bounds.maxY }
            ];
      const hullBounds = boundsOf(polygon);
      const original = baselineSupport.get(id)!;
      const originalBounds =
        original.length >= 3 ? boundsOf(original) : shape.bounds;
      const worldBounds = {
        ...shape.bounds,
        minX: shape.bounds.minX + (hullBounds.minX - originalBounds.minX),
        maxX: shape.bounds.maxX + (hullBounds.maxX - originalBounds.maxX)
      };
      positions.set(id, {
        x: (worldBounds.minX + worldBounds.maxX) / 2,
        y: (worldBounds.minY + worldBounds.maxY) / 2
      });
      if (included.has(id))
        regions.push({
          ...base(id),
          geometryKind: "region",
          worldBounds,
          contains: children.get(id) ?? [],
          preparedDepth: depths.get(id),
          preparedPaddingProfile: [...(profiles.get(id) ?? [])],
          childrenComplete: complete.get(id) === true,
          preparedWorldHull: polygon
        });
    } else if (included.has(id)) {
      const next = moved.get(id)!;
      if (next.kind === "point")
        entities.push({
          ...base(id),
          geometryKind: "point",
          position: next.position
        });
      else if (next.kind === "segment")
        entities.push({
          ...base(id),
          geometryKind: "segment",
          start: next.start,
          end: next.end
        });
    }
  }
  for (const relation of snapshot.relations) {
    if (
      relation.type === "contains" ||
      !selection.relationTypes.includes(relation.type) ||
      !included.has(relation.sourceId) ||
      !included.has(relation.targetId)
    )
      continue;
    const start = positions.get(relation.sourceId),
      end = positions.get(relation.targetId);
    if (start && end)
      edges.push({
        ...base(relation.id),
        eventId: relation.sourceId,
        label: relation.type,
        geometryKind: "segment",
        contains: [relation.sourceId, relation.targetId],
        start,
        end
      });
  }
  return {
    revision: snapshot.sourceRevision,
    canonicalRevision: snapshot.sourceRevision,
    lodLevel: 0,
    entities,
    regions,
    edges,
    diagnostics: [],
    truncated: false,
    completeness: {
      entities: true,
      regions: true,
      edges: true,
      regionSupport: regions.every(
        (region) =>
          region.geometryKind !== "region" || region.childrenComplete === true
      )
    },
    cache: { stale: false }
  };
}
