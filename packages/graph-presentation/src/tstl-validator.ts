/** Independent, browser-safe TSTL research validators. No canonical writes.
 * EXACT_SERIALIZED is deliberately restricted to integer orthogonal rings and
 * rectangular conservative glyph support. Unsupported geometry is unresolved.
 */
export interface TstlDiagnostic {
  code: string;
  eventId?: string;
  compositeId?: string;
  patchId?: string;
  detail?: string;
}
export interface TstlSemanticInput {
  events: readonly { id: string; worldId?: string }[];
  contains: readonly { parentId: string; childId: string }[];
  complete: boolean;
}
export interface TstlProjection {
  status: "COMPLETE" | "PARTIAL" | "INPUT_ERROR";
  eventIds: string[];
  compositeIds: string[];
  leafIds: string[];
  children: Record<string, string[]>;
  parents: Record<string, string[]>;
  descendants: Record<string, string[]>;
  leafMembers: Record<string, string[]>;
  ancestors: Record<string, string[]>;
  diagnostics: TstlDiagnostic[];
}
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length &&
  [...a].sort().every((id, i) => id === [...b].sort()[i]);
const recordOfLists = (ids: readonly string[]): Record<string, string[]> =>
  Object.fromEntries(ids.map((id) => [id, []]));

/** Uses reverse topological set union. Tests use an independent reachability
 * oracle that traverses each source/target pair, never this implementation. */
export function projectTstlSemantics(input: TstlSemanticInput): TstlProjection {
  const diagnostics: TstlDiagnostic[] = [];
  const eventIds = sorted(input.events.map((e) => e.id));
  if (eventIds.length !== input.events.length)
    diagnostics.push({ code: "DUPLICATE_EVENT_ID" });
  const eventMap = new Map(input.events.map((e) => [e.id, e]));
  if (new Set(input.events.map((event) => event.worldId)).size > 1)
    diagnostics.push({ code: "WORLD_MISMATCH" });
  const children = recordOfLists(eventIds);
  const parents = recordOfLists(eventIds);
  const edgeKeys = new Set<string>();
  for (const { parentId, childId } of input.contains) {
    const key = JSON.stringify([parentId, childId]);
    if (edgeKeys.has(key))
      diagnostics.push({
        code: "DUPLICATE_CONTAINS_EDGE",
        eventId: childId,
        compositeId: parentId
      });
    edgeKeys.add(key);
    const parent = eventMap.get(parentId);
    const child = eventMap.get(childId);
    if (!parent || !child) {
      diagnostics.push({
        code: "MISSING_ENDPOINT",
        eventId: childId,
        compositeId: parentId
      });
      continue;
    }
    if (parent.worldId !== child.worldId)
      diagnostics.push({
        code: "WORLD_MISMATCH",
        eventId: childId,
        compositeId: parentId
      });
    if (!children[parentId]!.includes(childId)) {
      children[parentId]!.push(childId);
      parents[childId]!.push(parentId);
    }
  }
  for (const id of eventIds) {
    children[id]!.sort();
    parents[id]!.sort();
  }
  const remaining = new Map(eventIds.map((id) => [id, parents[id]!.length]));
  const ready = eventIds.filter((id) => remaining.get(id) === 0);
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const child of children[id]!) {
      remaining.set(child, remaining.get(child)! - 1);
      if (remaining.get(child) === 0) {
        ready.push(child);
        ready.sort();
      }
    }
  }
  if (order.length !== eventIds.length)
    diagnostics.push({ code: "CONTAINS_CYCLE" });
  const descendants = recordOfLists(eventIds);
  const ancestors = recordOfLists(eventIds);
  if (order.length === eventIds.length) {
    for (const id of [...order].reverse())
      descendants[id] = sorted(
        children[id]!.flatMap((child) => [child, ...descendants[child]!])
      );
    for (const id of eventIds)
      for (const descendant of descendants[id]!)
        ancestors[descendant]!.push(id);
  }
  const leafIds = eventIds.filter((id) => children[id]!.length === 0);
  const leafSet = new Set(leafIds);
  const compositeIds = eventIds.filter((id) => children[id]!.length > 0);
  const leafMembers = Object.fromEntries(
    compositeIds.map((id) => [
      id,
      descendants[id]!.filter((child) => leafSet.has(child))
    ])
  );
  const invalid = diagnostics.length > 0;
  if (!input.complete) diagnostics.push({ code: "PARTIAL_SOURCE" });
  return {
    status: invalid ? "INPUT_ERROR" : input.complete ? "COMPLETE" : "PARTIAL",
    eventIds,
    compositeIds,
    leafIds,
    children,
    parents,
    descendants,
    leafMembers,
    ancestors,
    diagnostics
  };
}

export function tstlSignatures(
  projection: TstlProjection,
  compositeIds: readonly string[],
  carrierIds: readonly string[] = projection.leafIds
) {
  const scope = sorted(compositeIds);
  const buckets = new Map<
    string,
    { compositeIds: string[]; eventIds: string[]; count: number }
  >();
  for (const eventId of sorted(carrierIds)) {
    const signature = scope.filter((id) =>
      projection.ancestors[eventId]?.includes(id)
    );
    const key = JSON.stringify(signature);
    const bucket = buckets.get(key) ?? {
      compositeIds: signature,
      eventIds: [],
      count: 0
    };
    bucket.eventIds.push(eventId);
    bucket.count++;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
}

export interface TstlIncidenceInput {
  memberships: Readonly<Record<string, readonly string[]>>;
  ports: readonly { eventId: string; compositeId: string }[];
  hitTargets: readonly { eventId: string; hitTargetId: string }[];
  omitted: readonly { eventId: string; reason: string; revealRoute: string }[];
}
export function validateTstlIncidence(
  projection: TstlProjection,
  input: TstlIncidenceInput
) {
  const diagnostics: TstlDiagnostic[] = [...projection.diagnostics];
  const known = new Set(projection.eventIds);
  const targets = new Map<string, number>();
  const targetIds = new Set<string>();
  const omissions = new Map(input.omitted.map((o) => [o.eventId, o]));
  for (const target of input.hitTargets) {
    if (!known.has(target.eventId))
      diagnostics.push({ code: "UNKNOWN_EVENT", eventId: target.eventId });
    targets.set(target.eventId, (targets.get(target.eventId) ?? 0) + 1);
    if (!target.hitTargetId || targetIds.has(target.hitTargetId))
      diagnostics.push({
        code: "DUPLICATE_HIT_TARGET",
        eventId: target.eventId
      });
    targetIds.add(target.hitTargetId);
  }
  for (const id of projection.eventIds) {
    if (
      !sameIds(input.memberships[id] ?? [], projection.ancestors[id]!) ||
      !(id in input.memberships)
    )
      diagnostics.push({ code: "MEMBERSHIP_LIST_MISMATCH", eventId: id });
    if ((targets.get(id) ?? 0) > 1)
      diagnostics.push({ code: "DUPLICATE_EVENT_HIT_TARGET", eventId: id });
    if (!targets.has(id) && !omissions.has(id))
      diagnostics.push({ code: "MISSING_EVENT_ACCESS", eventId: id });
  }
  for (const id of Object.keys(input.memberships))
    if (!known.has(id))
      diagnostics.push({ code: "UNKNOWN_EVENT", eventId: id });
  const portKeys = new Set<string>();
  for (const port of input.ports) {
    const key = JSON.stringify([port.eventId, port.compositeId]);
    if (portKeys.has(key))
      diagnostics.push({
        code: "DUPLICATE_MEMBERSHIP_PORT",
        eventId: port.eventId,
        compositeId: port.compositeId
      });
    portKeys.add(key);
    if (!projection.ancestors[port.eventId]?.includes(port.compositeId))
      diagnostics.push({
        code: "FALSE_MEMBERSHIP_PORT",
        eventId: port.eventId,
        compositeId: port.compositeId
      });
  }
  for (const omitted of input.omitted)
    if (
      !known.has(omitted.eventId) ||
      !omitted.reason.trim() ||
      !omitted.revealRoute.trim()
    )
      diagnostics.push({
        code: "INVALID_REVEAL_ROUTE",
        eventId: omitted.eventId
      });
  if (omissions.size !== input.omitted.length)
    diagnostics.push({ code: "DUPLICATE_OMISSION" });
  return {
    valid: diagnostics.length === 0,
    uniqueEventCount: projection.eventIds.length,
    diagnostics
  };
}

/** Source is the unchanged public temporal descriptor, including constraints,
 * original time-system values, precision, inclusive flags and provenance. An
 * array preserves occurrence uncertainty and duration when both are present. */
export interface TstlTemporalDescriptor {
  kind:
    | "legacy-scalar-only"
    | "exact-point"
    | "uncertain-instant"
    | "duration"
    | "descendant-span"
    | "unplaced";
  minY: number | null;
  maxY: number | null;
  source?: unknown;
  lowerInclusive?: boolean;
  upperInclusive?: boolean;
  reason?: string;
}
export interface TstlTemporalRecord {
  eventId: string;
  sourceY: number | null;
  descriptors: readonly TstlTemporalDescriptor[];
}
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
};
export function validateTstlTemporal(
  expected: readonly TstlTemporalRecord[],
  actual: readonly TstlTemporalRecord[],
  expectedEventIds: readonly string[] = expected.map((record) => record.eventId)
) {
  const diagnostics: TstlDiagnostic[] = [];
  const expectedIds = expected.map((r) => r.eventId);
  const actualMap = new Map(actual.map((r) => [r.eventId, r]));
  if (expected.length === 0 || !sameIds(expectedIds, expectedEventIds))
    diagnostics.push({ code: "MISSING_TEMPORAL_COVERAGE" });
  if (
    new Set(expectedIds).size !== expected.length ||
    actualMap.size !== actual.length ||
    !sameIds(
      expectedIds,
      actual.map((r) => r.eventId)
    )
  )
    diagnostics.push({ code: "TEMPORAL_ID_MISMATCH" });
  let legacyCount = 0;
  let unplacedCount = 0;
  for (const source of expected) {
    const candidate = actualMap.get(source.eventId);
    if (
      !candidate ||
      !Object.is(source.sourceY, candidate.sourceY) ||
      stableJson(source.descriptors) !== stableJson(candidate.descriptors)
    )
      diagnostics.push({
        code: "TEMPORAL_SOURCE_MISMATCH",
        eventId: source.eventId
      });
    if (source.sourceY !== null && !Number.isFinite(source.sourceY))
      diagnostics.push({ code: "INVALID_SOURCE_Y", eventId: source.eventId });
    if (source.descriptors.length === 0)
      diagnostics.push({
        code: "MISSING_TEMPORAL_SUPPORT",
        eventId: source.eventId
      });
    for (const descriptor of source.descriptors) {
      if (
        (descriptor.minY !== null && !Number.isFinite(descriptor.minY)) ||
        (descriptor.maxY !== null && !Number.isFinite(descriptor.maxY)) ||
        (descriptor.minY !== null &&
          descriptor.maxY !== null &&
          descriptor.minY > descriptor.maxY)
      )
        diagnostics.push({
          code: "INVALID_TEMPORAL_BOUNDS",
          eventId: source.eventId
        });
      if (descriptor.kind === "legacy-scalar-only") {
        legacyCount++;
        continue;
      }
      if (descriptor.source === undefined || descriptor.source === null)
        diagnostics.push({
          code: "MISSING_TEMPORAL_EVIDENCE",
          eventId: source.eventId
        });
      if (descriptor.kind === "unplaced") {
        unplacedCount++;
        if (
          source.sourceY !== null ||
          !descriptor.reason ||
          (descriptor.minY !== null && descriptor.maxY !== null)
        )
          diagnostics.push({
            code: "UNPLACED_HAS_POSITION",
            eventId: source.eventId
          });
        continue;
      }
      if (
        source.sourceY === null ||
        descriptor.minY === null ||
        descriptor.maxY === null ||
        !Number.isFinite(descriptor.minY) ||
        !Number.isFinite(descriptor.maxY) ||
        descriptor.minY > descriptor.maxY
      )
        diagnostics.push({
          code: "OPEN_OR_INVALID_TIME_SUPPORT",
          eventId: source.eventId
        });
      if (
        source.sourceY !== null &&
        descriptor.minY !== null &&
        descriptor.maxY !== null &&
        (source.sourceY < descriptor.minY || source.sourceY > descriptor.maxY)
      )
        diagnostics.push({
          code: "TIME_ANCHOR_OUTSIDE_SUPPORT",
          eventId: source.eventId
        });
      if (
        descriptor.kind === "exact-point" &&
        (descriptor.minY !== descriptor.maxY ||
          descriptor.minY !== source.sourceY)
      )
        diagnostics.push({
          code: "INVALID_EXACT_POINT",
          eventId: source.eventId
        });
      if (
        descriptor.kind === "uncertain-instant" &&
        (descriptor.lowerInclusive === undefined ||
          descriptor.upperInclusive === undefined)
      )
        diagnostics.push({
          code: "MISSING_TIME_BOUNDARY_FLAGS",
          eventId: source.eventId
        });
    }
  }
  return {
    valid: diagnostics.length === 0,
    semanticFillEligible: diagnostics.length === 0 && legacyCount === 0,
    legacyCount,
    unplacedCount,
    diagnostics
  };
}

export interface TstlPoint {
  x: number;
  y: number;
}
export interface TstlBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
export interface TstlRegion {
  id: string;
  compositeId: string;
  points: readonly TstlPoint[];
}
export interface TstlPatch {
  id: string;
  minY: number;
  maxY: number;
  areaCompositeIds: readonly string[];
  modeCue: boolean;
  regions: readonly TstlRegion[];
}
export interface TstlGeometryInput {
  complete: boolean;
  carrierIds: readonly string[];
  placedCarrierIds: readonly string[];
  members: Readonly<Record<string, readonly string[]>>;
  glyphs: readonly { eventId: string; support: TstlBox }[];
  patches: readonly TstlPatch[];
  padding: number;
  maxCells?: number;
}
export interface TstlGeometryResult {
  geometryValid: boolean;
  level: "EXACT_SERIALIZED" | "UNRESOLVED" | "INVALID";
  diagnostics: TstlDiagnostic[];
  checkedCells: number;
  zones: {
    signature: string[];
    witnessEventIds: string[];
    cellCount: number;
  }[];
}
const COORDINATE_LIMIT = 2 ** 26;
const exactCoordinate = (value: number) =>
  Number.isSafeInteger(value) && Math.abs(value) <= COORDINATE_LIMIT;
const validBox = (box: TstlBox) =>
  [box.minX, box.maxX, box.minY, box.maxY].every(exactCoordinate) &&
  box.minX < box.maxX &&
  box.minY < box.maxY;
const expanded = (box: TstlBox, padding: number): TstlBox => ({
  minX: box.minX - padding,
  maxX: box.maxX + padding,
  minY: box.minY - padding,
  maxY: box.maxY + padding
});
const containsBox = (outer: TstlBox, inner: TstlBox) =>
  inner.minX >= outer.minX &&
  inner.maxX <= outer.maxX &&
  inner.minY >= outer.minY &&
  inner.maxY <= outer.maxY;
const overlaps = (a: TstlBox, b: TstlBox) =>
  a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
const edgeBox = (a: TstlPoint, b: TstlPoint): TstlBox => ({
  minX: Math.min(a.x, b.x),
  maxX: Math.max(a.x, b.x),
  minY: Math.min(a.y, b.y),
  maxY: Math.max(a.y, b.y)
});
/** With integer coordinates, exact area via BigInt and axis-aligned edge
 * intersections require no floating-point intersection construction. */
function ringProblem(
  points: readonly TstlPoint[]
): "INVALID_RING" | "UNSUPPORTED_GEOMETRY" | null {
  if (
    points.length < 4 ||
    points.length > 4096 ||
    points.some((p) => !exactCoordinate(p.x) || !exactCoordinate(p.y))
  )
    return "UNSUPPORTED_GEOMETRY";
  let area = 0n;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    if (a.x === b.x && a.y === b.y) return "INVALID_RING";
    if (a.x !== b.x && a.y !== b.y) return "UNSUPPORTED_GEOMETRY";
    area += BigInt(a.x) * BigInt(b.y) - BigInt(a.y) * BigInt(b.x);
    for (let j = i + 1; j < points.length; j++) {
      const c = points[j]!;
      const d = points[(j + 1) % points.length]!;
      const adjacent = j === i + 1 || (i === 0 && j === points.length - 1);
      const ab = edgeBox(a, b);
      const cd = edgeBox(c, d);
      const intersects =
        ab.minX <= cd.maxX &&
        ab.maxX >= cd.minX &&
        ab.minY <= cd.maxY &&
        ab.maxY >= cd.minY;
      if (!intersects) continue;
      if (!adjacent) return "INVALID_RING";
      // Adjacent edges may share one endpoint, never overlap/backtrack.
      if (
        (a.x === b.x &&
          c.x === d.x &&
          Math.min(ab.maxY, cd.maxY) > Math.max(ab.minY, cd.minY)) ||
        (a.y === b.y &&
          c.y === d.y &&
          Math.min(ab.maxX, cd.maxX) > Math.max(ab.minX, cd.minX))
      )
        return "INVALID_RING";
    }
  }
  return area === 0n ? "INVALID_RING" : null;
}
/** Cell interiors cannot contain a boundary: every ring coordinate is a cut.
 * Its exact half-integer midpoint identifies the whole analytic face cell. */
function insideRing(x: number, y: number, points: readonly TstlPoint[]) {
  let inside = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    if (a.x === b.x && a.y > y !== b.y > y && a.x > x) inside = !inside;
  }
  return inside;
}

/** Complete orthogonal planar arrangement, NOT raster sampling. All polygon,
 * glyph+padding and patch boundaries split the plane into exact rectangles.
 * Every positive-area cell is classified; no area tolerance discards a face.
 * Equal-mode artificial seams reconnect before connected-zone witness checks. */
export function validateTstlGeometry(
  input: TstlGeometryInput
): TstlGeometryResult {
  const diagnostics: TstlDiagnostic[] = [];
  const result = (
    level: TstlGeometryResult["level"],
    checkedCells = 0,
    zones: TstlGeometryResult["zones"] = []
  ): TstlGeometryResult => ({
    geometryValid: level === "EXACT_SERIALIZED",
    level,
    diagnostics,
    checkedCells,
    zones
  });
  if (!input.complete) diagnostics.push({ code: "PARTIAL_SOURCE" });
  if (!exactCoordinate(input.padding) || input.padding <= 0)
    diagnostics.push({ code: "UNSUPPORTED_PADDING" });
  const patches = [...input.patches].sort(
    (a, b) => a.minY - b.minY || a.id.localeCompare(b.id)
  );
  const ids = new Set<string>();
  const regionIds = new Set<string>();
  const xCuts = new Set<number>();
  const yCuts = new Set<number>();
  for (const patch of patches) {
    if (ids.has(patch.id))
      diagnostics.push({ code: "DUPLICATE_PATCH_ID", patchId: patch.id });
    ids.add(patch.id);
    if (
      !exactCoordinate(patch.minY) ||
      !exactCoordinate(patch.maxY) ||
      patch.minY >= patch.maxY
    )
      diagnostics.push({
        code: "UNSUPPORTED_PATCH_BOUNDARY",
        patchId: patch.id
      });
    if (!patch.modeCue)
      diagnostics.push({ code: "MISSING_MODE_CUE", patchId: patch.id });
    if (sorted(patch.areaCompositeIds).length !== patch.areaCompositeIds.length)
      diagnostics.push({ code: "DUPLICATE_AREA_MASK", patchId: patch.id });
    for (const id of patch.areaCompositeIds)
      if (!(id in input.members))
        diagnostics.push({
          code: "UNKNOWN_AREA_COMPOSITE",
          patchId: patch.id,
          compositeId: id
        });
    yCuts.add(patch.minY);
    yCuts.add(patch.maxY);
    for (const region of patch.regions) {
      if (regionIds.has(region.id))
        diagnostics.push({ code: "DUPLICATE_REGION_ID", patchId: patch.id });
      regionIds.add(region.id);
      if (!patch.areaCompositeIds.includes(region.compositeId))
        diagnostics.push({
          code: "UNDECLARED_AREA_MODE",
          patchId: patch.id,
          compositeId: region.compositeId
        });
      const problem = ringProblem(region.points);
      if (problem)
        diagnostics.push({
          code: problem,
          patchId: patch.id,
          compositeId: region.compositeId
        });
      for (const point of region.points) {
        xCuts.add(point.x);
        yCuts.add(point.y);
        if (point.y < patch.minY || point.y > patch.maxY)
          diagnostics.push({
            code: "REGION_OUTSIDE_PATCH",
            patchId: patch.id,
            compositeId: region.compositeId
          });
      }
    }
  }
  for (let i = 1; i < patches.length; i++)
    if (patches[i]!.minY < patches[i - 1]!.maxY)
      diagnostics.push({ code: "OVERLAPPING_PATCHES" });
  const carrierIds = new Set(input.carrierIds);
  const placedIds = new Set(input.placedCarrierIds);
  if (
    carrierIds.size !== input.carrierIds.length ||
    placedIds.size !== input.placedCarrierIds.length ||
    input.placedCarrierIds.some((id) => !carrierIds.has(id))
  )
    diagnostics.push({ code: "INVALID_CARRIER_DOMAIN" });
  const glyphIds = new Set<string>();
  const glyphs = input.glyphs.map((glyph) => ({
    ...glyph,
    padded: expanded(glyph.support, input.padding)
  }));
  for (const glyph of glyphs) {
    if (glyphIds.has(glyph.eventId) || !placedIds.has(glyph.eventId))
      diagnostics.push({ code: "INVALID_GLYPH_ID", eventId: glyph.eventId });
    glyphIds.add(glyph.eventId);
    if (!validBox(glyph.support) || !validBox(glyph.padded))
      diagnostics.push({
        code: "UNSUPPORTED_GLYPH_SUPPORT",
        eventId: glyph.eventId
      });
    xCuts.add(glyph.padded.minX);
    xCuts.add(glyph.padded.maxX);
    yCuts.add(glyph.padded.minY);
    yCuts.add(glyph.padded.maxY);
    const covering = patches.filter(
      (patch) =>
        patch.minY < glyph.padded.maxY && patch.maxY > glyph.padded.minY
    );
    let coveredUntil = glyph.padded.minY;
    for (const patch of covering) {
      if (patch.minY > coveredUntil) break;
      coveredUntil = Math.max(coveredUntil, patch.maxY);
    }
    if (coveredUntil < glyph.padded.maxY)
      diagnostics.push({
        code: "UNCOVERED_GLYPH_SUPPORT",
        eventId: glyph.eventId
      });
  }
  for (const id of placedIds)
    if (!glyphIds.has(id))
      diagnostics.push({ code: "MISSING_GLYPH_SUPPORT", eventId: id });
  if (diagnostics.length)
    return result(
      diagnostics.some(
        (d) => d.code.startsWith("UNSUPPORTED") || d.code === "PARTIAL_SOURCE"
      )
        ? "UNRESOLVED"
        : "INVALID"
    );
  if (patches.every((patch) => patch.areaCompositeIds.length === 0))
    return result("EXACT_SERIALIZED");
  const xs = [...xCuts].sort((a, b) => a - b);
  const ys = [...yCuts].sort((a, b) => a - b);
  const width = Math.max(0, xs.length - 1);
  const height = Math.max(0, ys.length - 1);
  const cellCount = width * height;
  const budget = Math.min(250_000, input.maxCells ?? 250_000);
  if (!Number.isSafeInteger(budget) || budget < 0 || cellCount > budget) {
    diagnostics.push({
      code: "ARRANGEMENT_BUDGET",
      detail: `${cellCount} cells > ${budget}`
    });
    return result("UNRESOLVED");
  }
  interface Cell {
    box: TstlBox;
    signature: string[];
    modeKey: string;
    patch: TstlPatch;
  }
  const cells: (Cell | null)[] = new Array<Cell | null>(cellCount).fill(null);
  const observedByMode = new Map<string, Set<string>>();
  const emitted = new Set<string>();
  const emit = (diagnostic: TstlDiagnostic) => {
    const key = stableJson(diagnostic);
    if (!emitted.has(key)) {
      emitted.add(key);
      diagnostics.push(diagnostic);
    }
  };
  for (let y = 0; y < height; y++) {
    const patch = patches.find((p) => p.minY <= ys[y]! && p.maxY >= ys[y + 1]!);
    if (!patch) continue;
    const mode = sorted(patch.areaCompositeIds);
    const modeKey = JSON.stringify(mode);
    if (!observedByMode.has(modeKey))
      observedByMode.set(
        modeKey,
        new Set(
          input.placedCarrierIds.map((eventId) =>
            JSON.stringify(
              mode.filter((id) => input.members[id]?.includes(eventId))
            )
          )
        )
      );
    for (let x = 0; x < width; x++) {
      const box = {
        minX: xs[x]!,
        maxX: xs[x + 1]!,
        minY: ys[y]!,
        maxY: ys[y + 1]!
      };
      const midX = (box.minX + box.maxX) / 2;
      const midY = (box.minY + box.maxY) / 2;
      const signature = mode.filter((id) =>
        patch.regions.some(
          (r) => r.compositeId === id && insideRing(midX, midY, r.points)
        )
      );
      const key = JSON.stringify(signature);
      cells[y * width + x] = { box, signature, modeKey, patch };
      if (signature.length > 0 && !observedByMode.get(modeKey)!.has(key))
        emit({ code: "FALSE_ATOM", patchId: patch.id, detail: key });
      for (const glyph of glyphs) {
        if (!overlaps(box, glyph.padded)) continue;
        for (const id of mode) {
          const member = input.members[id]!.includes(glyph.eventId);
          if (member && !signature.includes(id))
            emit({
              code: "MEMBER_EXCLUSION",
              eventId: glyph.eventId,
              compositeId: id,
              patchId: patch.id
            });
          if (!member && signature.includes(id))
            emit({
              code: "NONMEMBER_INCLUSION",
              eventId: glyph.eventId,
              compositeId: id,
              patchId: patch.id
            });
        }
      }
    }
  }
  const visited = new Uint8Array(cellCount);
  const zones: TstlGeometryResult["zones"] = [];
  for (let start = 0; start < cellCount; start++) {
    const first = cells[start];
    if (visited[start] || !first || first.signature.length === 0) continue;
    const key = JSON.stringify(first.signature);
    const queue = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const at = queue[cursor]!;
      const x = at % width;
      const y = Math.floor(at / width);
      for (const next of [
        x > 0 ? at - 1 : -1,
        x + 1 < width ? at + 1 : -1,
        y > 0 ? at - width : -1,
        y + 1 < height ? at + width : -1
      ]) {
        if (next < 0 || visited[next]) continue;
        const cell = cells[next];
        if (
          cell &&
          cell.modeKey === first.modeKey &&
          JSON.stringify(cell.signature) === key
        ) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    const component = new Set(queue);
    const witnesses = glyphs
      .filter((glyph) => {
        const signature = JSON.parse(first.modeKey) as string[];
        if (
          JSON.stringify(
            signature.filter((id) => input.members[id]!.includes(glyph.eventId))
          ) !== key
        )
          return false;
        let touched = false;
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          if (
            !cell ||
            cell.modeKey !== first.modeKey ||
            !overlaps(cell.box, glyph.padded)
          )
            continue;
          if (!component.has(i)) return false;
          touched = true;
        }
        return touched;
      })
      .map((glyph) => glyph.eventId)
      .sort();
    if (witnesses.length === 0)
      emit({ code: "UNWITNESSED_ZONE", patchId: first.patch.id, detail: key });
    zones.push({
      signature: first.signature,
      witnessEventIds: witnesses,
      cellCount: queue.length
    });
  }
  return result(
    diagnostics.length === 0 ? "EXACT_SERIALIZED" : "INVALID",
    cellCount,
    zones
  );
}

export interface TstlRenderCommands {
  pipeline: "svg-linear";
  clipping: "viewport-only";
  regions: readonly {
    regionId: string;
    points: readonly TstlPoint[];
    fill: "none" | "semantic";
    strokeWidth: number;
  }[];
  glyphs: readonly {
    eventId: string;
    hitTargetId: string;
    body: TstlBox;
    strokeWidth: number;
  }[];
}
/** Verify the actual serialized renderer commands. This does not certify a
 * browser's rasterizer/GPU: SVG linear paths, unchanged vertices, conservative
 * visible glyph support and viewport-only clipping are the supported boundary.
 * Mesh, smoothing, geometric clipping or a widened semantic boundary fail shut. */
export function validateTstlRenderCommands(
  source: {
    regions: readonly TstlRegion[];
    glyphs: readonly {
      eventId: string;
      support: TstlBox;
      anchor: TstlPoint;
    }[];
    semanticFillEligible: boolean;
  },
  commands: TstlRenderCommands
) {
  const diagnostics: TstlDiagnostic[] = [];
  if (
    commands.pipeline !== "svg-linear" ||
    commands.clipping !== "viewport-only"
  )
    diagnostics.push({ code: "UNSUPPORTED_RENDER_PIPELINE" });
  const regions = new Map(source.regions.map((r) => [r.id, r]));
  const glyphs = new Map(source.glyphs.map((g) => [g.eventId, g]));
  const seenRegions = new Set<string>();
  const seenEvents = new Set<string>();
  const seenHits = new Set<string>();
  for (const command of commands.regions) {
    const region = regions.get(command.regionId);
    if (
      !region ||
      seenRegions.has(command.regionId) ||
      stableJson(region.points) !== stableJson(command.points)
    )
      diagnostics.push({
        code: "RENDER_CONTOUR_MISMATCH",
        detail: command.regionId
      });
    seenRegions.add(command.regionId);
    if (
      !Number.isFinite(command.strokeWidth) ||
      command.strokeWidth < 0 ||
      (command.fill === "semantic" &&
        (!source.semanticFillEligible || command.strokeWidth !== 0))
    )
      diagnostics.push({
        code: "UNVERIFIED_RENDER_FILL",
        detail: command.regionId
      });
  }
  for (const command of commands.glyphs) {
    const glyph = glyphs.get(command.eventId);
    const box = expanded(command.body, command.strokeWidth / 2);
    // Two additions/divisions plus caller subtraction can round by a few ulps.
    // This bound applies only to command arithmetic, never source time/Y.
    const arithmeticBound =
      4 *
      Number.EPSILON *
      Math.max(
        1,
        ...Object.values(command.body).map(Math.abs),
        Math.abs(glyph?.anchor?.x ?? 0),
        Math.abs(glyph?.anchor?.y ?? 0)
      );
    if (
      !glyph?.anchor ||
      !Number.isFinite(glyph.anchor.x) ||
      !Number.isFinite(glyph.anchor.y) ||
      (glyph?.anchor &&
        (Math.abs(
          (command.body.minX + command.body.maxX) / 2 - glyph.anchor.x
        ) > arithmeticBound ||
          Math.abs(
            (command.body.minY + command.body.maxY) / 2 - glyph.anchor.y
          ) > arithmeticBound))
    )
      diagnostics.push({
        code: "RENDER_ANCHOR_MISMATCH",
        eventId: command.eventId
      });
    if (
      !glyph ||
      !Number.isFinite(command.strokeWidth) ||
      command.strokeWidth < 0 ||
      !Object.values(box).every(Number.isFinite) ||
      box.minX >= box.maxX ||
      box.minY >= box.maxY ||
      !containsBox(glyph.support, box)
    )
      diagnostics.push({
        code: "RENDER_GLYPH_SUPPORT_MISMATCH",
        eventId: command.eventId
      });
    if (
      seenEvents.has(command.eventId) ||
      !command.hitTargetId ||
      seenHits.has(command.hitTargetId)
    )
      diagnostics.push({
        code: "DUPLICATE_RENDER_HIT_TARGET",
        eventId: command.eventId
      });
    seenEvents.add(command.eventId);
    seenHits.add(command.hitTargetId);
  }
  if (seenRegions.size !== regions.size || seenEvents.size !== glyphs.size)
    diagnostics.push({ code: "RENDER_COMMAND_OMISSION" });
  return { valid: diagnostics.length === 0, diagnostics };
}

/** Bind generated claims to an independent source projection. Primitive geometry
 * checking alone cannot establish whether a caller's membership table is true.
 * No persisted certificate is accepted: all checks rerun on these exact bytes.
 * This wrapper certifies declared support, not the loader's historical evidence;
 * the temporal source must come from the immutable input, never the artifact.
 */
export function validateTstlWorldGeometry(
  projection: TstlProjection,
  expectedTemporal: readonly TstlTemporalRecord[],
  actualTemporal: readonly TstlTemporalRecord[],
  input: TstlGeometryInput,
  reference: {
    sourceYOrigin: number;
    scale: number;
    nominalHalfHeight: number;
  } = { sourceYOrigin: 0, scale: 1, nominalHalfHeight: 1 }
) {
  const temporal = validateTstlTemporal(
    expectedTemporal,
    actualTemporal,
    projection.eventIds
  );
  const diagnostics: TstlDiagnostic[] = [...projection.diagnostics];
  if (!sameIds(input.carrierIds, projection.leafIds))
    diagnostics.push({ code: "CARRIER_SOURCE_MISMATCH" });
  const sourcePlaced = expectedTemporal
    .filter(
      (record) =>
        record.sourceY !== null && projection.leafIds.includes(record.eventId)
    )
    .map((record) => record.eventId);
  if (!sameIds(input.placedCarrierIds, sourcePlaced))
    diagnostics.push({ code: "PLACED_SOURCE_MISMATCH" });
  if (!sameIds(Object.keys(input.members), projection.compositeIds))
    diagnostics.push({ code: "COMPOSITE_SOURCE_MISMATCH" });
  for (const compositeId of projection.compositeIds)
    if (
      !sameIds(
        input.members[compositeId] ?? [],
        projection.leafMembers[compositeId]!
      )
    )
      diagnostics.push({ code: "MEMBERSHIP_SOURCE_MISMATCH", compositeId });
  if ((projection.status === "COMPLETE") !== input.complete)
    diagnostics.push({ code: "COMPLETENESS_SOURCE_MISMATCH" });
  if (
    !Number.isFinite(reference.sourceYOrigin) ||
    !Number.isFinite(reference.scale) ||
    reference.scale <= 0 ||
    !Number.isFinite(reference.nominalHalfHeight) ||
    reference.nominalHalfHeight <= 0
  )
    diagnostics.push({ code: "INVALID_REFERENCE_FRAME" });
  const timeById = new Map(
    expectedTemporal.map((record) => [record.eventId, record])
  );
  for (const glyph of input.glyphs) {
    const source = timeById.get(glyph.eventId);
    if (!source || source.sourceY === null) {
      diagnostics.push({
        code: "GLYPH_TEMPORAL_SOURCE_MISSING",
        eventId: glyph.eventId
      });
      continue;
    }
    // Legacy extents are NOT interpreted as duration. Their nominal marker
    // remains anchored to the reproduced B0 scalar sourceY, with an explicit
    // temporal limitation. Lossless interval endpoints enlarge the full body.
    const sourceYs = [
      source.sourceY,
      ...source.descriptors.flatMap((descriptor) =>
        descriptor.kind === "legacy-scalar-only" ||
        descriptor.kind === "unplaced"
          ? []
          : [descriptor.minY, descriptor.maxY].filter(
              (value): value is number => value !== null
            )
      )
    ];
    const mapped = sourceYs.map(
      (value) => (value - reference.sourceYOrigin) * reference.scale
    );
    const minY = Math.floor(Math.min(...mapped) - reference.nominalHalfHeight);
    const maxY = Math.ceil(Math.max(...mapped) + reference.nominalHalfHeight);
    if (glyph.support.minY !== minY || glyph.support.maxY !== maxY)
      diagnostics.push({
        code: "GEOMETRY_SOURCE_Y_MISMATCH",
        eventId: glyph.eventId
      });
  }
  const geometry = validateTstlGeometry(input);
  return {
    valid: diagnostics.length === 0 && temporal.valid && geometry.geometryValid,
    semanticFillEligible:
      diagnostics.length === 0 &&
      temporal.semanticFillEligible &&
      geometry.geometryValid,
    geometry,
    temporal,
    diagnostics,
    // Caller hashes this payload with SHA-256. It binds the exact serialized
    // support, contour and mode mask used above; never reuse it after mutation.
    certificatePayload: stableJson({ input, reference, expectedTemporal })
  };
}
