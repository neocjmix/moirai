/** Bounded offline/Atropos viewport walk. Caller supplies a digest-verified
 * immutable manifest and document reader; no World materialization occurs. */
import { createHash } from "node:crypto";
import { spatialIntersects, type V5SpatialNode } from "./v5-spatial-index.js";
import type { V5WorldLayout } from "./v5-world-layout.js";

type Box = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
};
type Shape = V5WorldLayout["shapes"][number];
interface Pending {
  readonly key: string;
  readonly bounds: Box;
  readonly level: number;
  readonly offset: number;
}
export interface V5ViewportCursor {
  readonly query_digest: string;
  readonly pending: readonly Pending[];
}
const validBox = (b: Box) =>
  b &&
  [b.minX, b.maxX, b.minY, b.maxY].every(Number.isFinite) &&
  b.minX <= b.maxX &&
  b.minY <= b.maxY;

export async function readV5WorldViewport(
  manifestBody: string,
  viewport: Box,
  limit: number,
  cursor: V5ViewportCursor | null,
  get: (key: string) => Promise<string | null>,
  maxNodeReads = 64
): Promise<{
  readonly shapes: readonly Shape[];
  readonly next_cursor: V5ViewportCursor | null;
  readonly node_reads: number;
}> {
  const manifest = JSON.parse(manifestBody) as {
    format_version: string;
    world_id: string;
    revision: number;
    time_system_id: string;
    depth: number;
    fanout: number;
    entries: { key: string; bounds: Box }[];
  };
  const prefix = `worlds/${manifest.world_id}/revisions/${manifest.revision}/v5/spatial/${manifest.time_system_id}/nodes/`;
  if (
    manifest.format_version !== "v5-world-spatial/1" ||
    !/^[a-zA-Z0-9-]+$/.test(manifest.world_id) ||
    !/^[a-zA-Z0-9-]+$/.test(manifest.time_system_id) ||
    !Number.isSafeInteger(manifest.revision) ||
    manifest.revision < 1 ||
    !Number.isSafeInteger(manifest.depth) ||
    manifest.depth < 0 ||
    manifest.depth > 8 ||
    manifest.fanout !== 128 ||
    !Array.isArray(manifest.entries) ||
    manifest.entries.length > 128 ||
    !manifest.entries.every(
      (ref) =>
        ref.key.startsWith(`${prefix}${manifest.depth}/`) &&
        validBox(ref.bounds)
    ) ||
    !validBox(viewport) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 128 ||
    !Number.isSafeInteger(maxNodeReads) ||
    maxNodeReads < 1 ||
    maxNodeReads > 64
  )
    throw Error("v5_viewport_query_invalid");
  const queryDigest = createHash("sha256")
    .update(JSON.stringify([manifestBody, viewport, limit]))
    .digest("hex");
  if (
    cursor &&
    (cursor.query_digest !== queryDigest ||
      !Array.isArray(cursor.pending) ||
      cursor.pending.length < 1 ||
      cursor.pending.length > 2048 ||
      cursor.pending.some(
        (entry) =>
          !entry ||
          typeof entry.key !== "string" ||
          !entry.key.startsWith(`${prefix}${entry.level}/`) ||
          !Number.isSafeInteger(entry.level) ||
          entry.level < 0 ||
          entry.level > manifest.depth ||
          !Number.isSafeInteger(entry.offset) ||
          entry.offset < 0 ||
          entry.offset >= 128 ||
          !validBox(entry.bounds)
      ))
  )
    throw Error("v5_viewport_cursor_invalid");
  const pending: Pending[] = cursor
    ? [...cursor.pending]
    : manifest.entries
        .map((ref) => ({ ...ref, level: manifest.depth, offset: 0 }))
        .reverse();
  const shapes: Shape[] = [];
  let reads = 0;
  while (pending.length && reads < maxNodeReads && shapes.length < limit) {
    const ref = pending.pop()!;
    if (!spatialIntersects(ref.bounds, viewport)) continue;
    const body = await get(ref.key);
    reads++;
    if (body === null) throw Error("v5_viewport_node_missing");
    const node = JSON.parse(body) as V5SpatialNode;
    if (
      !Array.isArray(node.entries) ||
      node.entries.length < 1 ||
      node.entries.length > 128 ||
      node.kind !== (ref.level === 0 ? "leaf" : "branch")
    )
      throw Error("v5_viewport_node_invalid");
    if (node.kind === "branch") {
      if (ref.offset !== 0) throw Error("v5_viewport_cursor_invalid");
      for (const entry of [...node.entries].reverse()) {
        if (
          !entry.key.startsWith(`${prefix}${ref.level - 1}/`) ||
          !validBox(entry.bounds)
        )
          throw Error("v5_viewport_node_invalid");
        if (spatialIntersects(entry.bounds, viewport))
          pending.push({ ...entry, level: ref.level - 1, offset: 0 });
      }
    } else {
      for (let index = ref.offset; index < node.entries.length; index++) {
        const item = node.entries[index]!;
        if (!validBox(item.bounds) || !item.shape?.event_id)
          throw Error("v5_viewport_node_invalid");
        if (!spatialIntersects(item.bounds, viewport)) continue;
        shapes.push(item.shape);
        if (shapes.length === limit && index + 1 < node.entries.length)
          pending.push({ ...ref, offset: index + 1 });
        if (shapes.length === limit) break;
      }
    }
    if (pending.length > 2048)
      throw Error("v5_viewport_cursor_budget_exceeded");
  }
  return {
    shapes,
    next_cursor: pending.length ? { query_digest: queryDigest, pending } : null,
    node_reads: reads
  };
}
