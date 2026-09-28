import { createHash } from "node:crypto";
import type { CanonicalState } from "@moirai/contracts/v5";
import type { V5WorldLayout } from "./v5-world-layout.js";

type Point = Readonly<{ x: number; y: number }>;
type Box = Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;
export type RenderPrimitive = Readonly<{
  id: string;
  entity: Readonly<{ kind: "event" | "relation" | "composite"; id: string }>;
  geometry:
    | Readonly<{ kind: "point"; xy: Point }>
    | Readonly<{ kind: "line"; paths: readonly (readonly Point[])[] }>
    | Readonly<{ kind: "polygon"; rings: readonly (readonly Point[])[] }>;
  bounds: Box;
  label: string;
  collectionIds: readonly string[];
  lod: Readonly<{
    visible: readonly [number, number];
    fadeIn?: readonly [number, number];
    fadeOut?: readonly [number, number];
    groupId: string;
  }>;
}>;
export type RenderTile = Readonly<{
  format: "render-tile/1";
  worldId: string;
  revision: number;
  timeSystemId: string;
  level: number;
  x: number;
  y: number;
  bounds: Box;
  primitives: readonly RenderPrimitive[];
}>;
export type RenderPublication = Readonly<{
  format: "render-publication/1";
  worldId: string;
  revision: number;
  timeSystemId: string;
  algorithmVersion: "render-compiler/1";
  bounds: Box | null;
  tiles: readonly Readonly<{
    key: string;
    sha256: string;
    bounds: Box;
    level: number;
    x: number;
    y: number;
  }>[];
  documents: readonly Readonly<{ key: string; body: string }>[];
}>;

/** A tile's replica is identified by representation ID, never by tile address. */
export function selectRenderScene(
  publication: RenderPublication,
  tiles: readonly RenderTile[],
  viewport: Box,
  level: number
): RenderPrimitive[] {
  if (!Number.isInteger(level) || level < 0 || level > 3)
    throw Error("render_level_invalid");
  const refs = new Map(publication.tiles.map((ref) => [ref.key, ref]));
  const scene = new Map<string, RenderPrimitive>();
  for (const tile of tiles) {
    if (
      tile.worldId !== publication.worldId ||
      tile.revision !== publication.revision ||
      tile.timeSystemId !== publication.timeSystemId ||
      tile.level !== level
    )
      throw Error("render_mixed_revision");
    const key = `worlds/${tile.worldId}/revisions/${tile.revision}/v5/render/${tile.timeSystemId}/${level}/${tile.x}/${tile.y}.json`;
    const ref = refs.get(key);
    if (!ref || ref.sha256 !== digest(JSON.stringify(tile)))
      throw Error("render_tile_digest_invalid");
    if (!intersects(tile.bounds, viewport)) continue;
    for (const primitive of tile.primitives) {
      if (!intersects(primitive.bounds, viewport)) continue;
      const old = scene.get(primitive.id);
      if (old && JSON.stringify(old) !== JSON.stringify(primitive))
        throw Error("render_replica_mismatch");
      scene.set(primitive.id, primitive);
    }
  }
  return [...scene.values()].sort((a, b) => a.id.localeCompare(b.id));
}

const digest = (body: string) =>
  createHash("sha256").update(body).digest("hex");
const boundsOf = (points: readonly Point[]): Box => {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, maxX, minY, maxY };
};
const intersects = (a: Box, b: Box) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** Stable convex support hull. Never derive support from a viewport subset. */
function hull(points: readonly Point[]): Point[] {
  const sorted = [
    ...new Map(points.map((p) => [`${p.x},${p.y}`, p])).values()
  ].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const p of sorted) {
    while (lower.length > 1 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  for (const p of sorted.toReversed()) {
    while (upper.length > 1 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Offline prototype. No pointer write: serving requires independent completeness proofs. */
export function compileV5RenderPublication(
  state: CanonicalState,
  layout: V5WorldLayout
): RenderPublication {
  if (state.world.id !== layout.world_id || layout.revision < 1)
    throw Error("render_revision_mismatch");
  const shapes = new Map(layout.shapes.map((shape) => [shape.event_id, shape]));
  if (shapes.size !== layout.shapes.length)
    throw Error("render_duplicate_event");
  const titles = new Map(state.events.map((event) => [event.id, event.title]));
  const memberships = new Map<string, Set<string>>();
  for (const member of state.eventCollectionMemberships) {
    const ids = memberships.get(member.event_id) ?? new Set<string>();
    ids.add(member.collection_id);
    memberships.set(member.event_id, ids);
  }
  const children = new Map<string, string[]>();
  for (const relation of state.relations) {
    if (
      relation.type !== "contains" ||
      relation.source_ref.kind !== "event" ||
      relation.target_ref.kind !== "event"
    )
      continue;
    const ids = children.get(relation.source_ref.event_id) ?? [];
    ids.push(relation.target_ref.event_id);
    children.set(relation.source_ref.event_id, ids);
  }
  const support = new Map<string, Point[]>();
  const visiting = new Set<string>();
  const resolve = (id: string): Point[] => {
    if (support.has(id)) return support.get(id)!;
    const stack: { id: string; exit: boolean }[] = [{ id, exit: false }];
    while (stack.length) {
      const frame = stack.pop()!;
      if (frame.exit) {
        const shape = shapes.get(frame.id);
        const points =
          shape?.kind === "point"
            ? [shape.position]
            : shape?.kind === "segment"
              ? [shape.start, shape.end]
              : [...new Set(children.get(frame.id) ?? [])]
                  .sort()
                  .flatMap((child) => support.get(child) ?? []);
        // For a convex parent hull, every interior descendant can be dropped.
        // The hull of child hull vertices equals the hull of all descendants.
        support.set(frame.id, shape?.kind === "region" ? hull(points) : points);
        visiting.delete(frame.id);
        continue;
      }
      if (support.has(frame.id)) continue;
      if (visiting.has(frame.id)) throw Error("render_contains_cycle");
      visiting.add(frame.id);
      stack.push({ id: frame.id, exit: true });
      const shape = shapes.get(frame.id);
      if (shape?.kind === "point" || shape?.kind === "segment") continue;
      const descendants = [...new Set(children.get(frame.id) ?? [])].sort();
      for (const child of descendants.toReversed())
        if (!support.has(child)) stack.push({ id: child, exit: false });
    }
    return support.get(id)!;
  };
  const primitives: RenderPrimitive[] = [];
  const add = (
    id: string,
    entity: RenderPrimitive["entity"],
    geometry: RenderPrimitive["geometry"],
    points: readonly Point[],
    label: string,
    lod: RenderPrimitive["lod"],
    collectionIds: readonly string[]
  ) => {
    if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
      throw Error("render_nonfinite_geometry");
    primitives.push({
      id,
      entity,
      geometry,
      bounds: boundsOf(points),
      label,
      lod,
      collectionIds
    });
  };
  for (const shape of [...layout.shapes].sort((a, b) =>
    a.event_id.localeCompare(b.event_id)
  )) {
    const id = shape.event_id,
      label = titles.get(id);
    if (!label) throw Error("render_event_missing");
    const collectionIds = [...(memberships.get(id) ?? [])].sort();
    if (shape.kind === "point")
      add(
        `event:${id}:point`,
        { kind: "event", id },
        { kind: "point", xy: shape.position },
        [shape.position],
        label,
        { visible: [0, 8], groupId: id },
        collectionIds
      );
    if (shape.kind === "segment")
      add(
        `event:${id}:segment`,
        { kind: "event", id },
        { kind: "line", paths: [[shape.start, shape.end]] },
        [shape.start, shape.end],
        label,
        { visible: [0, 8], groupId: id },
        collectionIds
      );
    if (shape.kind === "region") {
      const points = hull(resolve(id));
      // A region with insufficient placed descendants retains the published bounds,
      // explicitly as fallback geometry; it must not pretend to be a complete hull.
      const b = shape.bounds;
      const polygon =
        points.length >= 3
          ? points
          : [
              { x: b.minX, y: b.minY },
              { x: b.maxX, y: b.minY },
              { x: b.maxX, y: b.maxY },
              { x: b.minX, y: b.maxY }
            ];
      add(
        `event:${id}:far`,
        { kind: "composite", id },
        {
          kind: "point",
          xy: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
        },
        [{ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }],
        label,
        { visible: [0, 3.4], fadeOut: [2.8, 3.4], groupId: id },
        collectionIds
      );
      add(
        `event:${id}:hull`,
        { kind: "composite", id },
        { kind: "polygon", rings: [polygon] },
        polygon,
        label,
        { visible: [2.7, 8], fadeIn: [2.7, 3.3], groupId: id },
        collectionIds
      );
    }
  }
  for (const relation of [...state.relations].sort((a, b) =>
    a.id.localeCompare(b.id)
  )) {
    if (
      relation.type === "contains" ||
      relation.source_ref.kind !== "event" ||
      relation.target_ref.kind !== "event"
    )
      continue;
    const a = shapes.get(relation.source_ref.event_id),
      b = shapes.get(relation.target_ref.event_id);
    if (!a || !b) continue;
    const center = (s: typeof a): Point =>
      s.kind === "point"
        ? s.position
        : s.kind === "segment"
          ? s.start
          : {
              x: (s.bounds.minX + s.bounds.maxX) / 2,
              y: (s.bounds.minY + s.bounds.maxY) / 2
            };
    const points = [center(a), center(b)];
    add(
      `relation:${relation.id}`,
      { kind: "relation", id: relation.id },
      { kind: "line", paths: [points] },
      points,
      relation.type,
      { visible: [0, 8], groupId: relation.id },
      [
        ...new Set([
          ...(memberships.get(relation.source_ref.event_id) ?? []),
          ...(memberships.get(relation.target_ref.event_id) ?? [])
        ])
      ].sort()
    );
  }
  if (!primitives.length)
    return {
      format: "render-publication/1",
      worldId: layout.world_id,
      revision: layout.revision,
      timeSystemId: layout.time_system_id,
      algorithmVersion: "render-compiler/1",
      bounds: null,
      tiles: [],
      documents: []
    };
  const world = boundsOf(
    primitives.flatMap((p) => [
      { x: p.bounds.minX, y: p.bounds.minY },
      { x: p.bounds.maxX, y: p.bounds.maxY }
    ])
  );
  const width = Math.max(world.maxX - world.minX, 1),
    height = Math.max(world.maxY - world.minY, 1);
  const tiles: RenderTile[] = [];
  for (let level = 0; level <= 3; level++) {
    const count = 2 ** level;
    for (let y = 0; y < count; y++)
      for (let x = 0; x < count; x++) {
        const bounds = {
          minX: world.minX + (x * width) / count,
          maxX: world.minX + ((x + 1) * width) / count,
          minY: world.minY + (y * height) / count,
          maxY: world.minY + ((y + 1) * height) / count
        };
        const entries = primitives.filter(
          (p) =>
            p.lod.visible[0] <= level &&
            p.lod.visible[1] >= level &&
            intersects(p.bounds, bounds)
        );
        if (entries.length)
          tiles.push({
            format: "render-tile/1",
            worldId: layout.world_id,
            revision: layout.revision,
            timeSystemId: layout.time_system_id,
            level,
            x,
            y,
            bounds,
            primitives: entries
          });
      }
  }
  const prefix = `worlds/${layout.world_id}/revisions/${layout.revision}/v5/render/${layout.time_system_id}`;
  const documents = tiles.map((tile) => ({
    key: `${prefix}/${tile.level}/${tile.x}/${tile.y}.json`,
    body: JSON.stringify(tile)
  }));
  // This compiler is not a serving format for dense Worlds yet. Fail closed
  // until coarse-level representation and selection-aware clusters are built.
  if (
    documents.some((document) => Buffer.byteLength(document.body) > 1024 * 1024)
  )
    throw Error("render_tile_budget_exceeded");
  return {
    format: "render-publication/1",
    worldId: layout.world_id,
    revision: layout.revision,
    timeSystemId: layout.time_system_id,
    algorithmVersion: "render-compiler/1",
    bounds: world,
    tiles: documents.map((document, i) => ({
      key: document.key,
      sha256: digest(document.body),
      bounds: tiles[i]!.bounds,
      level: tiles[i]!.level,
      x: tiles[i]!.x,
      y: tiles[i]!.y
    })),
    documents
  };
}
