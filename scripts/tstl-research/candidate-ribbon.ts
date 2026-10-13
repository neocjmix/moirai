/** TimeSets-inspired experimental ribbons on the exact production B0 positions.
 * Broad envelopes express Composite identity across time, not new occurrences
 * or certified temporal/intersection semantics. Canonical data is read-only. */
import type {
  TstlExperimentCandidate,
  TstlExperimentPoint
} from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";
import type { BaselineArtifact } from "./baseline.js";
import type { TstlComparisonArtifact } from "./candidate.js";
import {
  baselineCandidateCoordinates,
  boxRing,
  ringArea,
  roundRegionPaths,
  subtractRegionPaths,
  unionRegionPaths,
  validateRegionGeometry,
  type Box,
  type Point
} from "./smooth-regions.js";

export const RIBBON_PARAMETERS = {
  version: "b0-rounded-temporal-ribbon/1",
  yScale: 0.2,
  timeBandHeight: 32,
  shoulderX: 22,
  shoulderY: 18,
  transitionSteps: 12,
  cornerRadius: 12,
  glyphHalfSize: 2.5,
  nonmemberClearance: 1.5
} as const;

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const expand = (box: Box, dx: number, dy = dx): Box => ({
  minX: box.minX - dx,
  maxX: box.maxX + dx,
  minY: box.minY - dy,
  maxY: box.maxY + dy
});
const boundsOf = (boxes: readonly Box[]): Box => ({
  minX: Math.min(...boxes.map((box) => box.minX)),
  maxX: Math.max(...boxes.map((box) => box.maxX)),
  minY: Math.min(...boxes.map((box) => box.minY)),
  maxY: Math.max(...boxes.map((box) => box.maxY))
});

/** Opening with an oversized radius can sever a steep connector. Keep the
 * continuous union and reduce the aesthetic rounding radius deterministically
 * instead of disguising that damage as an obstacle-induced split. */
function roundContinuousEnvelope(paths: Point[][], supports: Box[]): Point[][] {
  const united = unionRegionPaths(paths);
  const components = united.filter((path) => ringArea(path) > 0).length;
  for (let attempt = 0; attempt < 4; attempt++) {
    const rounded = roundRegionPaths(
      united,
      RIBBON_PARAMETERS.cornerRadius / 2 ** attempt
    );
    if (
      rounded.filter((path) => ringArea(path) > 0).length === components &&
      validateRegionGeometry(rounded, supports, []).memberCoverage.every(
        Boolean
      )
    )
      return rounded;
  }
  return united;
}

interface RibbonTerminal {
  eventId: string;
  point: Point;
  support: Box;
}

/** Each temporal band spans all of its members and has substantial shoulders.
 * A smoothstep strip joins adjacent band centres. Every strip intersects both
 * bands, so distant dates do not turn into disconnected per-Event tiles. */
export function temporalRibbonEnvelope(terminals: readonly RibbonTerminal[]): {
  paths: Point[][];
  bands: number;
} {
  const groups = new Map<number, RibbonTerminal[]>();
  for (const terminal of [...terminals].sort((a, b) =>
    byId(a.eventId, b.eventId)
  )) {
    const key = Math.floor(terminal.point.y / RIBBON_PARAMETERS.timeBandHeight);
    const members = groups.get(key) ?? [];
    members.push(terminal);
    groups.set(key, members);
  }
  const bands = [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, members]) =>
      expand(
        boundsOf(members.map((member) => member.support)),
        RIBBON_PARAMETERS.shoulderX,
        RIBBON_PARAMETERS.shoulderY
      )
    );
  const inputs = bands.map(boxRing);
  for (let index = 1; index < bands.length; index++) {
    const before = bands[index - 1]!;
    const after = bands[index]!;
    const startY = (before.minY + before.maxY) / 2;
    const endY = (after.minY + after.maxY) / 2;
    const left: Point[] = [];
    const right: Point[] = [];
    for (let step = 0; step <= RIBBON_PARAMETERS.transitionSteps; step++) {
      const t = step / RIBBON_PARAMETERS.transitionSteps;
      const eased = t * t * (3 - 2 * t);
      const y = startY + (endY - startY) * t;
      left.push({ x: before.minX + (after.minX - before.minX) * eased, y });
      right.push({ x: before.maxX + (after.maxX - before.maxX) * eased, y });
    }
    // All inputs here are solid envelopes, so their winding must agree with
    // boxRing. A reversed strip would cancel its overlapping band interiors
    // under the NonZero union and create artificial gaps before clipping.
    inputs.push([...right, ...left.reverse()]);
  }
  return {
    paths: roundContinuousEnvelope(
      inputs,
      terminals.map((terminal) => terminal.support)
    ),
    bands: bands.length
  };
}

/** Tests use this constructor with independent fixtures. It never changes any
 * Event coordinate. Holes are real even-odd exclusions, never painted masks. */
export function constructRibbonRegion(
  members: readonly RibbonTerminal[],
  nonmembers: readonly Box[]
): { paths: Point[][]; bands: number } {
  const envelope = temporalRibbonEnvelope(members);
  const obstacles = nonmembers.map((box) =>
    expand(box, RIBBON_PARAMETERS.nonmemberClearance)
  );
  const roundedObstacles = roundRegionPaths(
    obstacles.map(boxRing),
    RIBBON_PARAMETERS.nonmemberClearance
  );
  const clipped = subtractRegionPaths(envelope.paths, roundedObstacles);
  return {
    paths: clipped,
    bands: envelope.bands
  };
}

export function buildRibbonCandidate(
  baseline: BaselineArtifact,
  comparison: TstlComparisonArtifact
): TstlExperimentCandidate {
  if (
    comparison.projection.status !== "COMPLETE" ||
    baseline.layout.world_id !== comparison.source.worldId ||
    baseline.layout.revision !== comparison.source.revision ||
    baseline.provenance.snapshotInputDigest !== comparison.source.inputDigest ||
    baseline.provenance.sourceRootDigest !== comparison.source.sourceRootDigest
  )
    throw Error("tstl_ribbon_source_mismatch");
  const { xByEventId, positionsByEventId, worldBoundsByCompositeId } =
    baselineCandidateCoordinates(baseline);
  const yOrigin =
    baseline.bounds?.minY ?? comparison.referenceFrame.sourceYOrigin;
  const yScale = RIBBON_PARAMETERS.yScale;
  if (
    Object.keys(positionsByEventId).length !==
      comparison.projection.eventIds.length ||
    comparison.projection.eventIds.some(
      (id) =>
        !positionsByEventId[id] ||
        !Number.isFinite(positionsByEventId[id]!.x) ||
        !Number.isFinite(positionsByEventId[id]!.y)
    )
  )
    throw Error("tstl_ribbon_requires_exact_b0_coordinates");
  const worldTerminals = new Map(
    comparison.projection.leafIds.map((eventId) => {
      const point = positionsByEventId[eventId]!;
      return [
        eventId,
        {
          eventId,
          point: { ...point },
          support: {
            minX: point.x - RIBBON_PARAMETERS.glyphHalfSize,
            maxX: point.x + RIBBON_PARAMETERS.glyphHalfSize,
            minY: point.y - RIBBON_PARAMETERS.glyphHalfSize / yScale,
            maxY: point.y + RIBBON_PARAMETERS.glyphHalfSize / yScale
          }
        } satisfies RibbonTerminal
      ] as const;
    })
  );
  const metricBox = (box: Box): Box => ({
    ...box,
    minY: (box.minY - yOrigin) * yScale,
    maxY: (box.maxY - yOrigin) * yScale
  });
  const metricTerminals = new Map(
    [...worldTerminals].map(([id, event]) => [
      id,
      {
        ...event,
        point: { x: event.point.x, y: (event.point.y - yOrigin) * yScale },
        support: metricBox(event.support)
      }
    ])
  );
  const contoursByCompositeId: Record<string, TstlExperimentPoint[][]> = {};
  const memberships: NonNullable<TstlExperimentCandidate["memberships"]> = [];
  const diagnostics = {
    events: Object.keys(positionsByEventId).length,
    owners: comparison.projection.compositeIds.length,
    unchangedB0Positions: Object.keys(positionsByEventId).length,
    referenceYScale: yScale,
    timeBands: 0,
    components: 0,
    holes: 0,
    disconnectedOwners: 0,
    noAreaOwners: 0,
    leafAreaMemberships: 0,
    leafListMemberships: 0,
    leafMemberships: 0,
    rejectedGeometryOwners: 0,
    nonmemberIntersections: 0,
    selfIntersections: 0
  };
  for (const compositeId of [...comparison.projection.compositeIds].sort(
    byId
  )) {
    const memberIds = [...comparison.projection.leafMembers[compositeId]!].sort(
      byId
    );
    const memberSet = new Set(memberIds);
    const nonmemberIds = comparison.projection.leafIds.filter(
      (id) => !memberSet.has(id)
    );
    const built = constructRibbonRegion(
      memberIds.map((id) => metricTerminals.get(id)!),
      nonmemberIds.map((id) => metricTerminals.get(id)!.support)
    );
    // Validate the exact world-coordinate numbers that are serialized for the
    // renderer, after all smoothing, clipping and inverse transformation.
    const paths = JSON.parse(
      JSON.stringify(
        built.paths.map((path) =>
          path.map((point) => ({
            x: point.x,
            y: point.y / yScale + yOrigin
          }))
        )
      )
    ) as Point[][];
    const validation = validateRegionGeometry(
      paths,
      memberIds.map((id) => worldTerminals.get(id)!.support),
      nonmemberIds.map((id) => worldTerminals.get(id)!.support)
    );
    const valid =
      validation.finite &&
      validation.nonmemberIntersections === 0 &&
      validation.selfIntersections === 0;
    contoursByCompositeId[compositeId] = valid ? paths : [];
    diagnostics.timeBands += built.bands;
    diagnostics.rejectedGeometryOwners += Number(!valid);
    diagnostics.nonmemberIntersections += validation.nonmemberIntersections;
    diagnostics.selfIntersections += validation.selfIntersections;
    diagnostics.components += valid ? validation.components : 0;
    diagnostics.holes += valid ? validation.holes : 0;
    diagnostics.disconnectedOwners += Number(
      valid && validation.components > 1
    );
    diagnostics.noAreaOwners += Number(!valid || paths.length === 0);
    for (const [index, eventId] of memberIds.entries()) {
      const covered = valid && validation.memberCoverage[index] === true;
      memberships.push({
        compositeId,
        eventId,
        status: covered ? "area" : "list",
        ...(covered
          ? {}
          : {
              reason: valid
                ? "FINAL_GLYPH_NOT_COVERED"
                : "FINAL_GEOMETRY_REJECTED"
            })
      });
      if (covered) diagnostics.leafAreaMemberships++;
      else diagnostics.leafListMemberships++;
      diagnostics.leafMemberships++;
    }
  }
  return {
    algorithmVersion: RIBBON_PARAMETERS.version,
    fillRule: "evenodd",
    xByEventId,
    worldBoundsByCompositeId,
    contoursByCompositeId,
    noAreaCompositeIds: comparison.projection.compositeIds.filter(
      (id) => !contoursByCompositeId[id]!.length
    ),
    memberships,
    diagnostics,
    limitations: [
      "TimeSets-inspired broad ribbons are a visual experiment, not an implementation or validation of the published TimeSets algorithm.",
      "All 539 Event IDs, production B0 X/Y, Composite anchors and semantic bounds remain unchanged; only the prepared region geometry changes.",
      "A rounded temporal-band envelope connects member periods. The filled span is an identity cue, not evidence of events or continuous activity in intervening time.",
      "Nonmember leaf supports are cut out as true holes. Final serialized geometry decides exact glyph coverage; excluded members retain explicit membership-list fallback.",
      "Inclusion and exclusion use the shared 5 by 5 nominal glyph box, 1.5 clearance and fixed 0.2 Y metric. This is not a certificate for every screen-space glyph size or zoom.",
      "Local inclusion and exclusion do not certify global exact intersection signatures or restore the missing temporal sidecar. Clipping may split a ribbon into multiple components."
    ]
  };
}
