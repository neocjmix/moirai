// @ts-nocheck -- Next.js adapter: preserve copied URDR source under Moirai's stricter TS config.
export type ImageViewportPoint = {
  x: number;
  y: number;
};

export type ImageViewportView = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

type PanGestureBaseline = {
  kind: "pan";
  pointerId: number;
  pointer: ImageViewportPoint;
  view: ImageViewportView;
};

type PinchGestureBaseline = {
  kind: "pinch";
  pointerIds: [number, number];
  center: ImageViewportPoint;
  anchor: ImageViewportPoint;
  distance: number;
  spanX: number;
  spanY: number;
  view: ImageViewportView;
};

type GestureBaseline = PanGestureBaseline | PinchGestureBaseline;

export type ImageViewportState = {
  view: ImageViewportView;
  activePointers: Record<number, ImageViewportPoint>;
  gestureBaseline: GestureBaseline | null;
};

const SPAN_EPSILON = 0.0001;
const PINCH_DISTANCE_DAMPING_START = 300;
const PINCH_DAMPING_LOG_CURVE = 12;

const DEFAULT_VIEW: ImageViewportView = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1
};

type PointerEntry = {
  pointerId: number;
  point: ImageViewportPoint;
};

function sortPointerEntries(activePointers: Record<number, ImageViewportPoint>) {
  return Object.entries(activePointers)
    .map(([pointerId, point]) => ({ pointerId: Number(pointerId), point }))
    .sort((left, right) => left.pointerId - right.pointerId);
}

function createPanBaseline(view: ImageViewportView, pointer: PointerEntry): PanGestureBaseline {
  return {
    kind: "pan",
    pointerId: pointer.pointerId,
    pointer: pointer.point,
    view
  };
}

function createPinchBaseline(view: ImageViewportView, firstPointer: PointerEntry, secondPointer: PointerEntry): PinchGestureBaseline {
  const dx = secondPointer.point.x - firstPointer.point.x;
  const dy = secondPointer.point.y - firstPointer.point.y;
  const distance = Math.hypot(dx, dy);

  return {
    kind: "pinch",
    pointerIds: [firstPointer.pointerId, secondPointer.pointerId],
    center: {
      x: (firstPointer.point.x + secondPointer.point.x) / 2,
      y: (firstPointer.point.y + secondPointer.point.y) / 2
    },
    anchor: {
      x: (((firstPointer.point.x + secondPointer.point.x) / 2) - view.x) / view.scaleX,
      y: (((firstPointer.point.y + secondPointer.point.y) / 2) - view.y) / view.scaleY
    },
    distance,
    spanX: Math.abs(dx),
    spanY: Math.abs(dy),
    view
  };
}

function buildGestureBaseline(view: ImageViewportView, activePointers: Record<number, ImageViewportPoint>) {
  const pointers = sortPointerEntries(activePointers);

  if (pointers.length === 0) {
    return null;
  }

  if (pointers.length === 1) {
    return createPanBaseline(view, pointers[0]);
  }

  return createPinchBaseline(view, pointers[0], pointers[1]);
}

function scaleRatio(initialSpan: number, nextSpan: number) {
  if (initialSpan <= SPAN_EPSILON) {
    return 1;
  }

  return nextSpan / initialSpan;
}

export function getPinchSpanInfluence(span: number) {
  if (span >= PINCH_DISTANCE_DAMPING_START) {
    return 1;
  }

  if (span <= 0) {
    return 0;
  }

  const normalizedSpan = span / PINCH_DISTANCE_DAMPING_START;
  return Math.log1p(normalizedSpan * PINCH_DAMPING_LOG_CURVE) / Math.log1p(PINCH_DAMPING_LOG_CURVE);
}

export function getViewportPinchInfluence(state: ImageViewportState) {
  if (state.gestureBaseline?.kind !== "pinch") {
    return null;
  }

  return {
    x: getPinchSpanInfluence(state.gestureBaseline.spanX),
    y: getPinchSpanInfluence(state.gestureBaseline.spanY)
  };
}

function applyPinchInfluence(baseScale: number, nextScale: number, influence: number) {
  return baseScale + (nextScale - baseScale) * influence;
}

function applyGesture(view: ImageViewportView, baseline: GestureBaseline | null, activePointers: Record<number, ImageViewportPoint>) {
  if (!baseline) {
    return view;
  }

  if (baseline.kind === "pan") {
    const nextPointer = activePointers[baseline.pointerId];
    if (!nextPointer) {
      return view;
    }

    return {
      ...baseline.view,
      x: baseline.view.x + (nextPointer.x - baseline.pointer.x),
      y: baseline.view.y + (nextPointer.y - baseline.pointer.y)
    };
  }

  const firstPointer = activePointers[baseline.pointerIds[0]];
  const secondPointer = activePointers[baseline.pointerIds[1]];

  if (!firstPointer || !secondPointer) {
    return view;
  }

  const currentCenter = {
    x: (firstPointer.x + secondPointer.x) / 2,
    y: (firstPointer.y + secondPointer.y) / 2
  };
  const dx = secondPointer.x - firstPointer.x;
  const dy = secondPointer.y - firstPointer.y;
  const nextSpanX = Math.abs(dx);
  const nextSpanY = Math.abs(dy);
  const baseNextScaleX = baseline.view.scaleX * scaleRatio(baseline.spanX, nextSpanX);
  const baseNextScaleY = baseline.view.scaleY * scaleRatio(baseline.spanY, nextSpanY);
  const influenceX = getPinchSpanInfluence(baseline.spanX);
  const influenceY = getPinchSpanInfluence(baseline.spanY);
  const nextScaleX = applyPinchInfluence(baseline.view.scaleX, baseNextScaleX, influenceX);
  const nextScaleY = applyPinchInfluence(baseline.view.scaleY, baseNextScaleY, influenceY);

  return {
    x: currentCenter.x - nextScaleX * baseline.anchor.x,
    y: currentCenter.y - nextScaleY * baseline.anchor.y,
    scaleX: nextScaleX,
    scaleY: nextScaleY
  };
}

export function createImageViewportState(initialView?: Partial<ImageViewportView>): ImageViewportState {
  const view = {
    ...DEFAULT_VIEW,
    ...initialView
  };

  return {
    view,
    activePointers: {},
    gestureBaseline: null
  };
}

export function addViewportPointer(
  state: ImageViewportState,
  pointerId: number,
  point: ImageViewportPoint
): ImageViewportState {
  if (Object.keys(state.activePointers).length >= 2 && !state.activePointers[pointerId]) {
    return state;
  }

  const activePointers = {
    ...state.activePointers,
    [pointerId]: point
  };

  return {
    view: state.view,
    activePointers,
    gestureBaseline: buildGestureBaseline(state.view, activePointers)
  };
}

export function moveViewportPointer(
  state: ImageViewportState,
  pointerId: number,
  point: ImageViewportPoint
): ImageViewportState {
  if (!state.activePointers[pointerId]) {
    return state;
  }

  const activePointers = {
    ...state.activePointers,
    [pointerId]: point
  };

  return {
    view: applyGesture(state.view, state.gestureBaseline, activePointers),
    activePointers,
    gestureBaseline: state.gestureBaseline
  };
}

export function removeViewportPointer(state: ImageViewportState, pointerId: number): ImageViewportState {
  if (!state.activePointers[pointerId]) {
    return state;
  }

  const activePointers = { ...state.activePointers };
  delete activePointers[pointerId];

  return {
    view: state.view,
    activePointers,
    gestureBaseline: buildGestureBaseline(state.view, activePointers)
  };
}

export function resetViewportView(state: ImageViewportState, nextView?: Partial<ImageViewportView>): ImageViewportState {
  const view = {
    ...DEFAULT_VIEW,
    ...nextView
  };

  return {
    view,
    activePointers: state.activePointers,
    gestureBaseline: buildGestureBaseline(view, state.activePointers)
  };
}
