import { createHash } from "node:crypto";
import type { CanonicalState } from "@moirai/contracts/v5";
import type { V5WorldLayout } from "./v5-world-layout.js";
import { buildRenderConcaveHull } from "./v5-render-hull.js";

type Point = Readonly<{ x: number; y: number }>;
type Box = Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;
export type RenderPrimitive = Readonly<{
  id: string;
  entity: Readonly<{
    kind: "event" | "relation" | "composite" | "cluster";
    id: string;
  }>;
  geometry:
    | Readonly<{ kind: "point"; xy: Point }>
    | Readonly<{ kind: "line"; paths: readonly (readonly Point[])[] }>
    | Readonly<{ kind: "polygon"; rings: readonly (readonly Point[])[] }>
    | Readonly<{ kind: "external"; key: string; sha256: string }>;
  bounds: Box;
  label: string;
  collectionIds: readonly string[];
  endpointIds?: readonly [string, string];
  endpointCollectionIds?: readonly [readonly string[], readonly string[]];
  memberCount?: number;
  /** Authored Composite hierarchy, independent of the spatial tile grid. */
  composite?: Readonly<{
    childEventIds: readonly string[];
    supportComplete: boolean;
    worldBounds: Box;
  }>;
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
  algorithmVersion: "render-compiler/3";
  maxLevel: number;
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
  geometry: readonly Readonly<{ key: string; sha256: string; bounds: Box }>[];
  geometryDocuments: readonly Readonly<{ key: string; body: string }>[];
}>;

/** Geometry remains world-space and revision-pinned; missing/tampered refs fail closed. */
export function resolveRenderGeometry(
  publication: RenderPublication,
  primitive: RenderPrimitive,
  body: string
): Exclude<RenderPrimitive["geometry"], { kind: "external" }> {
  if (primitive.geometry.kind !== "external") return primitive.geometry;
  const external = primitive.geometry;
  const ref = publication.geometry.find((item) => item.key === external.key);
  if (
    !ref ||
    ref.sha256 !== primitive.geometry.sha256 ||
    digest(body) !== ref.sha256 ||
    JSON.stringify(ref.bounds) !== JSON.stringify(primitive.bounds)
  )
    throw Error("render_geometry_digest_invalid");
  const document = JSON.parse(body) as {
    worldId: string;
    revision: number;
    timeSystemId: string;
    geometry: RenderPrimitive["geometry"];
  };
  if (
    document.worldId !== publication.worldId ||
    document.revision !== publication.revision ||
    document.timeSystemId !== publication.timeSystemId ||
    document.geometry.kind === "external"
  )
    throw Error("render_geometry_revision_invalid");
  return document.geometry;
}

/** A tile's replica is identified by representation ID, never by tile address. */
export function selectRenderScene(
  publication: RenderPublication,
  tiles: readonly RenderTile[],
  viewport: Box,
  level: number,
  activeCollectionIds?: readonly string[]
): RenderPrimitive[] {
  if (!Number.isInteger(level) || level < 0 || level > publication.maxLevel)
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
      if (
        activeCollectionIds &&
        (!primitive.collectionIds.some((id) =>
          activeCollectionIds.includes(id)
        ) ||
          (primitive.endpointCollectionIds &&
            !primitive.endpointCollectionIds.every((ids) =>
              ids.some((id) => activeCollectionIds.includes(id))
            )))
      )
        continue;
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
        if (shape?.kind === "point") support.set(frame.id, [shape.position]);
        else if (shape?.kind === "segment")
          support.set(frame.id, [shape.start, shape.end]);
        else {
          const direct: Point[] = [],
            polygons: Point[][] = [];
          for (const child of [
            ...new Set(children.get(frame.id) ?? [])
          ].sort()) {
            const points = support.get(child) ?? [];
            if (shapes.get(child)?.kind === "region") polygons.push(points);
            else direct.push(...points);
          }
          support.set(frame.id, buildRenderConcaveHull(direct, polygons));
        }
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
    collectionIds: readonly string[],
    endpointIds?: readonly [string, string],
    endpointCollectionIds?: readonly [readonly string[], readonly string[]],
    composite?: RenderPrimitive["composite"]
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
      collectionIds,
      ...(endpointIds ? { endpointIds } : {}),
      ...(endpointCollectionIds ? { endpointCollectionIds } : {}),
      ...(composite ? { composite } : {})
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
      const points = resolve(id);
      const childEventIds = [...new Set(children.get(id) ?? [])].sort();
      const composite = {
        childEventIds,
        supportComplete:
          childEventIds.length > 0 &&
          childEventIds.every((child) => shapes.has(child)),
        worldBounds: shape.bounds
      };
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
        collectionIds,
        undefined,
        undefined,
        composite
      );
      add(
        `event:${id}:hull`,
        { kind: "composite", id },
        { kind: "polygon", rings: [polygon] },
        polygon,
        label,
        { visible: [2.7, 8], fadeIn: [2.7, 3.3], groupId: id },
        collectionIds,
        undefined,
        undefined,
        composite
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
      ].sort(),
      [relation.source_ref.event_id, relation.target_ref.event_id],
      [
        [...(memberships.get(relation.source_ref.event_id) ?? [])].sort(),
        [...(memberships.get(relation.target_ref.event_id) ?? [])].sort()
      ]
    );
  }
  if (!primitives.length)
    return {
      format: "render-publication/1",
      worldId: layout.world_id,
      revision: layout.revision,
      timeSystemId: layout.time_system_id,
      algorithmVersion: "render-compiler/3",
      maxLevel: 0,
      bounds: null,
      tiles: [],
      documents: [],
      geometry: [],
      geometryDocuments: []
    };
  const world = boundsOf(
    primitives.flatMap((p) => [
      { x: p.bounds.minX, y: p.bounds.minY },
      { x: p.bounds.maxX, y: p.bounds.maxY }
    ])
  );
  const width = Math.max(world.maxX - world.minX, 1),
    height = Math.max(world.maxY - world.minY, 1);
  const prefix = `worlds/${layout.world_id}/revisions/${layout.revision}/v5/render/${layout.time_system_id}`;
  const geometryDocuments = new Map<string, string>();
  const geometry = new Map<
    string,
    { key: string; sha256: string; bounds: Box }
  >();
  const renderPrimitives = primitives.map((primitive): RenderPrimitive => {
    if (
      primitive.geometry.kind !== "polygon" &&
      primitive.geometry.kind !== "line"
    )
      return primitive;
    const vertexCount = (
      primitive.geometry.kind === "polygon"
        ? primitive.geometry.rings
        : primitive.geometry.paths
    ).reduce((count, path) => count + path.length, 0);
    const spansManyTiles =
      (primitive.bounds.maxX - primitive.bounds.minX) / width > 0.25 ||
      (primitive.bounds.maxY - primitive.bounds.minY) / height > 0.25;
    if (vertexCount <= 32 && !spansManyTiles) return primitive;
    const body = JSON.stringify({
      format: "render-geometry/1",
      worldId: layout.world_id,
      revision: layout.revision,
      timeSystemId: layout.time_system_id,
      geometry: primitive.geometry
    });
    const sha256 = digest(body);
    const key = `${prefix}/geometry/${sha256}.json`;
    if (Buffer.byteLength(body) > 1024 * 1024)
      throw Error("render_geometry_budget_exceeded");
    geometryDocuments.set(key, body);
    geometry.set(key, { key, sha256, bounds: primitive.bounds });
    return { ...primitive, geometry: { kind: "external", key, sha256 } };
  });
  const tiles: RenderTile[] = [];
  let maxLevel = 0;
  // A coarse tile is represented by one aggregate per exact membership set.
  // The source Event remains unique; no graph lookup is needed to apply
  // Collection selection to an aggregate. Deep levels recover Event points.
  for (let level = 0; level <= 5; level++) {
    const count = 2 ** level;
    let clustered = false;
    for (let y = 0; y < count; y++)
      for (let x = 0; x < count; x++) {
        const bounds = {
          minX: world.minX + (x * width) / count,
          maxX: world.minX + ((x + 1) * width) / count,
          minY: world.minY + (y * height) / count,
          maxY: world.minY + ((y + 1) * height) / count
        };
        const entries = renderPrimitives.filter(
          (p) =>
            p.lod.visible[0] <= level &&
            p.lod.visible[1] >= level &&
            (p.geometry.kind === "point" && p.entity.kind === "event"
              ? (p.geometry.xy.x >= bounds.minX &&
                  p.geometry.xy.x < bounds.maxX &&
                  p.geometry.xy.y >= bounds.minY &&
                  p.geometry.xy.y < bounds.maxY) ||
                (p.geometry.xy.x === world.maxX &&
                  x === count - 1 &&
                  p.geometry.xy.y >= bounds.minY &&
                  p.geometry.xy.y <= bounds.maxY) ||
                (p.geometry.xy.y === world.maxY &&
                  y === count - 1 &&
                  p.geometry.xy.x >= bounds.minX &&
                  p.geometry.xy.x <= bounds.maxX)
              : intersects(p.bounds, bounds))
        );
        const points = entries.filter(
          (p) => p.entity.kind === "event" && p.geometry.kind === "point"
        );
        let packed = entries;
        if (points.length > 256) {
          clustered = true;
          const groups = new Map<string, RenderPrimitive[]>();
          for (const point of points) {
            const signature = JSON.stringify(point.collectionIds);
            const group = groups.get(signature) ?? [];
            group.push(point);
            groups.set(signature, group);
          }
          const aggregates: RenderPrimitive[] = [];
          for (const [signature, group] of [...groups].sort(([a], [b]) =>
            a.localeCompare(b)
          )) {
            const xy = {
              x:
                group.reduce(
                  (sum, p) =>
                    sum + (p.geometry.kind === "point" ? p.geometry.xy.x : 0),
                  0
                ) / group.length,
              y:
                group.reduce(
                  (sum, p) =>
                    sum + (p.geometry.kind === "point" ? p.geometry.xy.y : 0),
                  0
                ) / group.length
            };
            const id = `cluster:${level}:${x}:${y}:${digest(signature).slice(0, 16)}`;
            aggregates.push({
              id,
              entity: { kind: "cluster", id },
              geometry: { kind: "point", xy },
              bounds: boundsOf([xy]),
              label: `${group.length} Events`,
              collectionIds: group[0]!.collectionIds,
              memberCount: group.length,
              lod: { visible: [level, level + 1], groupId: id }
            });
          }
          packed = [
            ...entries.filter(
              (p) => p.entity.kind !== "event" || p.geometry.kind !== "point"
            ),
            ...aggregates
          ];
        }
        if (packed.length)
          tiles.push({
            format: "render-tile/1",
            worldId: layout.world_id,
            revision: layout.revision,
            timeSystemId: layout.time_system_id,
            level,
            x,
            y,
            bounds,
            primitives: packed
          });
      }
    maxLevel = level;
    if (clustered && level === 5) throw Error("render_level_capacity_exceeded");
    if (!clustered && level >= 3) break;
  }
  const visibleByLevel = new Map<number, Set<string>>();
  for (const tile of tiles) {
    const visible = visibleByLevel.get(tile.level) ?? new Set<string>();
    for (const primitive of tile.primitives)
      if (
        primitive.entity.kind === "event" ||
        primitive.entity.kind === "composite"
      )
        visible.add(primitive.entity.id);
    visibleByLevel.set(tile.level, visible);
  }
  const finalTiles = tiles
    .map((tile) => ({
      ...tile,
      primitives: tile.primitives.filter(
        (primitive) =>
          !primitive.endpointIds ||
          primitive.endpointIds.every((id) =>
            visibleByLevel.get(tile.level)?.has(id)
          )
      )
    }))
    .filter((tile) => tile.primitives.length);
  const documents = finalTiles.map((tile) => ({
    key: `${prefix}/${tile.level}/${tile.x}/${tile.y}.json`,
    body: JSON.stringify(tile)
  }));
  // Large Composite/relation fragments and pathological membership signatures
  // still require external geometry or a finer partition. Fail closed.
  if (
    documents.some((document) => Buffer.byteLength(document.body) > 1024 * 1024)
  )
    throw Error("render_tile_budget_exceeded");
  return {
    format: "render-publication/1",
    worldId: layout.world_id,
    revision: layout.revision,
    timeSystemId: layout.time_system_id,
    algorithmVersion: "render-compiler/3",
    maxLevel,
    bounds: world,
    tiles: documents.map((document, i) => ({
      key: document.key,
      sha256: digest(document.body),
      bounds: finalTiles[i]!.bounds,
      level: finalTiles[i]!.level,
      x: finalTiles[i]!.x,
      y: finalTiles[i]!.y
    })),
    documents,
    geometry: [...geometry.values()],
    geometryDocuments: [...geometryDocuments].map(([key, body]) => ({
      key,
      body
    }))
  };
}
