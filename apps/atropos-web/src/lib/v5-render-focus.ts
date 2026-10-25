import type { readV5RenderGeneration } from "@moirai/publication/v5";
import type { RenderPrimitive } from "@moirai/graph-presentation/server";

type Generation = Awaited<ReturnType<typeof readV5RenderGeneration>>;

/** A deep-link lookup against served ink, never the older canonical X index.
 * Y remains source-stable across a same-revision Render recompile. The manifest
 * is read only for this explicit focus action; normal viewport reads stay on
 * the bounded Merkle index. No new index or publication write is necessary. */
export async function readV5RenderFocus(
  generation: Generation,
  timeSystemId: string,
  eventId: string,
  temporalBounds: { minY: number; maxY: number }
): Promise<{ x: number; y: number } | null> {
  const ref = generation.manifests.find((m) => m.timeSystemId === timeSystemId);
  if (!ref) return null;
  const manifest = JSON.parse(await generation.read(ref.key, ref.sha256)) as {
    worldId: string;
    revision: number;
    timeSystemId: string;
    tiles: {
      key: string;
      sha256: string;
      level: number;
      bounds: { minY: number; maxY: number };
    }[];
  };
  if (
    manifest.revision !== generation.revision ||
    manifest.timeSystemId !== timeSystemId
  )
    throw Error("render_focus_source_mismatch");
  const candidates = manifest.tiles.filter(
    (tile) =>
      tile.bounds.minY <= temporalBounds.maxY &&
      tile.bounds.maxY >= temporalBounds.minY
  );
  const levels = [...new Set(candidates.map((tile) => tile.level))].sort(
    (a, b) => b - a
  );
  let reads = 0;
  for (const level of levels) {
    const tiles = candidates.filter((tile) => tile.level === level);
    // A long Composite can span many fine cells; try its coarser replica.
    if (tiles.length > 64 - reads) continue;
    for (let offset = 0; offset < tiles.length; offset += 8) {
      const batch = tiles.slice(offset, offset + 8);
      reads += batch.length;
      const bodies = await Promise.all(
        batch.map((tile) => generation.read(tile.key, tile.sha256))
      );
      for (const body of bodies) {
        const tile = JSON.parse(body) as {
          revision: number;
          worldId: string;
          timeSystemId: string;
          primitives: RenderPrimitive[];
        };
        if (
          tile.revision !== generation.revision ||
          tile.worldId !== manifest.worldId ||
          tile.timeSystemId !== timeSystemId
        )
          throw Error("render_focus_source_mismatch");
        const primitive = tile.primitives.find(
          (p) => p.entity.kind !== "relation" && p.entity.id === eventId
        );
        if (primitive) {
          const bounds = primitive.bounds;
          return {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2
          };
        }
      }
    }
  }
  return null;
}
