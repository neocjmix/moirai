/** Offline B: bounded rectilinear terminal forests, with experimental filled
 * tubes. This is identity geometry, never the authored contains graph. */
import type {
  TstlBox,
  TstlPoint
} from "../../packages/graph-presentation/src/tstl-validator.js";
import type {
  TstlComparisonArtifact,
  TstlComparisonEvent
} from "./candidate.js";
import type {
  TstlAlternativeGeometry,
  TstlIdentityTrace
} from "./candidate-bc-types.js";

export const B_PARAMETERS = {
  maxWindowTerminals: 32,
  maxGraphVertices: 65_536,
  expandedStateBudget: 2_000_000,
  maxWindowExpandedStates: 64_000,
  clearance: 3,
  boundaryOffset: 0.5,
  outerChannel: 24,
  tubeHalfWidth: 3,
  terminalPadding: 3,
  bendCost: 6
} as const;

type BudgetOptions = Partial<
  Record<
    | "maxWindowTerminals"
    | "maxGraphVertices"
    | "expandedStateBudget"
    | "maxWindowExpandedStates",
    number
  >
>;
const idOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const inflate = (box: TstlBox, radius: number): TstlBox => ({
  minX: box.minX - radius,
  maxX: box.maxX + radius,
  minY: box.minY - radius,
  maxY: box.maxY + radius
});
const boxesTouch = (a: TstlBox, b: TstlBox) =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
const pointBox = (point: TstlPoint): TstlBox => ({
  minX: point.x,
  maxX: point.x,
  minY: point.y,
  maxY: point.y
});
const segmentBox = (a: TstlPoint, b: TstlPoint): TstlBox => ({
  minX: Math.min(a.x, b.x),
  maxX: Math.max(a.x, b.x),
  minY: Math.min(a.y, b.y),
  maxY: Math.max(a.y, b.y)
});
const ring = (box: TstlBox): TstlPoint[] => [
  { x: box.minX, y: box.minY },
  { x: box.maxX, y: box.minY },
  { x: box.maxX, y: box.maxY },
  { x: box.minX, y: box.maxY }
];

/** Exact axis-aligned union partition. Rectangles are interior-disjoint, so
 * independently triangulated fill fragments do not accumulate opacity. */
export function partitionBRectangles(boxes: readonly TstlBox[]): TstlPoint[][] {
  const ys = [...new Set(boxes.flatMap((box) => [box.minY, box.maxY]))].sort(
    (a, b) => a - b
  );
  const finished: TstlBox[] = [];
  let open = new Map<string, TstlBox>();
  for (let index = 0; index + 1 < ys.length; index++) {
    const minY = ys[index]!;
    const maxY = ys[index + 1]!;
    const intervals = boxes
      .filter((box) => box.minY < maxY && box.maxY > minY)
      .map((box) => ({ minX: box.minX, maxX: box.maxX }))
      .sort((a, b) => a.minX - b.minX || a.maxX - b.maxX);
    const merged: { minX: number; maxX: number }[] = [];
    for (const interval of intervals) {
      const last = merged.at(-1);
      if (last && interval.minX <= last.maxX)
        last.maxX = Math.max(last.maxX, interval.maxX);
      else merged.push({ ...interval });
    }
    const next = new Map<string, TstlBox>();
    for (const interval of merged) {
      const key = `${interval.minX}:${interval.maxX}`;
      const previous = open.get(key);
      if (previous) {
        previous.maxY = maxY;
        next.set(key, previous);
        open.delete(key);
      } else next.set(key, { ...interval, minY, maxY });
    }
    finished.push(...open.values());
    open = next;
  }
  finished.push(...open.values());
  return finished.sort((a, b) => a.minY - b.minY || a.minX - b.minX).map(ring);
}

interface QueueEntry {
  state: number;
  cost: number;
}
class Queue {
  values: QueueEntry[] = [];
  private less(a: QueueEntry, b: QueueEntry) {
    return a.cost < b.cost || (a.cost === b.cost && a.state < b.state);
  }
  push(value: QueueEntry) {
    let index = this.values.length;
    this.values.push(value);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.less(value, this.values[parent]!)) break;
      this.values[index] = this.values[parent]!;
      index = parent;
    }
    this.values[index] = value;
  }
  pop(): QueueEntry | undefined {
    const result = this.values[0];
    const last = this.values.pop();
    if (this.values.length && last) {
      let index = 0;
      while (index * 2 + 1 < this.values.length) {
        let child = index * 2 + 1;
        if (
          child + 1 < this.values.length &&
          this.less(this.values[child + 1]!, this.values[child]!)
        )
          child++;
        if (!this.less(this.values[child]!, last)) break;
        this.values[index] = this.values[child]!;
        index = child;
      }
      this.values[index] = last;
    }
    return result;
  }
}

interface WindowResult {
  traces: TstlIdentityTrace[];
  connectedIds: string[];
  budgetExhausted: boolean;
  graphVertices: number;
  expandedStates: number;
  routeLength: number;
  bendCount: number;
}

/** A coordinate-compressed mesh is built only after checking its product cap.
 * Nonmember boxes are closed obstacles. Greedy multi-source Dijkstra adds the
 * cheapest terminal to the current tree; no all-pairs paths are retained. */
function routeWindow(
  terminals: readonly TstlComparisonEvent[],
  rawObstacles: readonly TstlBox[],
  maxGraphVertices: number,
  maxExpandedStates: number
): WindowResult {
  const result: WindowResult = {
    traces: [],
    connectedIds: [],
    budgetExhausted: false,
    graphVertices: 0,
    expandedStates: 0,
    routeLength: 0,
    bendCount: 0
  };
  if (!terminals.length) return result;
  const bounds = inflate(
    {
      minX: Math.min(...terminals.map((event) => event.support.minX)),
      maxX: Math.max(...terminals.map((event) => event.support.maxX)),
      minY: Math.min(...terminals.map((event) => event.support.minY)),
      maxY: Math.max(...terminals.map((event) => event.support.maxY))
    },
    B_PARAMETERS.outerChannel
  );
  const obstacles = rawObstacles
    .map((box) =>
      inflate(box, B_PARAMETERS.clearance + B_PARAMETERS.tubeHalfWidth)
    )
    .filter((box) => boxesTouch(box, bounds));
  const coordinates = (axis: "X" | "Y") => {
    const low = `min${axis}` as const;
    const high = `max${axis}` as const;
    return [
      ...new Set([
        bounds[low],
        bounds[high],
        ...terminals.map((event) =>
          axis === "X" ? event.x : event.referenceY
        ),
        ...obstacles.flatMap((box) => [
          box[low] - B_PARAMETERS.boundaryOffset,
          box[high] + B_PARAMETERS.boundaryOffset
        ])
      ])
    ]
      .filter(
        (coordinate) => coordinate >= bounds[low] && coordinate <= bounds[high]
      )
      .sort((a, b) => a - b);
  };
  const xs = coordinates("X");
  const ys = coordinates("Y");
  result.graphVertices = xs.length * ys.length;
  if (result.graphVertices > maxGraphVertices || maxExpandedStates <= 0) {
    result.budgetExhausted = true;
    return result;
  }
  const xIndex = new Map(xs.map((x, index) => [x, index]));
  const yIndex = new Map(ys.map((y, index) => [y, index]));
  const point = (node: number) => ({
    x: xs[node % xs.length]!,
    y: ys[Math.floor(node / xs.length)]!
  });
  const nodeFor = (event: TstlComparisonEvent) =>
    yIndex.get(event.referenceY)! * xs.length + xIndex.get(event.x)!;
  const rowObstacles = ys.map((y) =>
    obstacles.filter((box) => y >= box.minY && y <= box.maxY)
  );
  const columnObstacles = xs.map((x) =>
    obstacles.filter((box) => x >= box.minX && x <= box.maxX)
  );
  const terminalsByNode = new Map<number, string[]>();
  for (const terminal of [...terminals].sort((a, b) =>
    idOrder(a.eventId, b.eventId)
  )) {
    const node = nodeFor(terminal);
    if (obstacles.some((box) => boxesTouch(box, pointBox(point(node)))))
      continue;
    terminalsByNode.set(node, [
      ...(terminalsByNode.get(node) ?? []),
      terminal.eventId
    ]);
  }
  const seed = [...terminalsByNode.entries()].sort((a, b) =>
    idOrder(a[1][0]!, b[1][0]!)
  )[0];
  if (!seed) return result;
  const tree = new Set([seed[0]]);
  result.connectedIds.push(...seed[1]);
  terminalsByNode.delete(seed[0]);
  while (terminalsByNode.size > 0) {
    const distances = new Float64Array(result.graphVertices * 3).fill(Infinity);
    const previous = new Int32Array(result.graphVertices * 3).fill(-1);
    const queue = new Queue();
    for (const node of [...tree].sort((a, b) => a - b)) {
      distances[node * 3] = 0;
      queue.push({ state: node * 3, cost: 0 });
    }
    let goal: { state: number; cost: number; eventId: string } | undefined;
    for (let current = queue.pop(); current; current = queue.pop()) {
      if (current.cost !== distances[current.state]) continue;
      if (goal && current.cost > goal.cost) break;
      if (result.expandedStates >= maxExpandedStates) {
        result.budgetExhausted = true;
        break;
      }
      result.expandedStates++;
      const node = Math.floor(current.state / 3);
      const direction = current.state % 3;
      const targetIds = terminalsByNode.get(node);
      if (targetIds) {
        if (!goal || idOrder(targetIds[0]!, goal.eventId) < 0)
          goal = { ...current, eventId: targetIds[0]! };
        continue;
      }
      const x = node % xs.length;
      const y = Math.floor(node / xs.length);
      const neighbors: [number, number][] = [];
      if (x > 0) neighbors.push([node - 1, 1]);
      if (x + 1 < xs.length) neighbors.push([node + 1, 1]);
      if (y > 0) neighbors.push([node - xs.length, 2]);
      if (y + 1 < ys.length) neighbors.push([node + xs.length, 2]);
      for (const [neighbor, nextDirection] of neighbors) {
        const a = point(node);
        const b = point(neighbor);
        const corridor = segmentBox(a, b);
        const relevant =
          nextDirection === 1 ? rowObstacles[y]! : columnObstacles[x]!;
        if (relevant.some((box) => boxesTouch(box, corridor))) continue;
        const cost =
          current.cost +
          Math.abs(a.x - b.x) +
          Math.abs(a.y - b.y) +
          (direction && direction !== nextDirection
            ? B_PARAMETERS.bendCost
            : 0);
        const state = neighbor * 3 + nextDirection;
        if (cost < distances[state]!) {
          distances[state] = cost;
          previous[state] = current.state;
          queue.push({ state, cost });
        }
      }
    }
    if (!goal) break;
    const nodes: number[] = [];
    for (let state = goal.state; state >= 0; state = previous[state]!)
      nodes.push(Math.floor(state / 3));
    nodes.reverse();
    const points = nodes.map(point);
    const simplified = points.filter((p, index) => {
      if (index === 0 || index === points.length - 1) return true;
      const a = points[index - 1]!;
      const b = points[index + 1]!;
      return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
    });
    result.traces.push({
      kind: "route",
      eventId: goal.eventId,
      points: simplified
    });
    result.bendCount += Math.max(0, simplified.length - 2);
    for (let index = 1; index < simplified.length; index++) {
      const a = simplified[index - 1]!;
      const b = simplified[index]!;
      result.routeLength += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }
    for (const node of nodes) {
      tree.add(node);
      const ids = terminalsByNode.get(node);
      if (ids) result.connectedIds.push(...ids);
      terminalsByNode.delete(node);
    }
    if (result.budgetExhausted) break;
  }
  return result;
}

export function buildCandidateB(
  comparison: TstlComparisonArtifact,
  options: BudgetOptions = {}
): TstlAlternativeGeometry {
  const parameters = { ...B_PARAMETERS, ...options };
  for (const value of Object.values(parameters))
    if (!Number.isFinite(value) || value < 0)
      throw Error("tstl_b_invalid_budget");
  if (
    !Number.isInteger(parameters.maxWindowTerminals) ||
    parameters.maxWindowTerminals < 1
  )
    throw Error("tstl_b_invalid_window_size");
  const events = new Map(
    comparison.a.events.map((event) => [event.eventId, event])
  );
  const leaves = [...comparison.projection.leafIds].sort(idOrder).map((id) => {
    const event = events.get(id);
    if (!event) throw Error("tstl_b_missing_leaf");
    return event;
  });
  const contoursByCompositeId: TstlAlternativeGeometry["contoursByCompositeId"] =
    {};
  const tracesByCompositeId: TstlAlternativeGeometry["tracesByCompositeId"] =
    {};
  const memberships: TstlAlternativeGeometry["memberships"] = [];
  const diagnostics = {
    totalComposites: comparison.projection.compositeIds.length,
    memberships: 0,
    routedMemberships: 0,
    listMemberships: 0,
    routeWindows: 0,
    budgetWindows: 0,
    disconnectedWindows: 0,
    partitionedComposites: 0,
    maxGraphVertices: 0,
    expandedStates: 0,
    routeLength: 0,
    bendCount: 0,
    terminalCells: 0,
    rejectedTerminalCells: 0,
    tubeSegments: 0,
    rejectedTubeSegments: 0,
    fragments: 0,
    rejoinCycles: 0,
    semanticCertifiedAreas: 0
  };
  // Membership-weighted shares reserve work for later national Composites.
  // Unused shares are deliberately not reassigned: traversal cannot affect B.
  const totalMemberships = comparison.projection.compositeIds.reduce(
    (total, id) => total + (comparison.projection.leafMembers[id]?.length ?? 0),
    0
  );
  for (const compositeId of [...comparison.projection.compositeIds].sort(
    idOrder
  )) {
    const memberIds = [
      ...(comparison.projection.leafMembers[compositeId] ?? [])
    ].sort(idOrder);
    const memberSet = new Set(memberIds);
    const ownerBudget = Math.floor(
      (parameters.expandedStateBudget * memberIds.length) /
        Math.max(1, totalMemberships)
    );
    const members = memberIds
      .map((id) => {
        const event = events.get(id);
        if (!event) throw Error("tstl_b_missing_member");
        return event;
      })
      .sort(
        (a, b) =>
          a.referenceY - b.referenceY ||
          a.x - b.x ||
          idOrder(a.eventId, b.eventId)
      );
    const obstacles = leaves
      .filter((event) => !memberSet.has(event.eventId))
      .map((event) => event.support);
    const boxes: TstlBox[] = [];
    for (const event of members) {
      const cell = inflate(event.support, B_PARAMETERS.terminalPadding);
      if (obstacles.some((box) => boxesTouch(box, cell))) {
        diagnostics.rejectedTerminalCells++;
      } else {
        boxes.push(cell);
        diagnostics.terminalCells++;
      }
    }
    const traces: TstlIdentityTrace[] = [];
    const connected = new Set<string>();
    const reasons = new Map<string, string>();
    const windowCount = Math.ceil(
      members.length / parameters.maxWindowTerminals
    );
    if (windowCount > 1) diagnostics.partitionedComposites++;
    const windowBudget = Math.min(
      parameters.maxWindowExpandedStates,
      Math.floor(ownerBudget / Math.max(1, windowCount))
    );
    for (
      let offset = 0;
      offset < members.length;
      offset += parameters.maxWindowTerminals
    ) {
      const window = members.slice(
        offset,
        offset + parameters.maxWindowTerminals
      );
      const result = routeWindow(
        window,
        obstacles,
        parameters.maxGraphVertices,
        windowBudget
      );
      diagnostics.routeWindows++;
      diagnostics.maxGraphVertices = Math.max(
        diagnostics.maxGraphVertices,
        result.graphVertices
      );
      diagnostics.expandedStates += result.expandedStates;
      diagnostics.routeLength += result.routeLength;
      diagnostics.bendCount += result.bendCount;
      if (result.budgetExhausted) diagnostics.budgetWindows++;
      if (result.connectedIds.length < window.length)
        diagnostics.disconnectedWindows++;
      for (const id of result.connectedIds) connected.add(id);
      for (const event of window)
        if (!connected.has(event.eventId))
          reasons.set(
            event.eventId,
            result.budgetExhausted
              ? "UNKNOWN_BUDGET"
              : "mesh-disconnected-or-nonmember-clearance"
          );
      traces.push(...result.traces);
      for (const trace of result.traces) {
        for (let index = 1; index < trace.points.length; index++) {
          const tube = inflate(
            segmentBox(trace.points[index - 1]!, trace.points[index]!),
            B_PARAMETERS.tubeHalfWidth
          );
          if (obstacles.some((box) => boxesTouch(box, tube))) {
            diagnostics.rejectedTubeSegments++;
          } else {
            boxes.push(tube);
            diagnostics.tubeSegments++;
          }
        }
      }
    }
    for (const eventId of memberIds) {
      memberships.push({
        compositeId,
        eventId,
        status: connected.has(eventId) ? "route" : "list",
        ...(connected.has(eventId)
          ? {}
          : { reason: reasons.get(eventId) ?? "no-terminal-route" })
      });
      if (connected.has(eventId)) diagnostics.routedMemberships++;
      else diagnostics.listMemberships++;
    }
    contoursByCompositeId[compositeId] = partitionBRectangles(boxes);
    tracesByCompositeId[compositeId] = traces;
    diagnostics.fragments += contoursByCompositeId[compositeId]!.length;
  }
  diagnostics.memberships = memberships.length;
  return {
    algorithmVersion: "tstl-b-bounded-rectilinear-forest/1",
    contoursByCompositeId,
    tracesByCompositeId,
    memberships,
    diagnostics,
    limitations: [
      "Experimental B tubes and terminal cells are not certified semantic membership areas; global intersection signatures and temporal completeness are unverified.",
      "Event coordinates are unchanged from A. Identity routes are not contains edges, and geometric crossings create no Event or relationship.",
      "Greedy length-plus-bend rectilinear trees run in temporal windows of at most 32 terminals. Windows remain separate forests, not a connected national area.",
      "Per-owner and per-window work shares reserve deterministic coverage across the World. UNKNOWN_BUDGET and mesh failures retain exact membership lists and safe terminal cells.",
      "Closed nonmember glyph obstacles are checked for every terminal cell and filled tube. Independent Composite corridors can overlap without certified shared membership.",
      "No joint atom arrangement, reserved-crossing cost, reroute pass, alternate tube-width search, or split/rejoin cycle is implemented. Tubes use axis-aligned square joins; no optimal Steiner or rejoin claim."
    ]
  };
}
