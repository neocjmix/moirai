import { createHash } from "node:crypto";

export type RenderBox = Readonly<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}>;
export type RenderReadSummary = Readonly<{
  format: "render-publication/2";
  algorithmVersion: "render-compiler/4";
  layoutAlgorithmVersion?: string;
  bounds: RenderBox | null;
  maxLevel: number;
  overflowLevels: readonly number[];
  spatialFrame: Readonly<{
    format: "render-spatial-frame/1";
    originX: number;
    originY: number;
    baseSpanX: number;
    baseSpanY: number;
    minLevel: number;
    maxLevel: number;
  }>;
}>;
export type RenderIndexRef = Readonly<{
  key: string;
  sha256: string;
  first: string;
  last: string;
}>;
type Document = Readonly<{ key: string; body: string }>;
const hash = (body: string) => createHash("sha256").update(body).digest("hex");
const FANOUT = 64;

export function isRenderBox(value: unknown): value is RenderBox {
  if (!value || typeof value !== "object") return false;
  const box = value as RenderBox;
  return (
    [box.minX, box.maxX, box.minY, box.maxY].every(Number.isFinite) &&
    box.minX <= box.maxX &&
    box.minY <= box.maxY
  );
}

/** Only constant-size generation metadata enters the viewport critical path. */
export function renderReadSummary(value: unknown): RenderReadSummary {
  const summary = value as RenderReadSummary;
  const frame = summary?.spatialFrame;
  if (
    summary?.format !== "render-publication/2" ||
    summary.algorithmVersion !== "render-compiler/4" ||
    (summary.layoutAlgorithmVersion !== undefined &&
      (typeof summary.layoutAlgorithmVersion !== "string" ||
        !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(
          summary.layoutAlgorithmVersion
        ))) ||
    (summary.bounds !== null && !isRenderBox(summary.bounds)) ||
    frame?.format !== "render-spatial-frame/1" ||
    ![frame.originX, frame.originY, frame.baseSpanX, frame.baseSpanY].every(
      Number.isFinite
    ) ||
    frame.baseSpanX <= 0 ||
    frame.baseSpanY <= 0 ||
    !Number.isInteger(frame.minLevel) ||
    !Number.isInteger(frame.maxLevel) ||
    frame.minLevel < -32 ||
    frame.maxLevel > 32 ||
    frame.minLevel > frame.maxLevel ||
    summary.maxLevel !== frame.maxLevel
  )
    throw Error("render_summary_invalid");
  const overflowLevels = summary.overflowLevels ?? [];
  if (
    !Array.isArray(overflowLevels) ||
    overflowLevels.length > 65 ||
    overflowLevels.some(
      (level, index) =>
        !Number.isInteger(level) ||
        level < frame.minLevel ||
        level > frame.maxLevel ||
        (index > 0 && overflowLevels[index - 1]! >= level)
    )
  )
    throw Error("render_summary_invalid");
  return {
    format: summary.format,
    algorithmVersion: summary.algorithmVersion,
    ...(summary.layoutAlgorithmVersion === undefined
      ? {}
      : { layoutAlgorithmVersion: summary.layoutAlgorithmVersion }),
    bounds:
      summary.bounds === null
        ? null
        : {
            minX: summary.bounds.minX,
            maxX: summary.bounds.maxX,
            minY: summary.bounds.minY,
            maxY: summary.bounds.maxY
          },
    maxLevel: summary.maxLevel,
    overflowLevels: [...overflowLevels],
    spatialFrame: {
      format: frame.format,
      originX: frame.originX,
      originY: frame.originY,
      baseSpanX: frame.baseSpanX,
      baseSpanY: frame.baseSpanY,
      minLevel: frame.minLevel,
      maxLevel: frame.maxLevel
    }
  };
}

/** Publication-time sorted Merkle tree. No viewport ever materializes its leaves. */
export function buildRenderAssetIndex(
  prefix: string,
  assets: readonly Document[]
): { root: RenderIndexRef | null; documents: Document[] } {
  const documents: Document[] = [];
  let refs: RenderIndexRef[] = [...assets]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ key, body }) => ({
      key,
      sha256: hash(body),
      first: key,
      last: key
    }));
  if (
    refs.some(
      (ref, index) =>
        !ref.key.startsWith(prefix) ||
        ref.key.includes("..") ||
        (index > 0 && refs[index - 1]!.key === ref.key)
    )
  )
    throw Error("render_asset_index_input_invalid");
  if (!refs.length) return { root: null, documents };
  for (let depth = 0; ; depth++) {
    const next: RenderIndexRef[] = [];
    for (let offset = 0; offset < refs.length; offset += FANOUT) {
      const entries = refs.slice(offset, offset + FANOUT);
      const key = `${prefix}asset-index/${depth}/${next.length}.json`;
      const body = JSON.stringify({
        format: "render-asset-index/1",
        kind: depth === 0 ? "leaf" : "branch",
        entries
      });
      documents.push({ key, body });
      next.push({
        key,
        sha256: hash(body),
        first: entries[0]!.first,
        last: entries.at(-1)!.last
      });
    }
    if (next.length === 1) return { root: next[0]!, documents };
    refs = next;
  }
}

export function createRenderAssetReader(
  prefix: string,
  root: RenderIndexRef | null,
  read: (key: string, sha256: string) => Promise<string>
): (key: string) => Promise<{ body: string; sha256: string } | null> {
  const nodes = new Map<string, Promise<string>>();
  return async (key) => {
    if (!key.startsWith(prefix) || key.includes(".."))
      throw Error("render_generation_asset_unlisted");
    let ref = root;
    for (let depth = 0; ref && depth < 16; depth++) {
      if (key < ref.first || key > ref.last) return null;
      if (!ref.key.startsWith(`${prefix}asset-index/`))
        throw Error("render_asset_index_invalid");
      let pending = nodes.get(ref.key);
      if (!pending) {
        pending = read(ref.key, ref.sha256);
        nodes.set(ref.key, pending);
      }
      const body = await pending;
      if (Buffer.byteLength(body) > 64 * 1024)
        throw Error("render_asset_index_invalid");
      const node = JSON.parse(body) as {
        format: string;
        kind: string;
        entries: RenderIndexRef[];
      };
      if (
        node.format !== "render-asset-index/1" ||
        !["branch", "leaf"].includes(node.kind) ||
        !Array.isArray(node.entries) ||
        !node.entries.length ||
        node.entries.length > FANOUT ||
        node.entries[0]!.first !== ref.first ||
        node.entries.at(-1)!.last !== ref.last ||
        node.entries.some(
          (entry, index) =>
            !entry.key.startsWith(prefix) ||
            !/^[0-9a-f]{64}$/.test(entry.sha256) ||
            typeof entry.first !== "string" ||
            typeof entry.last !== "string" ||
            entry.first > entry.last ||
            (index > 0 && node.entries[index - 1]!.last >= entry.first) ||
            (node.kind === "leaf" &&
              (entry.key !== entry.first || entry.key !== entry.last))
        )
      )
        throw Error("render_asset_index_invalid");
      ref =
        node.entries.find((entry) => key >= entry.first && key <= entry.last) ??
        null;
      if (node.kind === "leaf")
        return ref
          ? { body: await read(ref.key, ref.sha256), sha256: ref.sha256 }
          : null;
    }
    if (ref) throw Error("render_asset_index_depth_exceeded");
    return null;
  };
}
