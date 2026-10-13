/** Offline, geometry-only Candidate C. Identity traces are never relation edges
 * or Event marks. All coordinates use Candidate A's fixed reference frame. */
import type {
  TstlBox,
  TstlPoint,
  TstlProjection
} from "../../packages/graph-presentation/src/tstl-validator.js";
import {
  A_PARAMETERS,
  orderTstlRoots,
  type TstlComparisonArtifact,
  type TstlComparisonEvent
} from "./candidate.js";
import type {
  TstlAlternativeGeometry,
  TstlIdentityTrace
} from "./candidate-bc-types.js";

export const C_PARAMETERS = {
  version: "fixed-a-spines-local-atoms-c/1",
  spineSpacing: 14,
  clearance: 3,
  boundaryOffset: 0.5,
  outerChannel: 24,
  portSpacing: 3,
  obstacleBinSize: 24,
  maxBinsPerGlyphAxis: 32,
  maxRouteChannels: 32,
  obstacleCheckBudget: 2_000_000
} as const;

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const inflate = (box: TstlBox, amount: number): TstlBox => ({
  minX: box.minX - amount,
  maxX: box.maxX + amount,
  minY: box.minY - amount,
  maxY: box.maxY + amount
});
const overlaps = (a: TstlBox, b: TstlBox) =>
  a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
const ring = (box: TstlBox): TstlPoint[] => [
  { x: box.minX, y: box.minY },
  { x: box.maxX, y: box.minY },
  { x: box.maxX, y: box.maxY },
  { x: box.minX, y: box.maxY }
];
const median = (values: number[]) => {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]!
    : (values[middle - 1]! + values[middle]!) / 2;
};

/** ID-stable minimum-gap isotonic projection of member reference-X medians.
 * Root order is already encoded in referenceX. No viewport or labels enter. */
export function candidateCSpinePositions(
  projection: TstlProjection,
  referenceX: Readonly<Record<string, number>>
): Record<string, number> {
  const owners = projection.compositeIds
    .map((id) => ({
      id,
      x: median(projection.leafMembers[id]!.map((leaf) => referenceX[leaf]!))
    }))
    .sort((a, b) => a.x - b.x || byId(a.id, b.id));
  const blocks: { first: number; last: number; sum: number; count: number }[] =
    [];
  for (const [index, owner] of owners.entries()) {
    blocks.push({
      first: index,
      last: index,
      sum: owner.x - index * C_PARAMETERS.spineSpacing,
      count: 1
    });
    while (blocks.length > 1) {
      const b = blocks.at(-1)!;
      const a = blocks.at(-2)!;
      if (a.sum / a.count <= b.sum / b.count) break;
      blocks.splice(-2, 2, {
        first: a.first,
        last: b.last,
        sum: a.sum + b.sum,
        count: a.count + b.count
      });
    }
  }
  const positions: Record<string, number> = {};
  for (const block of blocks)
    for (let index = block.first; index <= block.last; index++)
      positions[owners[index]!.id] =
        block.sum / block.count + index * C_PARAMETERS.spineSpacing;
  return positions;
}

/** Subtract closed inflated nonmember boxes, keeping an extra boundary gap. */
function spineSegments(
  x: number,
  minY: number,
  maxY: number,
  obstacles: readonly TstlBox[]
): TstlPoint[][] {
  const blocked = obstacles
    .filter((box) => box.minX <= x && box.maxX >= x)
    .map((box) => ({
      start: Math.max(minY, box.minY - C_PARAMETERS.boundaryOffset),
      end: Math.min(maxY, box.maxY + C_PARAMETERS.boundaryOffset)
    }))
    .filter((interval) => interval.start <= interval.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const segments: TstlPoint[][] = [];
  let cursor = minY;
  for (const interval of blocked) {
    if (interval.start > cursor)
      segments.push([
        { x, y: cursor },
        { x, y: interval.start }
      ]);
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < maxY)
    segments.push([
      { x, y: cursor },
      { x, y: maxY }
    ]);
  return segments;
}

function segmentTouchesBox(a: TstlPoint, b: TstlPoint, box: TstlBox) {
  if (a.y === b.y)
    return (
      a.y >= box.minY &&
      a.y <= box.maxY &&
      Math.min(a.x, b.x) <= box.maxX &&
      Math.max(a.x, b.x) >= box.minX
    );
  if (a.x === b.x)
    return (
      a.x >= box.minX &&
      a.x <= box.maxX &&
      Math.min(a.y, b.y) <= box.maxY &&
      Math.max(a.y, b.y) >= box.minY
    );
  throw Error("tstl_c_nonrectilinear_route");
}

function cleanTrace(points: TstlPoint[]): TstlPoint[] {
  const unique = points.filter(
    (point, index) =>
      index === 0 ||
      point.x !== points[index - 1]!.x ||
      point.y !== points[index - 1]!.y
  );
  return unique.filter((point, index) => {
    const previous = unique[index - 1];
    const next = unique[index + 1];
    return !(
      previous &&
      next &&
      ((previous.x === point.x && point.x === next.x) ||
        (previous.y === point.y && point.y === next.y))
    );
  });
}

interface RouteWork {
  obstacleChecks: number;
  broadPhaseQueries: number;
  exhausted: boolean;
}

interface IndexedGlyph {
  eventId: string;
  box: TstlBox;
}
interface GlyphIndex {
  horizontal: Map<number, IndexedGlyph[]>;
  vertical: Map<number, IndexedGlyph[]>;
  globalHorizontal: IndexedGlyph[];
  globalVertical: IndexedGlyph[];
}

/** An orthogonal segment needs one Y or X bucket. Long supports use the bounded
 * overflow lists; never enumerate an unbounded number of bins for an interval. */
function indexGlyphs(glyphs: readonly IndexedGlyph[]): GlyphIndex {
  const index: GlyphIndex = {
    horizontal: new Map(),
    vertical: new Map(),
    globalHorizontal: [],
    globalVertical: []
  };
  for (const glyph of glyphs)
    for (const axis of ["horizontal", "vertical"] as const) {
      const first = Math.floor(
        (axis === "horizontal" ? glyph.box.minY : glyph.box.minX) /
          C_PARAMETERS.obstacleBinSize
      );
      const last = Math.floor(
        (axis === "horizontal" ? glyph.box.maxY : glyph.box.maxX) /
          C_PARAMETERS.obstacleBinSize
      );
      if (
        !Number.isSafeInteger(first) ||
        !Number.isSafeInteger(last) ||
        last - first + 1 > C_PARAMETERS.maxBinsPerGlyphAxis
      ) {
        index[
          axis === "horizontal" ? "globalHorizontal" : "globalVertical"
        ].push(glyph);
        continue;
      }
      for (let bin = first; bin <= last; bin++) {
        const values = index[axis].get(bin) ?? [];
        values.push(glyph);
        index[axis].set(bin, values);
      }
    }
  return index;
}

function routeMembership(
  port: TstlPoint,
  spineX: number,
  segments: readonly TstlPoint[][],
  obstacles: readonly TstlBox[],
  index: GlyphIndex,
  sourceId: string,
  work: RouteWork
): TstlPoint[] | null {
  const onSpine = (y: number) =>
    segments.some((segment) => y >= segment[0]!.y && y <= segment[1]!.y);
  const clear = (points: TstlPoint[]) => {
    for (let at = 1; at < points.length; at++) {
      const a = points[at - 1]!;
      const b = points[at]!;
      const horizontal = a.y === b.y;
      const bin = Math.floor(
        (horizontal ? a.y : a.x) / C_PARAMETERS.obstacleBinSize
      );
      work.broadPhaseQueries++;
      const candidates = [
        ...(index[horizontal ? "horizontal" : "vertical"].get(bin) ?? []),
        ...index[horizontal ? "globalHorizontal" : "globalVertical"]
      ];
      for (const obstacle of candidates) {
        if (obstacle.eventId === sourceId) continue;
        if (work.obstacleChecks >= C_PARAMETERS.obstacleCheckBudget) {
          work.exhausted = true;
          return false;
        }
        work.obstacleChecks++;
        if (segmentTouchesBox(a, b, obstacle.box)) return false;
      }
    }
    return true;
  };
  const direct = cleanTrace([port, { x: spineX, y: port.y }]);
  if (direct.length > 1 && onSpine(port.y) && clear(direct)) return direct;
  if (direct.length === 1 && onSpine(port.y) && clear([port, port]))
    return direct;
  if (work.exhausted) return null;

  const offset = C_PARAMETERS.boundaryOffset;
  const channels = [
    ...new Set([
      port.y - C_PARAMETERS.outerChannel,
      port.y + C_PARAMETERS.outerChannel,
      ...segments.flatMap((segment) => [
        segment[0]!.y,
        segment[1]!.y,
        (segment[0]!.y + segment[1]!.y) / 2
      ]),
      ...obstacles.flatMap((box) => [box.minY - offset, box.maxY + offset])
    ])
  ]
    .filter(onSpine)
    .sort((a, b) => Math.abs(a - port.y) - Math.abs(b - port.y) || a - b)
    .slice(0, C_PARAMETERS.maxRouteChannels);
  const direction = spineX < port.x ? -1 : 1;
  const stubX = port.x + direction * (C_PARAMETERS.clearance + offset);
  for (const y of channels) {
    // Horizontal escape from the real glyph's side, one vertical channel, then
    // horizontal arrival. At most two bends; the arrival is not a new Event.
    const points = cleanTrace([
      port,
      { x: stubX, y: port.y },
      { x: stubX, y },
      { x: spineX, y }
    ]);
    if (clear(points)) return points;
    if (work.exhausted) break;
  }
  return null;
}

/** Exposed for independent synthetic geometry fixtures; no snapshot mutation. */
export function constructCandidateC(
  projection: TstlProjection,
  sourceEvents: readonly TstlComparisonEvent[],
  referenceX: Readonly<Record<string, number>>
): TstlAlternativeGeometry {
  const events = [...sourceEvents].sort((a, b) => byId(a.eventId, b.eventId));
  const eventMap = new Map(events.map((event) => [event.eventId, event]));
  if (
    projection.status !== "COMPLETE" ||
    events.length !== projection.eventIds.length ||
    events.length > A_PARAMETERS.maxEvents ||
    eventMap.size !== events.length ||
    projection.eventIds.some(
      (id) => !eventMap.has(id) || !Number.isFinite(referenceX[id])
    ) ||
    events.some((event) =>
      [event.x, event.referenceY, ...Object.values(event.support)].some(
        (value) => !Number.isFinite(value)
      )
    )
  )
    throw Error("tstl_c_incomplete_or_invalid_input");
  const owners = [...projection.compositeIds].sort(byId);
  const positions = candidateCSpinePositions(projection, referenceX);
  const contoursByCompositeId: Record<string, TstlPoint[][]> = {};
  const tracesByCompositeId: Record<string, TstlIdentityTrace[]> = {};
  const memberships: TstlAlternativeGeometry["memberships"] = [];
  const spines = new Map<string, TstlPoint[][]>();
  const inflatedGlyphs = new Map(
    events.map((event) => [
      event.eventId,
      inflate(event.support, C_PARAMETERS.clearance)
    ])
  );
  const glyphIndex = indexGlyphs(
    events.map((event) => ({
      eventId: event.eventId,
      box: inflatedGlyphs.get(event.eventId)!
    }))
  );
  for (const owner of owners) {
    contoursByCompositeId[owner] = [];
    const descendants = new Set(projection.descendants[owner]);
    const members = [...descendants].map((id) => eventMap.get(id)!);
    const segments = spineSegments(
      positions[owner]!,
      Math.min(...members.map((event) => event.support.minY)) -
        A_PARAMETERS.padding,
      Math.max(...members.map((event) => event.support.maxY)) +
        A_PARAMETERS.padding,
      events
        .filter(
          (event) => event.eventId !== owner && !descendants.has(event.eventId)
        )
        .map((event) => inflatedGlyphs.get(event.eventId)!)
    );
    spines.set(owner, segments);
    tracesByCompositeId[owner] = segments.map((points) => ({
      kind: "spine",
      points
    }));
  }

  // An atom cell is shared verbatim by the exact ancestor signature of one
  // existing leaf. Reject overlapping cells instead of creating unsupported
  // combined signatures; this is a local check, not a World fill certificate.
  const cells = [...projection.leafIds].sort(byId).map((id) => ({
    event: eventMap.get(id)!,
    box: inflate(eventMap.get(id)!.support, A_PARAMETERS.padding)
  }));
  let retainedAtomCells = 0;
  let omittedAtomCells = 0;
  for (const cell of cells) {
    if (
      cells.some((other) => other !== cell && overlaps(cell.box, other.box)) ||
      events.some(
        (other) =>
          other.eventId !== cell.event.eventId &&
          overlaps(cell.box, other.support)
      )
    ) {
      omittedAtomCells++;
      continue;
    }
    retainedAtomCells++;
    for (const owner of projection.ancestors[cell.event.eventId]!)
      contoursByCompositeId[owner]!.push(ring(cell.box));
  }

  const work: RouteWork = {
    obstacleChecks: 0,
    broadPhaseQueries: 0,
    exhausted: false
  };
  let detourRoutes = 0;
  let densePortMemberships = 0;
  for (const event of events) {
    const ancestors = [...projection.ancestors[event.eventId]!].sort(byId);
    const sideOwners = [
      ancestors.filter((owner) => positions[owner]! < event.x),
      ancestors.filter((owner) => positions[owner]! >= event.x)
    ];
    const availableHeight = event.support.maxY - event.support.minY;
    const capacity = Math.max(
      1,
      Math.floor(
        (availableHeight - 2 * C_PARAMETERS.boundaryOffset) /
          C_PARAMETERS.portSpacing
      ) + 1
    );
    const obstacles = events
      .filter((other) => other.eventId !== event.eventId)
      .map((other) => inflatedGlyphs.get(other.eventId)!);
    for (const [side, compositeIds] of sideOwners.entries())
      for (const [index, compositeId] of compositeIds.entries()) {
        const membership = { compositeId, eventId: event.eventId };
        if (index >= capacity) {
          densePortMemberships++;
          memberships.push({
            ...membership,
            status: "list",
            reason: "DENSE_MEMBERSHIP_PORTS"
          });
          continue;
        }
        const count = Math.min(capacity, compositeIds.length);
        const port = {
          x: side === 0 ? event.support.minX : event.support.maxX,
          y:
            (event.support.minY + event.support.maxY) / 2 +
            (index - (count - 1) / 2) * C_PARAMETERS.portSpacing
        };
        const segments = spines.get(compositeId)!;
        const route = routeMembership(
          port,
          positions[compositeId]!,
          segments,
          obstacles,
          glyphIndex,
          event.eventId,
          work
        );
        if (!route) {
          memberships.push({
            ...membership,
            status: "list",
            reason: work.exhausted
              ? "ROUTING_BUDGET_EXHAUSTED"
              : segments.length === 0
                ? "SPINE_OCCLUDED"
                : "NO_TWO_BEND_PATH"
          });
          continue;
        }
        memberships.push({ ...membership, status: "route" });
        if (route.length > 2) detourRoutes++;
        if (route.length > 1)
          tracesByCompositeId[compositeId]!.push({
            kind: "membership",
            eventId: event.eventId,
            points: route
          });
      }
  }
  memberships.sort(
    (a, b) => byId(a.eventId, b.eventId) || byId(a.compositeId, b.compositeId)
  );
  return {
    algorithmVersion: C_PARAMETERS.version,
    contoursByCompositeId,
    tracesByCompositeId,
    memberships,
    diagnostics: {
      totalComposites: owners.length,
      totalEvents: events.length,
      preservedEventPositions: events.length,
      spineSegments: [...spines.values()].reduce(
        (sum, value) => sum + value.length,
        0
      ),
      fullyOccludedSpines: [...spines.values()].filter(
        (value) => value.length === 0
      ).length,
      retainedAtomCells,
      omittedAtomCells,
      areaFragments: Object.values(contoursByCompositeId).reduce(
        (sum, value) => sum + value.length,
        0
      ),
      routedMemberships: memberships.filter((entry) => entry.status === "route")
        .length,
      listMemberships: memberships.filter((entry) => entry.status === "list")
        .length,
      densePortMemberships,
      detourRoutes,
      obstacleChecks: work.obstacleChecks,
      broadPhaseQueries: work.broadPhaseQueries,
      obstacleCheckBudget: C_PARAMETERS.obstacleCheckBudget,
      budgetExhausted: Number(work.exhausted)
    },
    limitations: [
      "C is a geometry-only comparison: every Event keeps Candidate A X and original time Y.",
      "Spines and membership traces are identity cues, never filled membership boundaries or relation hit targets. Crossings do not assert relations.",
      "Local atom cells preserve one leaf's exact ancestor signature; missing or overlapping cells are omitted. No complete semantic fill certificate is claimed.",
      "Spines have explicit nonmember gaps. Routing checks at most 32 channels with two bends and a fixed obstacle-check budget; failure is an exact list fallback, not a proof that no route exists.",
      "Crowded side contacts use exact membership lists. Contacts and detours never create Event IDs or new occurrence times."
    ]
  };
}

export function buildCandidateC(comparison: TstlComparisonArtifact) {
  return constructCandidateC(
    comparison.projection,
    comparison.a.events,
    comparison.a.order?.referenceX ??
      orderTstlRoots(comparison.projection).referenceX
  );
}
