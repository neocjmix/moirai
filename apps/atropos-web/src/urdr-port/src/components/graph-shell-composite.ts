// @ts-nocheck -- Next.js adapter: preserve copied URDR source under Moirai's stricter TS config.
export type ViewportCoordinate = {
  x: number;
  y: number;
};

export type CompositeFadeCarrier = {
  id: string;
  opacity: number;
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

const COMPOSITE_COLOR_SLOT_COUNT = COMPOSITE_COLOR_PALETTE.length * 2;
const HSL_COLOR_PATTERN = /^hsl\((?<hue>-?\d+(?:\.\d+)?)\s+(?<saturation>\d+(?:\.\d+)?)%\s+(?<lightness>\d+(?:\.\d+)?)%\)$/;

type CompositePaletteFill = {
  hue: number;
  saturation: number;
  lightness: number;
};

const COMPOSITE_COLOR_FILLS = COMPOSITE_COLOR_PALETTE.map(({ fill }) => {
  const groups = HSL_COLOR_PATTERN.exec(fill)?.groups;
  return {
    hue: Number(groups?.hue ?? 0),
    saturation: Number(groups?.saturation ?? 0),
    lightness: Number(groups?.lightness ?? 0)
  } satisfies CompositePaletteFill;
});

function getCompositePaletteIndex(slotIndex: number) {
  return ((slotIndex % COMPOSITE_COLOR_PALETTE.length) + COMPOSITE_COLOR_PALETTE.length) % COMPOSITE_COLOR_PALETTE.length;
}

function getCompositeHueDistance(left: number, right: number) {
  const directDistance = Math.abs(left - right);
  return Math.min(directDistance, 360 - directDistance);
}

function getCompositeColorDistance(leftSlotIndex: number, rightSlotIndex: number) {
  const left = COMPOSITE_COLOR_FILLS[getCompositePaletteIndex(leftSlotIndex)]!;
  const right = COMPOSITE_COLOR_FILLS[getCompositePaletteIndex(rightSlotIndex)]!;
  const hueDistance = getCompositeHueDistance(left.hue, right.hue) / 180;
  const saturationDistance = Math.abs(left.saturation - right.saturation) / 100;
  const lightnessDistance = Math.abs(left.lightness - right.lightness) / 100;

  return hueDistance * 4 + saturationDistance + lightnessDistance;
}

function selectCompositeColorSlot(usedSlots: Set<number>, activeAssignments: CompositeColorAssignment[]) {
  let bestSlotIndex: number | null = null;
  let bestMinimumDistance = Number.NEGATIVE_INFINITY;
  let bestAverageDistance = Number.NEGATIVE_INFINITY;
  const epsilon = 1e-9;

  for (let slotIndex = 0; slotIndex < COMPOSITE_COLOR_SLOT_COUNT; slotIndex += 1) {
    if (usedSlots.has(slotIndex)) {
      continue;
    }

    if (activeAssignments.length === 0) {
      bestSlotIndex = bestSlotIndex === null ? slotIndex : Math.min(bestSlotIndex, slotIndex);
      continue;
    }

    const distances = activeAssignments.map((assignment) => getCompositeColorDistance(slotIndex, assignment.slotIndex));
    const minimumDistance = Math.min(...distances);
    const averageDistance = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;

    if (
      minimumDistance > bestMinimumDistance + epsilon ||
      (Math.abs(minimumDistance - bestMinimumDistance) <= epsilon && averageDistance > bestAverageDistance + epsilon) ||
      (Math.abs(minimumDistance - bestMinimumDistance) <= epsilon &&
        Math.abs(averageDistance - bestAverageDistance) <= epsilon &&
        (bestSlotIndex === null || slotIndex < bestSlotIndex))
    ) {
      bestSlotIndex = slotIndex;
      bestMinimumDistance = minimumDistance;
      bestAverageDistance = averageDistance;
    }
  }

  return bestSlotIndex;
}

function createCompositeColorAssignment(id: string, slotIndex: number): CompositeColorAssignment {
  const paletteIndex = getCompositePaletteIndex(slotIndex);
  const paletteEntry = COMPOSITE_COLOR_PALETTE[paletteIndex]!;
  return {
    id,
    slotIndex,
    fill: paletteEntry.fill,
    stroke: paletteEntry.fill,
    label: paletteEntry.label,
  };
}

export function reconcileCompositeColorAssignments(
  previous: CompositeColorAssignment[],
  activeIds: string[],
  renderedIds: string[]
) {
  const preservedById = new Map(previous.map((assignment) => [assignment.id, assignment]));
  const activeIdSet = new Set(activeIds);
  const renderedIdSet = new Set(renderedIds);
  const nextAssignments: CompositeColorAssignment[] = [];
  const activeAssignments: CompositeColorAssignment[] = [];
  const exitingAssignments: CompositeColorAssignment[] = [];
  const usedSlots = new Set<number>();

  for (const assignment of previous) {
    if (!renderedIdSet.has(assignment.id) || activeIdSet.has(assignment.id)) {
      continue;
    }

    exitingAssignments.push(assignment);
    usedSlots.add(assignment.slotIndex);
  }

  for (const id of activeIds) {
    const preserved = preservedById.get(id);
    if (!preserved) {
      continue;
    }
    nextAssignments.push(preserved);
    activeAssignments.push(preserved);
    usedSlots.add(preserved.slotIndex);
  }

  for (const id of activeIds) {
    if (preservedById.has(id)) {
      continue;
    }

    const slotIndex = selectCompositeColorSlot(usedSlots, activeAssignments);
    if (slotIndex === null) {
      break;
    }

    const assignment = createCompositeColorAssignment(id, slotIndex);
    nextAssignments.push(assignment);
    activeAssignments.push(assignment);
    usedSlots.add(slotIndex);
  }

  nextAssignments.push(...exitingAssignments);

  nextAssignments.sort((left, right) => left.slotIndex - right.slotIndex || left.id.localeCompare(right.id));
  // React state effects may run again while an asynchronous scene is empty.
  // Preserve identity for a no-op rather than scheduling another render.
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
