/** Offline X experiment. A lane is a drawing allocation, never a contains edge.
 * Exact ancestor signatures keep DAG sharing intact; only leaves occupy lanes.
 * Disjoint temporal groups reuse space, while overlapping groups keep gutters.
 * No viewport, Collection selection, titles or historical importance are inputs.
 */
import type { TstlProjection } from "../../packages/graph-presentation/src/tstl-validator.js";
import type { TstlComparisonEvent } from "./candidate.js";
import { orderTstlRoots } from "./candidate.js";

export const SEMANTIC_LANE_PARAMETERS = {
  version: "exact-signature-temporal-lanes/1",
  yScale: 0.2,
  supportGap: 10,
  peerGutter: 8,
  rootGutter: 28,
  minimumBandWidth: 40,
  episodeGap: 120
} as const;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export interface SemanticLane {
  signature: string[];
  rootSignature: string[];
  eventIds: string[];
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
  columns: number;
}

export function placeSemanticLanes(
  projection: TstlProjection,
  events: readonly TstlComparisonEvent[],
  parameters: {
    version: string;
    yScale: number;
    supportGap: number;
    peerGutter: number;
    rootGutter: number;
    minimumBandWidth: number;
    episodeGap: number;
  } = SEMANTIC_LANE_PARAMETERS
) {
  if (projection.status !== "COMPLETE") throw Error("lanes_incomplete_dag");
  if (
    ![
      parameters.peerGutter,
      parameters.rootGutter,
      parameters.minimumBandWidth,
      parameters.episodeGap
    ].every((v) => Number.isFinite(v) && v >= 0) ||
    ![parameters.yScale, parameters.supportGap].every(
      (v) => Number.isFinite(v) && v > 0
    )
  )
    throw Error("lanes_invalid_gutter");
  const byId = new Map(events.map((e) => [e.eventId, e]));
  if (
    byId.size !== projection.eventIds.length ||
    events.length !== byId.size ||
    projection.eventIds.some((id) => !byId.has(id)) ||
    events.some((e) => !Number.isFinite(e.sourceY))
  )
    throw Error("lanes_event_domain");
  const roots = orderTstlRoots(projection).anchorIds;
  const rootRank = new Map(roots.map((id, i) => [id, i]));
  const bands = new Map<string, Map<string, SemanticLane>>();
  for (const id of [...projection.leafIds].sort(compare)) {
    const signature = [...projection.ancestors[id]!].sort(compare);
    const rootSignature = signature.filter((id) => rootRank.has(id));
    // A standalone Event is its own root, not assigned a fabricated parent.
    if (!rootSignature.length) rootSignature.push(id);
    const bandKey = JSON.stringify(rootSignature);
    const groupKey = JSON.stringify(signature.length ? signature : [id]);
    if (!bands.has(bandKey)) bands.set(bandKey, new Map());
    const groups = bands.get(bandKey)!;
    if (!groups.has(groupKey))
      groups.set(groupKey, {
        signature,
        rootSignature,
        eventIds: [],
        minY: Infinity,
        maxY: -Infinity,
        minX: 0,
        maxX: 0,
        columns: 0
      });
    const group = groups.get(groupKey)!;
    const y = byId.get(id)!.sourceY * parameters.yScale;
    group.eventIds.push(id);
    group.minY = Math.min(group.minY, y - parameters.supportGap / 2);
    group.maxY = Math.max(group.maxY, y + parameters.supportGap / 2);
  }
  const meanRank = (key: string) => {
    const ids = JSON.parse(key) as string[];
    return ids.reduce((n, id) => n + rootRank.get(id)!, 0) / ids.length;
  };
  const keys = [...bands.keys()].sort(
    (a, b) => meanRank(a) - meanRank(b) || compare(a, b)
  );
  const positions: Record<string, number> = {};
  const lanes: SemanticLane[] = [];
  const bandBounds: { rootSignature: string[]; minX: number; maxX: number }[] =
    [];
  let cursor = 0;
  for (const key of keys) {
    const groups = [...bands.get(key)!.values()]
      .flatMap((group) => {
        const episodes: SemanticLane[] = [];
        for (const id of [...group.eventIds].sort(
          (a, b) => byId.get(a)!.sourceY - byId.get(b)!.sourceY || compare(a, b)
        )) {
          const y = byId.get(id)!.sourceY * parameters.yScale;
          let episode = episodes.at(-1);
          // This threshold only permits reuse of empty drawing space. It does
          // not infer duration, new Events, or changed temporal/contains facts.
          if (
            !episode ||
            y - parameters.supportGap / 2 - episode.maxY > parameters.episodeGap
          ) {
            episode = {
              ...group,
              eventIds: [],
              minY: y - parameters.supportGap / 2,
              maxY: y + parameters.supportGap / 2
            };
            episodes.push(episode);
          }
          episode.eventIds.push(id);
          episode.maxY = y + parameters.supportGap / 2;
        }
        return episodes;
      })
      .sort(
        (a, b) =>
          a.minY - b.minY ||
          b.maxY - a.maxY ||
          compare(JSON.stringify(a.signature), JSON.stringify(b.signature))
      );
    const placed: SemanticLane[] = [];
    let bandWidth = parameters.minimumBandWidth as number;
    for (const group of groups) {
      const ends: number[] = [];
      const columnById = new Map<string, number>();
      // Interval partitioning uses the minimum number of columns for this
      // signature's nominal supports. Input order never breaks ties.
      for (const id of group.eventIds.sort(
        (a, b) => byId.get(a)!.sourceY - byId.get(b)!.sourceY || compare(a, b)
      )) {
        const y = byId.get(id)!.sourceY * parameters.yScale;
        let column = ends.findIndex(
          (end) => end <= y - parameters.supportGap / 2
        );
        if (column < 0) column = ends.length;
        ends[column] = y + parameters.supportGap / 2;
        columnById.set(id, column);
      }
      group.columns = ends.length;
      const width = group.columns * parameters.supportGap;
      const blockers = placed
        .filter((g) => g.minY < group.maxY && g.maxY > group.minY)
        .sort((a, b) => a.minX - b.minX);
      let left = 0;
      for (const blocker of blockers) {
        if (left + width + parameters.peerGutter <= blocker.minX) break;
        left = Math.max(left, blocker.maxX + parameters.peerGutter);
      }
      group.minX = left;
      group.maxX = left + width;
      for (const id of group.eventIds)
        positions[id] =
          cursor + left + (columnById.get(id)! + 0.5) * parameters.supportGap;
      placed.push(group);
      bandWidth = Math.max(bandWidth, group.maxX);
    }
    for (const group of placed) {
      group.minX += cursor;
      group.maxX += cursor;
      lanes.push(group);
    }
    bandBounds.push({
      rootSignature: JSON.parse(key) as string[],
      minX: cursor,
      maxX: cursor + bandWidth
    });
    cursor += bandWidth + parameters.rootGutter;
  }
  const center = (cursor - parameters.rootGutter) / 2;
  for (const id of projection.leafIds) positions[id] = positions[id]! - center;
  for (const group of lanes) {
    group.minX -= center;
    group.maxX -= center;
  }
  for (const band of bandBounds) {
    band.minX -= center;
    band.maxX -= center;
  }
  // A header is an annotation of its own Composite, not a leaf witness.
  // Median descendants do not invent root memberships for shared Composites.
  for (const id of projection.compositeIds) {
    const xs = projection.leafMembers[id]!.map((leaf) => positions[leaf]!).sort(
      (a, b) => a - b
    );
    positions[id] =
      (xs[Math.floor((xs.length - 1) / 2)]! + xs[Math.floor(xs.length / 2)]!) /
      2;
  }
  if (
    Object.keys(positions).length !== events.length ||
    Object.values(positions).some((x) => !Number.isFinite(x))
  )
    throw Error("lanes_invalid_output");
  return {
    algorithmVersion: parameters.version,
    parameters,
    positions,
    lanes,
    bandBounds,
    width: cursor - parameters.rootGutter
  };
}
