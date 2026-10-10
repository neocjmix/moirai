import { createHash } from "node:crypto";
import type { CanonicalState } from "@moirai/contracts/v5";
import type { V5WorldLayout } from "./v5-world-layout.js";
import { buildRenderConcaveHull } from "./v5-render-hull.js";
import { selectRenderPrimitiveClosure } from "./render-primitive-admission.js";
import {
  buildCompositePaddingProfile,
  type CompositePaddingProfile
} from "./composite-padding-profile.js";
import {
  V5_RENDER_SPATIAL_FRAME,
  renderTileAddresses,
  renderTileBounds,
  renderTileKey,
  type RenderSpatialFrame
} from "./v5-render-grid.js";

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
  /** Presentation priority only; never authored importance or a new identity. */
  visibility?: Readonly<{ policy: "render-visibility/1"; priority: string }>;
  /** Direct authored parents; never inferred from spatial proximity. */
  parentCompositeIds?: readonly string[];
  /** Complete authored ancestry, including intermediates omitted by visibility. */
  ancestorCompositeIds?: readonly string[];
  /** Authored Composite hierarchy, independent of the spatial tile grid. */
  composite?: Readonly<{
    childEventIds: readonly string[];
    childEventCount?: number;
    childIdsComplete?: boolean;
    supportComplete: boolean;
    worldBounds: Box;
    /** World-stable support for viewport-local point/hull/child transitions. */
    hullBounds?: Box;
    depth?: number;
    /** Local authored nesting by Y; screen padding is applied by the reader. */
    paddingProfile?: CompositePaddingProfile;
    anchor?: Point;
    transitions?: Readonly<{
      pointEnterMaxSizePx: number;
      pointExitMaxSizePx: number;
      /** Legacy height-only reader policy; retained for older publications/readers. */
      childFadeHeightPx: readonly [number, number];
      /** Leaf handoff by Y-dominant span; Composite children keep their own stages. */
      childFadeSpanPx?: readonly [number, number];
      paddingBasePx: number;
      paddingPerDepthPx: number;
    }>;
  }>;
  lod: Readonly<{
    visible: readonly [number, number];
    fadeIn?: readonly [number, number];
    fadeOut?: readonly [number, number];
    groupId: string;
  }>;
}>;
export type RenderTile = Readonly<{
  format: "render-tile/1" | "render-tile/2";
  worldId: string;
  revision: number;
  timeSystemId: string;
  level: number;
  x: number;
  y: number;
  bucketKind?: "overflow";
  bounds: Box;
  primitives: readonly RenderPrimitive[];
  visibility?: Readonly<{
    policy: "render-visibility/1";
    candidateCount: number;
    omittedCount: number;
    normalBudget: number;
    smallBudget: number;
    bufferBudget: number;
  }>;
}>;
export type RenderPublication = Readonly<{
  format: "render-publication/1" | "render-publication/2";
  worldId: string;
  revision: number;
  timeSystemId: string;
  algorithmVersion: "render-compiler/3" | "render-compiler/4";
  /** Layout provenance changes independently of the fixed-grid compiler. */
  layoutAlgorithmVersion?: string;
  /** Only /2 publications use the fixed frame; /1 retains its original grid. */
  spatialFrame?: RenderSpatialFrame;
  minLevel?: number;
  overflowLevels?: readonly number[];
  maxLevel: number;
  bounds: Box | null;
  tiles: readonly Readonly<{
    key: string;
    sha256: string;
    bounds: Box;
    level: number;
    x: number;
    y: number;
    bucketKind?: "overflow";
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
  if (
    !Number.isInteger(level) ||
    level < (publication.minLevel ?? 0) ||
    level > publication.maxLevel
  )
    throw Error("render_level_invalid");
  const refs = new Map(publication.tiles.map((ref) => [ref.key, ref]));
  const scene = new Map<string, RenderPrimitive>();
  for (const tile of tiles) {
    if (
      tile.worldId !== publication.worldId ||
      tile.revision !== publication.revision ||
      tile.timeSystemId !== publication.timeSystemId ||
      (tile.level !== level &&
        !(tile.bucketKind === "overflow" && tile.level < level))
    )
      throw Error("render_mixed_revision");
    const key = renderTileKey(tile, tile);
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
  const parents = new Map<string, Set<string>>();
  for (const [parent, childIds] of children) {
    for (const child of childIds) {
      const ids = parents.get(child) ?? new Set<string>();
      ids.add(parent);
      parents.set(child, ids);
    }
  }
  const support = new Map<string, Point[]>();
  const depths = new Map<string, number>();
  const paddingProfiles = new Map<string, CompositePaddingProfile>();
  const supportComplete = new Map<string, boolean>();
  const visiting = new Set<string>();
  const resolve = (id: string): Point[] => {
    if (support.has(id)) return support.get(id)!;
    const stack: { id: string; exit: boolean }[] = [{ id, exit: false }];
    while (stack.length) {
      const frame = stack.pop()!;
      if (frame.exit) {
        const shape = shapes.get(frame.id);
        if (shape?.kind === "point") {
          support.set(frame.id, [shape.position]);
          supportComplete.set(frame.id, true);
        } else if (shape?.kind === "segment") {
          support.set(frame.id, [shape.start, shape.end]);
          supportComplete.set(frame.id, true);
        } else {
          const direct: Point[] = [],
            polygons: Point[][] = [];
          for (const child of [
            ...new Set(children.get(frame.id) ?? [])
          ].sort()) {
            const points = support.get(child) ?? [];
            if (shapes.get(child)?.kind === "region") polygons.push(points);
            else direct.push(...points);
          }
          const hull = buildRenderConcaveHull(direct, polygons);
          support.set(frame.id, hull);
          paddingProfiles.set(
            frame.id,
            buildCompositePaddingProfile(
              hull.length
                ? boundsOf(hull)
                : shape?.kind === "region"
                  ? shape.bounds
                  : { minY: 0, maxY: 0 },
              [...new Set(children.get(frame.id) ?? [])].flatMap((child) => {
                const profile = paddingProfiles.get(child);
                return profile ? [profile] : [];
              })
            )
          );
          const childIds = [...new Set(children.get(frame.id) ?? [])];
          supportComplete.set(
            frame.id,
            shape?.kind === "region" &&
              childIds.length > 0 &&
              childIds.every(
                (child) =>
                  shapes.has(child) && supportComplete.get(child) === true
              )
          );
          // Match GraphShell's bottom-up hull depth, not root distance.
          depths.set(
            frame.id,
            1 +
              Math.max(
                0,
                ...[...new Set(children.get(frame.id) ?? [])]
                  .filter((child) => shapes.get(child)?.kind === "region")
                  .map((child) => depths.get(child) ?? 1)
              )
          );
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
  const ancestorCache = new Map<string, readonly string[]>();
  const ancestorIds = (id: string): readonly string[] => {
    const cached = ancestorCache.get(id);
    if (cached) return cached;
    const ancestors = new Set<string>();
    const stack = [...(parents.get(id) ?? [])];
    while (stack.length) {
      const parent = stack.pop()!;
      if (parent === id) throw Error("render_contains_cycle");
      if (ancestors.has(parent)) continue;
      ancestors.add(parent);
      if (ancestors.size > 1024)
        throw Error("render_hierarchy_budget_exceeded");
      const known = ancestorCache.get(parent);
      if (known) stack.push(...known);
      else stack.push(...(parents.get(parent) ?? []));
    }
    const result = [...ancestors].sort();
    ancestorCache.set(id, result);
    return result;
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
      visibility: {
        policy: "render-visibility/1",
        priority: digest(entity.id).slice(0, 16)
      },
      parentCompositeIds: [...(parents.get(entity.id) ?? [])].sort(),
      ancestorCompositeIds: ancestorIds(entity.id),
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
      const hullBounds = boundsOf(polygon);
      const anchor = {
        x: (hullBounds.minX + hullBounds.maxX) / 2,
        y: (hullBounds.minY + hullBounds.maxY) / 2
      };
      const composite = {
        childEventIds: childEventIds.slice(0, 128),
        childEventCount: childEventIds.length,
        childIdsComplete: childEventIds.length <= 128,
        supportComplete: supportComplete.get(id) === true,
        worldBounds: shape.bounds,
        hullBounds,
        depth: depths.get(id) ?? 1,
        paddingProfile:
          paddingProfiles.get(id) ??
          buildCompositePaddingProfile(hullBounds, []),
        anchor,
        transitions: {
          pointEnterMaxSizePx: 12,
          pointExitMaxSizePx: 20,
          childFadeHeightPx: [58, 100] as const,
          childFadeSpanPx: [4, 16] as const,
          paddingBasePx: 6,
          paddingPerDepthPx: 5
        }
      };
      add(
        `event:${id}:hull`,
        { kind: "composite", id },
        { kind: "polygon", rings: [polygon] },
        polygon,
        label,
        { visible: [0, 8], groupId: id },
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
      format: "render-publication/2",
      worldId: layout.world_id,
      revision: layout.revision,
      timeSystemId: layout.time_system_id,
      algorithmVersion: "render-compiler/4",
      layoutAlgorithmVersion: layout.algorithm_version,
      spatialFrame: V5_RENDER_SPATIAL_FRAME,
      minLevel: V5_RENDER_SPATIAL_FRAME.minLevel,
      overflowLevels: [],
      maxLevel: V5_RENDER_SPATIAL_FRAME.maxLevel,
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
    const finestSpanX = V5_RENDER_SPATIAL_FRAME.baseSpanX * 2 ** -3;
    const finestSpanY = V5_RENDER_SPATIAL_FRAME.baseSpanY * 2 ** -3;
    const spansManyTiles =
      (primitive.bounds.maxX - primitive.bounds.minX) / finestSpanX > 0.25 ||
      (primitive.bounds.maxY - primitive.bounds.minY) / finestSpanY > 0.25;
    // Hulls are independently loadable while the Composite is a compact point.
    if (
      primitive.geometry.kind !== "polygon" &&
      vertexCount <= 32 &&
      !spansManyTiles
    )
      return primitive;
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
  const frame = V5_RENDER_SPATIAL_FRAME;
  const primitiveCoverage = (
    primitive: RenderPrimitive,
    level: number,
    maxTiles: number
  ) => {
    const coverage = renderTileAddresses(
      frame,
      primitive.bounds,
      level,
      maxTiles
    );
    // Line/polygon geometry is closed: a maximum endpoint exactly on a cell
    // edge must also be available from its positive-side owner. Points keep
    // their single half-open owner. This avoids missing a hull/line when a
    // viewport begins exactly on that edge.
    if (primitive.geometry.kind !== "point") {
      const edgeBounds = [
        { ...primitive.bounds, minX: primitive.bounds.maxX },
        { ...primitive.bounds, minY: primitive.bounds.maxY }
      ];
      const seen = new Set(
        coverage.map((address) => `${address.x}/${address.y}`)
      );
      for (const edge of edgeBounds)
        for (const address of renderTileAddresses(
          frame,
          edge,
          level,
          maxTiles
        )) {
          const key = `${address.x}/${address.y}`;
          if (!seen.has(key)) {
            coverage.push(address);
            seen.add(key);
          }
        }
      // Both maximum coordinates may share a corner outside either strip.
      for (const address of renderTileAddresses(
        frame,
        {
          minX: primitive.bounds.maxX,
          maxX: primitive.bounds.maxX,
          minY: primitive.bounds.maxY,
          maxY: primitive.bounds.maxY
        },
        level,
        1
      )) {
        if (!seen.has(`${address.x}/${address.y}`)) coverage.push(address);
      }
      if (coverage.length > maxTiles)
        throw Error("render_tile_budget_exceeded");
    }
    return coverage;
  };
  const homeLevels = new Map<string, number>();
  for (const primitive of renderPrimitives) {
    let homeLevel = frame.maxLevel;
    if (primitive.geometry.kind !== "point") {
      for (; homeLevel > frame.minLevel; homeLevel--) {
        try {
          primitiveCoverage(primitive, homeLevel, 16);
          break;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== "render_tile_budget_exceeded"
          )
            throw error;
        }
      }
    }
    homeLevels.set(primitive.id, homeLevel);
  }
  const tiles: RenderTile[] = [];
  const authoredOwners = new Map(
    renderPrimitives
      .filter((primitive) => primitive.entity.kind === "composite")
      .map((primitive) => [primitive.entity.id, primitive])
  );
  const overflowLevels = new Set<number>();
  // Spatial resolution is independent of semantic LOD. In particular a signed
  // negative cell level must not silently erase authored hulls or Events.
  // GraphShell evaluates the published point/hull/child transitions in pixels.
  for (let level = frame.minLevel; level <= frame.maxLevel; level++) {
    const buckets = new Map<
      string,
      {
        x: number;
        y: number;
        bucketKind?: "overflow";
        primitives: RenderPrimitive[];
      }
    >();
    for (const primitive of renderPrimitives) {
      const homeLevel = homeLevels.get(primitive.id)!;
      if (level > homeLevel) continue;
      const coverage = primitiveCoverage(primitive, level, 65_536);
      for (const address of coverage) {
        const kinds =
          homeLevel === level && level < frame.maxLevel
            ? [undefined, "overflow" as const]
            : [undefined];
        for (const bucketKind of kinds) {
          const key = `${bucketKind ?? "normal"}/${address.x}/${address.y}`;
          const bucket = buckets.get(key) ?? {
            x: address.x,
            y: address.y,
            ...(bucketKind ? { bucketKind } : {}),
            primitives: []
          };
          bucket.primitives.push(primitive);
          buckets.set(key, bucket);
          if (bucketKind) overflowLevels.add(level);
        }
      }
    }
    const priority = (a: RenderPrimitive, b: RenderPrimitive) =>
      a.visibility!.priority.localeCompare(b.visibility!.priority) ||
      a.id.localeCompare(b.id);
    const orderedBuckets = [...buckets.values()].sort(
      (a, b) =>
        (a.bucketKind ?? "").localeCompare(b.bucketKind ?? "") ||
        a.y - b.y ||
        a.x - b.x
    );
    const selectedByBucket = new Map<
      (typeof orderedBuckets)[number],
      RenderPrimitive[]
    >();
    const represented = new Set<string>();
    for (const bucket of orderedBuckets) {
      // A child bucket also carries its prepared authored owners. A large
      // parent's coarse overflow bucket has an independent candidate budget;
      // relying on it can leave fine children visible with their parent absent.
      // Only metadata is replicated into existing buckets; geometry stays
      // content-addressed and every output bucket retains the same 128 cap.
      const available = new Map(
        bucket.primitives.map((item) => [item.id, item])
      );
      for (const item of bucket.primitives)
        if (item.entity.kind !== "relation")
          for (const id of item.ancestorCompositeIds ??
            item.parentCompositeIds ??
            []) {
            const parent = authoredOwners.get(id);
            if (parent) available.set(parent.id, parent);
          }
      bucket.primitives = [...available.values()];
      // Preserve authored context before ranking leaves. Random owner omission
      // must not erase a still-large hull at a spatial tile-level boundary.
      const composites = bucket.primitives
        .filter((item) => item.entity.kind === "composite")
        .sort(priority);
      const events = bucket.primitives
        .filter((item) => item.entity.kind === "event")
        .sort(priority);
      const chosen = selectRenderPrimitiveClosure(
        [...composites, ...events],
        112
      );
      selectedByBucket.set(bucket, chosen);
      for (const primitive of chosen) represented.add(primitive.entity.id);
    }
    for (const bucket of orderedBuckets) {
      const chosen = selectedByBucket.get(bucket)!;
      const relations = bucket.primitives
        .filter(
          (item) =>
            item.entity.kind === "relation" &&
            item.endpointIds?.every((id) => represented.has(id))
        )
        .sort(priority)
        .slice(0, 16);
      chosen.push(...relations);
      const chosenIds = new Set(chosen.map((item) => item.id));
      const remainingEntities = bucket.primitives
        .filter(
          (item) => item.entity.kind !== "relation" && !chosenIds.has(item.id)
        )
        .sort(priority);
      chosen.push(
        ...selectRenderPrimitiveClosure(
          remainingEntities,
          128 - chosen.length,
          {
            available: bucket.primitives.filter(
              (item) => item.entity.kind !== "relation"
            ),
            already: chosen.filter((item) => item.entity.kind !== "relation")
          }
        )
      );
      chosen.sort(priority);
      const address = {
        level,
        x: bucket.x,
        y: bucket.y,
        ...(bucket.bucketKind ? { bucketKind: bucket.bucketKind } : {})
      };
      tiles.push({
        format: "render-tile/2",
        worldId: layout.world_id,
        revision: layout.revision,
        timeSystemId: layout.time_system_id,
        ...address,
        bounds: renderTileBounds(frame, address),
        primitives: chosen,
        visibility: {
          policy: "render-visibility/1",
          candidateCount: bucket.primitives.length,
          omittedCount: bucket.primitives.length - chosen.length,
          normalBudget: 64,
          smallBudget: 32,
          bufferBudget: 32
        }
      });
    }
  }
  const finalTiles = tiles;
  const documents = finalTiles.map((tile) => ({
    key: renderTileKey(tile, tile),
    body: JSON.stringify(tile)
  }));
  // Large Composite/relation fragments and pathological membership signatures
  // still require external geometry or a finer partition. Fail closed.
  if (
    documents.some((document) => Buffer.byteLength(document.body) > 1024 * 1024)
  )
    throw Error("render_tile_budget_exceeded");
  return {
    format: "render-publication/2",
    worldId: layout.world_id,
    revision: layout.revision,
    timeSystemId: layout.time_system_id,
    algorithmVersion: "render-compiler/4",
    layoutAlgorithmVersion: layout.algorithm_version,
    spatialFrame: frame,
    minLevel: frame.minLevel,
    overflowLevels: [...overflowLevels].sort((a, b) => a - b),
    maxLevel: frame.maxLevel,
    bounds: world,
    tiles: documents.map((document, i) => ({
      key: document.key,
      sha256: digest(document.body),
      bounds: finalTiles[i]!.bounds,
      level: finalTiles[i]!.level,
      x: finalTiles[i]!.x,
      y: finalTiles[i]!.y,
      ...(finalTiles[i]!.bucketKind
        ? { bucketKind: finalTiles[i]!.bucketKind }
        : {})
    })),
    documents,
    geometry: [...geometry.values()],
    geometryDocuments: [...geometryDocuments].map(([key, body]) => ({
      key,
      body
    }))
  };
}

/** Presentation visibility is not canonical completeness. Require only known
 * identities and explicit, internally consistent omission metadata. The caller
 * separately proves full canonical/spatial coverage before attaching a sidecar. */
export function verifyRenderVisibilityCoverage(
  publication: RenderPublication,
  placedEventIds: ReadonlySet<string>,
  relationIds: ReadonlySet<string>
): void {
  const represented = new Set<string>();
  let omissions = 0;
  for (const document of publication.documents) {
    const tile = JSON.parse(document.body) as RenderTile;
    const policy = tile.visibility;
    if (publication.algorithmVersion === "render-compiler/4") {
      if (
        !policy ||
        policy.policy !== "render-visibility/1" ||
        !Number.isSafeInteger(policy.candidateCount) ||
        !Number.isSafeInteger(policy.omittedCount) ||
        policy.omittedCount < 0 ||
        policy.candidateCount !==
          tile.primitives.length + policy.omittedCount ||
        tile.primitives.length > 128 ||
        policy.normalBudget !== 64 ||
        policy.smallBudget !== 32 ||
        policy.bufferBudget !== 32
      )
        throw Error("v5_render_visibility_policy_invalid");
      omissions += policy.omittedCount;
    }
    for (const primitive of tile.primitives) {
      if (
        primitive.entity.kind === "event" ||
        primitive.entity.kind === "composite"
      ) {
        if (!placedEventIds.has(primitive.entity.id))
          throw Error("v5_render_event_coverage_invalid");
        represented.add(primitive.entity.id);
      } else if (primitive.entity.kind === "relation") {
        if (
          !relationIds.has(primitive.entity.id) ||
          !primitive.endpointIds?.every((id) => placedEventIds.has(id))
        )
          throw Error("v5_render_event_coverage_invalid");
      } else if (publication.algorithmVersion === "render-compiler/4")
        throw Error("v5_render_event_coverage_invalid");
    }
  }
  if (represented.size < placedEventIds.size && omissions === 0)
    throw Error("v5_render_event_coverage_invalid");
}
