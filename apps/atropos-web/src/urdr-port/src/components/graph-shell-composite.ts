// @ts-nocheck -- Next.js adapter: preserve copied URDR source under Moirai's stricter TS config.
export type ViewportCoordinate = {
  x: number;
  y: number;
};

export type CompositeFadeCarrier = {
  id: string;
  opacity: number;
  contains?: readonly string[];
};

export type CompositeColorAssignment = {
  id: string;
  slotIndex: number;
  fill: string;
  stroke: string;
  label: string;
};

// Palette overflow and the initial color-assignment frame keep the same ink
// through hull, ordinary point and small point representations.
export const DEFAULT_COMPOSITE_FILL = "rgb(214, 120, 92)";

const COMPOSITE_COLOR_PALETTE = [
  { fill: "hsl(14 76% 63%)", stroke: "hsl(14 78% 44%)", label: "hsl(14 82% 22%)" },
  { fill: "hsl(42 82% 60%)", stroke: "hsl(42 84% 42%)", label: "hsl(38 88% 20%)" },
  { fill: "hsl(72 62% 58%)", stroke: "hsl(72 64% 38%)", label: "hsl(76 72% 18%)" },
  { fill: "hsl(118 54% 56%)", stroke: "hsl(118 56% 37%)", label: "hsl(122 64% 18%)" },
  { fill: "hsl(154 58% 54%)", stroke: "hsl(154 60% 35%)", label: "hsl(158 68% 18%)" },
  { fill: "hsl(184 62% 58%)", stroke: "hsl(184 65% 38%)", label: "hsl(188 72% 20%)" },
  { fill: "hsl(212 72% 62%)", stroke: "hsl(212 75% 44%)", label: "hsl(214 82% 22%)" },
  { fill: "hsl(238 68% 66%)", stroke: "hsl(238 70% 47%)", label: "hsl(242 78% 24%)" },
  { fill: "hsl(270 62% 67%)", stroke: "hsl(270 64% 48%)", label: "hsl(274 72% 24%)" },
  { fill: "hsl(302 60% 64%)", stroke: "hsl(302 62% 45%)", label: "hsl(306 70% 22%)" },
  { fill: "hsl(332 70% 65%)", stroke: "hsl(332 72% 46%)", label: "hsl(336 80% 24%)" },
  { fill: "hsl(356 76% 63%)", stroke: "hsl(356 78% 45%)", label: "hsl(360 84% 23%)" },
] as const;

/** Palette ownership comes from authored identity, never the current camera or
 * the order geometry arrived. The same World/Event survives a cold restore,
 * Publication replacement and all hull/point states with exactly the same ink. */
export function compositeColorAssignment(id: string, worldId = ""): CompositeColorAssignment {
  let hash = 2166136261;
  for (const character of `${worldId}:${id}`) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  const slotIndex = (hash >>> 0) % COMPOSITE_COLOR_PALETTE.length;
  const paletteEntry = COMPOSITE_COLOR_PALETTE[slotIndex]!;
  return { id, slotIndex, ...paletteEntry };
}

export function reconcileCompositeColorAssignments(
  previous: CompositeColorAssignment[],
  activeIds: string[],
  renderedIds: string[],
  worldId = "",
) {
  const preservedById = new Map(previous.map((assignment) => [assignment.id, assignment]));
  const nextAssignments = [...new Set([...activeIds, ...renderedIds])].map(id => {
    const assignment = compositeColorAssignment(id, worldId);
    const previous = preservedById.get(id);
    return previous?.slotIndex === assignment.slotIndex ? previous : assignment;
  }).sort((left, right) => left.slotIndex - right.slotIndex || left.id.localeCompare(right.id));
  return nextAssignments.length === previous.length && nextAssignments.every((item, index) => item === previous[index])
    ? previous : nextAssignments;
}

export type CompositeFadePresence<T extends CompositeFadeCarrier> = T & {
  renderedOpacity: number;
  exitStartedAt?: number;
  visibilityState: "entering" | "present" | "exiting";
};

export const COMPOSITE_CHILD_HIDE_MIN_WIDTH_PX = 220;
export const COMPOSITE_CHILD_HIDE_MIN_HEIGHT_PX = 100;
export const COMPOSITE_CHILD_FADE_START_RATIO = 0.58;

function smoothstep(value: number) {
  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value * value * (3 - 2 * value);
}

export function getCompositeChildrenOpacity(
  points: ViewportCoordinate[],
  _minWidthPx = COMPOSITE_CHILD_HIDE_MIN_WIDTH_PX,
  minHeightPx = COMPOSITE_CHILD_HIDE_MIN_HEIGHT_PX
) {
  if (points.length === 0) {
    return 1;
  }

  const bounds = points.reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      maxX: Math.max(current.maxX, point.x),
      minY: Math.min(current.minY, point.y),
      maxY: Math.max(current.maxY, point.y)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    }
  );

  const height = bounds.maxY - bounds.minY;
  const heightProgress = minHeightPx <= 0 ? 1 : Math.min(height / minHeightPx, 1);
  const visibilityProgress = heightProgress;
  const fadeProgress = (visibilityProgress - COMPOSITE_CHILD_FADE_START_RATIO) / (1 - COMPOSITE_CHILD_FADE_START_RATIO);

  return smoothstep(fadeProgress);
}

export function shouldHideCompositeChildren(
  points: ViewportCoordinate[],
  minWidthPx = COMPOSITE_CHILD_HIDE_MIN_WIDTH_PX,
  minHeightPx = COMPOSITE_CHILD_HIDE_MIN_HEIGHT_PX
) {
  return getCompositeChildrenOpacity(points, minWidthPx, minHeightPx) <= 0.001;
}

export function reconcileCompositeFadePresence<T extends CompositeFadeCarrier>(
  previous: CompositeFadePresence<T>[],
  next: T[]
): CompositeFadePresence<T>[] {
  if (previous.length === 0 && next.length === 0) return previous;
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const nextIds = new Set(next.map((item) => item.id));
  const reconciled: CompositeFadePresence<T>[] = [];

  for (const item of next) {
    const existing = previousById.get(item.id);
    if (!existing) {
      reconciled.push({
        ...item,
        renderedOpacity: 0,
        visibilityState: "entering"
      });
      continue;
    }

    reconciled.push({
      ...item,
      renderedOpacity: existing.renderedOpacity,
      visibilityState: existing.visibilityState === "exiting" ? "entering" : "present"
    });
  }

  for (const item of previous) {
    if (nextIds.has(item.id)) {
      continue;
    }

    reconciled.push({
      ...item,
      visibilityState: "exiting"
    });
  }

  return reconciled;
}

export function advanceCompositeFadePresence<T extends CompositeFadeCarrier>(
  items: CompositeFadePresence<T>[],
  now = performance.now(),
): CompositeFadePresence<T>[] {
  if (items.length === 0) return items;
  let changed = false;
  const next = items.map((item) => {
    const exiting = item.visibilityState === "exiting";
    const renderedOpacity = exiting ? 0 : item.opacity;
    const visibilityState = exiting ? "exiting" : "present";
    // Camera updates schedule this RAF while paint is already settled. Keep
    // the state reference on a no-op so React does not render the SVG again.
    if (item.renderedOpacity === renderedOpacity && item.visibilityState === visibilityState &&
        (!exiting || item.exitStartedAt !== undefined)) return item;
    changed = true;
    return {
      ...item,
      ...(exiting ? {exitStartedAt: item.exitStartedAt ?? now} : {}),
      renderedOpacity,
      visibilityState,
    };
  });
  return changed ? next : items;
}

export function pruneExitedCompositeFadePresence<T extends CompositeFadeCarrier>(items: CompositeFadePresence<T>[], now = performance.now(), duration = 220) {
  const retained = items.filter((item) => !(item.visibilityState === "exiting" && item.renderedOpacity <= 0.001 && item.exitStartedAt !== undefined && now >= item.exitStartedAt + duration));
  return retained.length === items.length ? items : retained;
}

/** Exit paint keeps its last geometry, but must follow the live camera while
 * its opacity settles. Transform screen coordinates through the original view
 * back into World space and then through the current view. */
export function retainedCompositePaintTransform(
  previous: {x: number; y: number; scaleX: number; scaleY: number},
  previousSize: {width: number; height: number},
  current: {x: number; y: number; scaleX: number; scaleY: number},
  currentSize: {width: number; height: number},
) {
  const sx = current.scaleX / previous.scaleX;
  const sy = current.scaleY / previous.scaleY;
  const tx = currentSize.width / 2 + current.x - sx * (previousSize.width / 2 + previous.x);
  const ty = currentSize.height / 2 + current.y - sy * (previousSize.height / 2 + previous.y);
  return `matrix(${sx} 0 0 ${sy} ${tx} ${ty})`;
}
