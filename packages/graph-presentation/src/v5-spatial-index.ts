/** Immutable World geometry R-tree. Built offline, independent of Collection
 * selection. Far-away World Events add tree depth, not a full-scan read cost. */
import type { V5WorldLayout } from "./v5-world-layout.js";

const FANOUT = 128;
type Box = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
};
type Item = V5WorldLayout["shapes"][number];
type Ref = { readonly key: string; readonly bounds: Box };
export type V5SpatialNode =
  | {
      readonly kind: "leaf";
      readonly entries: readonly {
        readonly shape: Item;
        readonly bounds: Box;
      }[];
    }
  | { readonly kind: "branch"; readonly entries: readonly Ref[] };
export interface V5SpatialIndex {
  readonly documents: readonly {
    readonly key: string;
    readonly body: string;
  }[];
  readonly manifest: { readonly key: string; readonly body: string };
}

function bounds(item: Item): Box {
  if (item.kind === "point")
    return {
      minX: item.position.x,
      maxX: item.position.x,
      minY: item.position.y,
      maxY: item.position.y
    };
  if (item.kind === "region") return item.bounds;
  return {
    minX: Math.min(item.start.x, item.end.x),
    maxX: Math.max(item.start.x, item.end.x),
    minY: Math.min(item.start.y, item.end.y),
    maxY: Math.max(item.start.y, item.end.y)
  };
}
function union(boxes: readonly Box[]): Box {
  return boxes.reduce<Box>(
    (box, next) => ({
      minX: Math.min(box.minX, next.minX),
      maxX: Math.max(box.maxX, next.maxX),
      minY: Math.min(box.minY, next.minY),
      maxY: Math.max(box.maxY, next.maxY)
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
}
export function spatialIntersects(a: Box, b: Box): boolean {
  return (
    a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY
  );
}

export function buildV5SpatialIndex(layout: V5WorldLayout): V5SpatialIndex {
  const { world_id, revision, time_system_id } = layout;
  if (
    !/^[a-zA-Z0-9-]+$/.test(world_id) ||
    !/^[a-zA-Z0-9-]+$/.test(time_system_id) ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    throw Error("v5_spatial_identity_invalid");
  const prefix = `worlds/${world_id}/revisions/${revision}/v5/spatial/${time_system_id}`;
  const records = layout.shapes.map((shape) => ({
    shape,
    bounds: bounds(shape)
  }));
  if (
    new Set(records.map((record) => record.shape.event_id)).size !==
      records.length ||
    records.some(
      ({ bounds: b }) =>
        [b.minX, b.maxX, b.minY, b.maxY].some((v) => !Number.isFinite(v)) ||
        b.minX > b.maxX ||
        b.minY > b.maxY
    )
  )
    throw Error("v5_spatial_geometry_invalid");
  records.sort(
    (a, b) =>
      (a.bounds.minY + a.bounds.maxY) / 2 -
        (b.bounds.minY + b.bounds.maxY) / 2 ||
      (a.bounds.minX + a.bounds.maxX) / 2 -
        (b.bounds.minX + b.bounds.maxX) / 2 ||
      (a.shape.event_id < b.shape.event_id
        ? -1
        : a.shape.event_id > b.shape.event_id
          ? 1
          : 0)
  );
  const documents: V5SpatialIndex["documents"][number][] = [];
  let level = 0;
  let entries: Ref[] = [];
  for (let offset = 0; offset < records.length; offset += FANOUT) {
    const items = records.slice(offset, offset + FANOUT);
    const key = `${prefix}/nodes/${level}/${offset / FANOUT}.json`;
    documents.push({
      key,
      body: JSON.stringify({
        kind: "leaf",
        entries: items
      } satisfies V5SpatialNode)
    });
    entries.push({ key, bounds: union(items.map((item) => item.bounds)) });
  }
  // The empty tree is explicit; no synthetic Event or giant fallback page.
  while (entries.length > FANOUT) {
    const next: Ref[] = [];
    level++;
    for (let offset = 0; offset < entries.length; offset += FANOUT) {
      const part = entries.slice(offset, offset + FANOUT);
      const key = `${prefix}/nodes/${level}/${offset / FANOUT}.json`;
      documents.push({
        key,
        body: JSON.stringify({
          kind: "branch",
          entries: part
        } satisfies V5SpatialNode)
      });
      next.push({ key, bounds: union(part.map((item) => item.bounds)) });
    }
    entries = next;
  }
  return {
    documents,
    manifest: {
      key: `${prefix}/manifest.json`,
      body: JSON.stringify({
        format_version: "v5-world-spatial/1",
        world_id,
        revision,
        time_system_id,
        algorithm_version: layout.algorithm_version,
        temporal_digest: layout.temporal_digest,
        shape_count: records.length,
        unplaced_count: layout.unplaced_event_ids.length,
        depth: level,
        fanout: FANOUT,
        entries
      })
    }
  };
}
