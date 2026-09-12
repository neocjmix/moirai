// @ts-nocheck -- Next.js adapter: URDR was authored under its own TS config.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { chartPlaneDiagnosticSchema, eventDetailResponseSchema, graphShellChartPlaneEntitySchema, graphShellChartPlaneRegionEntitySchema, graphShellViewportResponseSchema, type EventDetailResponse, type EventRecord, type GraphShellChartPlane, type GraphShellChartPlaneEntity, type GraphShellChartPlaneRegionEntity, type GraphShellWorkspaceShell, type WorldAnchor } from "@urdr/contracts";
import type { ChartPlaneXForceLayoutOptions } from "@urdr/domain";
import { graphReadLoader, type GraphReadLoader } from "../graph-read-loader";
import type { AppLocale } from "../locale";
import { GraphSourceIsland } from "../../../components/graph-source-island";

import {
  createChartPlaneSnapshot,
  expandWorldBoundsForViewportRequest,
  getVisibleWorldBounds,
  projectWorldPoint,
  type ViewportSize
} from "./chart-surface";
import {
  addViewportPointer,
  createImageViewportState,
  moveViewportPointer,
  removeViewportPointer,
  resetViewportView,
} from "./image-viewport";
import {
  advanceCompositeFadePresence,
  getCompositeChildrenOpacity,
  pruneExitedCompositeFadePresence,
  reconcileCompositeColorAssignments,
  reconcileCompositeFadePresence,
  type CompositeColorAssignment,
  type CompositeFadePresence,
  type ViewportCoordinate
} from "./graph-shell-composite";
import {
  buildClosedSplinePath,
  buildOpenSplinePath,
  buildCompositeHull,
  DEFAULT_COMPOSITE_LABEL_PATH_SPLINE_TUNING,
  expandPolygon,
  resolveCompositeEdgeLabelPlacement,
  type CompositeLabelAnchor,
  type CompositeHullMode,
  type CompositeSplineTuning,
} from "./graph-shell-region-geometry";
import { applyCompositeLabelVisibilityPolicy, applyEditorialPointLabelPolicy, formatCompositeDisplayLabel, getEditorialPointPriority, getEditorialZoomBucket, shouldElidePointForFarZoom } from "./graph-shell-label-policy";
import {
  GRAPH_SHELL_LOCAL_STATE_KEY,
  buildGraphShellUrlSearch,
  createGraphShellViewportSliceFromView,
  createImageViewportViewFromRestorableSlice,
  normalizeGraphShellShellSlice,
  parseGraphShellLocalState,
  parseGraphShellUrlState,
  resolveGraphShellRestorableState,
  serializeGraphShellLocalState,
  type GraphShellDrawerStage,
  type GraphShellRestorableShellSlice,
  type GraphShellRestorableState,
} from "./graph-shell-share-state";
import styles from "./graph-shell.module.css";

const GRAPH_SHELL_LOADING_WORKSPACE_BUILD_REVISION = "__loading__";

const WORLD_UNITS_PER_YEAR = 140;
const AXIS_MIN_PIXEL_SPACING = 20;

type GregorianAxisUnit = "year" | "month" | "day" | "hour" | "minute" | "second";

type GregorianAxisStep = {
  unit: GregorianAxisUnit;
  count: number;
  approxYears: number;
};

type GregorianAxisTick = {
  id: string;
  top: number;
  label: string;
  showLabel?: boolean;
};

type AnchorLine = {
  id: string;
  label: string;
  y: number;
};

type RelationSegment = {
  id: string;
  typeKey: string;
  label: string;
  endpointIds: string[];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midX: number;
  midY: number;
  angle: number;
  showLabel: boolean;
  opacity: number;
  isSurrogate?: boolean;
};

type InstantPoint = {
  id: string;
  eventId: string;
  x: number;
  y: number;
  label: string;
  renderedLabel?: string;
  containedBy?: string;
  editorial?: GraphShellChartPlaneEntity["editorial"];
  showLabel?: boolean;
  opacity: number;
};

type CompositeRegion = {
  id: string;
  label: string;
  renderedLabel: string;
  path: string;
  labelPath?: string;
  projectedPoints: ViewportCoordinate[];
  labelAttachX: number;
  labelAttachY: number;
  labelGuideX: number;
  labelGuideY: number;
  labelX: number;
  labelY: number;
  labelAnchor: CompositeLabelAnchor;
  labelAngle: number;
  textPathStartOffset: string;
  depth: number;
  contains: string[];
  containedBy?: string;
  editorial?: GraphShellChartPlaneEntity["editorial"];
  showLabel: boolean;
  opacity: number;
  surfaceOpacity: number;
};

type CompositeHullGeometry = {
  points: ViewportCoordinate[];
};

type WorldInstantPoint = {
  id: string;
  eventId: string;
  canonId: string;
  x: number;
  y: number;
  label: string;
  containedBy?: string;
  editorial?: GraphShellChartPlaneEntity["editorial"];
};

type WorldCompositeRegion = {
  id: string;
  label: string;
  points: ViewportCoordinate[];
  depth: number;
  contains: string[];
  containedBy?: string;
  editorial?: GraphShellChartPlaneEntity["editorial"];
};

type CompositeRenderState = {
  regions: CompositeRegion[];
  activeColorRegionIds: string[];
  descendantOpacityById: Map<string, number>;
};

const COMPOSITE_LABEL_LINE_HEIGHT = 18;
const COMPOSITE_LABEL_CHAR_WIDTH = 8;
const COMPOSITE_LABEL_GAP = 4;
const COMPOSITE_LABEL_GUIDE_LENGTH = 8;
const EDGE_POINT_BACKOFF = 12;
const COMPOSITE_FADE_DURATION_MS = 220;
const COMPOSITE_SURFACE_FILL_OPACITY = 0.32;
const COMPOSITE_SURFACE_STROKE_OPACITY = 0.2;
const EVENT_DRAWER_ENTER_DELAY_MS = 16;
const EVENT_DRAWER_EXIT_DURATION_MS = 420;
const EVENT_DRAWER_TAP_SLOP_PX = 8;
const EVENT_DRAWER_PEEK_OFFSET_PX = 408;
const VIEWPORT_FETCH_GESTURE_SETTLE_MS = 150;
const VIEWPORT_PERSIST_SETTLE_MS = 150;
const GRAPH_SHELL_DEFAULT_TIME_LEVEL = "year";
const GRAPH_SHELL_CORE_ARTIFACT_CLASSES = ["point", "region"] as const;
const GRAPH_SHELL_FULL_ARTIFACT_CLASSES = ["point", "segment", "region"] as const;
const EVENT_DRAWER_EXPAND_THRESHOLD_PX = 72;
const EVENT_DRAWER_COLLAPSE_THRESHOLD_PX = 96;
const EVENT_DRAWER_PEEK_DISMISS_THRESHOLD_PX = 96;
const EVENT_DRAWER_FULL_DISMISS_THRESHOLD_PX = 240;
const RELATION_CAUSE_STROKE = "rgba(0, 0, 0, 0.78)";
const RELATION_ORDER_STROKE = "var(--graph-relation-order)";
const RELATION_SOFT_STROKE = "var(--graph-relation-soft)";
const RELATION_SURROGATE_STROKE = "var(--graph-relation-surrogate)";
const GRAPH_BACKDROP_REFERENCE_IMAGE_URL = "/@fs/Users/chanjinpark/dev/urdr/.hermux/uploads/tg_-5186373632_17004_2026-04-24T08-29-46-679Z.jpg";

function getCompositeRegionPadding(level: number) {
  return 6 + level * 5;
}

function getEventLinkCompositeStrokeWidth(level: number) {
  return 1.25 + Math.max(0, level - 1) * 0.15;
}

function getCompositeOutlineStrokeWidth(level: number) {
  return 1.6 + Math.max(0, level - 1) * 0.2;
}

function getEventDrawerStageOffset(stage: EventDrawerStage) {
  return stage === "peek" ? EVENT_DRAWER_PEEK_OFFSET_PX : 0;
}

function clampEventDrawerDragOffset(offset: number, originStage: EventDrawerStage) {
  if (originStage === "peek") {
    return Math.min(Math.max(offset, -320), 360);
  }

  return Math.min(Math.max(offset, -48), 360);
}

function regionIntersectsViewport(points: ViewportCoordinate[], viewport: ViewportSize, margin = 48) {
  if (points.length === 0) {
    return false;
  }

  const bounds = points.reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      maxX: Math.max(current.maxX, point.x),
      minY: Math.min(current.minY, point.y),
      maxY: Math.max(current.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );

  return (
    bounds.maxX >= -margin &&
    bounds.minX <= viewport.width + margin &&
    bounds.maxY >= -margin &&
    bounds.minY <= viewport.height + margin
  );
}

function worldBoundsIntersect(bounds: GraphShellChartPlaneRegionEntity["worldBounds"], viewportBounds: GraphShellChartPlaneRegionEntity["worldBounds"]) {
  return (
    bounds.maxX >= viewportBounds.minX &&
    bounds.minX <= viewportBounds.maxX &&
    bounds.maxY >= viewportBounds.minY &&
    bounds.minY <= viewportBounds.maxY
  );
}

function worldBoundsToPolygon(bounds: GraphShellChartPlaneRegionEntity["worldBounds"]): ViewportCoordinate[] {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
}

function getRelationStyle(typeKey: string) {
  if (typeKey === "causes") {
    return {
      stroke: RELATION_CAUSE_STROKE,
      markerId: "relation-arrow-cause",
      dasharray: undefined,
      label: "CAUSES",
      strokeWidth: 1,
      labelFontSize: 7.25,
      labelFontWeight: 600,
      labelOpacity: 0.94
    };
  }

  if (typeKey === "precedes" || typeKey === "before" || typeKey === "after" || typeKey === "not-before" || typeKey === "not-after") {
    return {
      stroke: RELATION_ORDER_STROKE,
      markerId: "relation-arrow-order",
      dasharray: "5 4",
      label: typeKey === "precedes" ? "AFTER" : typeKey.toUpperCase(),
      strokeWidth: 0.45,
      labelFontSize: 7.25,
      labelFontWeight: 500,
      labelOpacity: typeKey === "precedes" ? 0.76 : 0.88
    };
  }

  return {
    stroke: RELATION_SOFT_STROKE,
    markerId: "relation-arrow-soft",
    dasharray: "2 4",
    label: typeKey.toUpperCase(),
    strokeWidth: 1,
    labelFontSize: 8.5,
    labelFontWeight: 500,
    labelOpacity: 0.88
  };
}

function normalizeRelationGeometry(endpointIds: string[], x1: number, y1: number, x2: number, y2: number) {
  const anchorEndpointIds = endpointIds.filter((id) => id.startsWith("t_"));
  if (anchorEndpointIds.length === 0) {
    return { x1, y1, x2, y2 };
  }

  const useX = endpointIds[0]?.startsWith("t_") ? x2 : x1;
  return {
    x1: useX,
    y1,
    x2: useX,
    y2
  };
}

function shortenLineEnd(x1: number, y1: number, x2: number, y2: number, backoff: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length <= backoff || length === 0) {
    return { x1, y1, x2, y2 };
  }

  const ratio = (length - backoff) / length;
  return {
    x1,
    y1,
    x2: x1 + dx * ratio,
    y2: y1 + dy * ratio
  };
}

function getReadableEdgeAngle(angle: number) {
  if (angle > 90 || angle < -90) {
    return angle + 180;
  }

  return angle;
}

function buildCurvedRelationPath(x1: number, y1: number, x2: number, y2: number) {
  const format = (value: number) => Number(value.toFixed(2));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const offset = Math.min(Math.max(length * 0.18, 14), 40);
  const normalX = -dy / length;
  const normalY = dx / length;
  const cx = (x1 + x2) / 2 + normalX * offset;
  const cy = (y1 + y2) / 2 + normalY * offset;
  return `M ${format(x1)} ${format(y1)} Q ${format(cx)} ${format(cy)} ${format(x2)} ${format(y2)}`;
}

function encodeCompositeLabelPathIdComponent(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint === undefined ? "_" : `_x${codePoint.toString(16)}_`;
  });
}

function getCompositeLabelPathId(regionId: string) {
  return `graph-shell-composite-label-path-${encodeCompositeLabelPathIdComponent(regionId)}`;
}

function getRelationLabelPathId(segmentId: string) {
  return `graph-shell-relation-path-${encodeCompositeLabelPathIdComponent(segmentId)}`;
}

const DAYS_PER_YEAR = 365.2425;
const HOURS_PER_YEAR = DAYS_PER_YEAR * 24;
const MINUTES_PER_YEAR = HOURS_PER_YEAR * 60;
const SECONDS_PER_YEAR = MINUTES_PER_YEAR * 60;

const GREGORIAN_AXIS_STEPS: GregorianAxisStep[] = [
  { unit: "second", count: 1, approxYears: 1 / SECONDS_PER_YEAR },
  { unit: "second", count: 5, approxYears: 5 / SECONDS_PER_YEAR },
  { unit: "second", count: 10, approxYears: 10 / SECONDS_PER_YEAR },
  { unit: "second", count: 30, approxYears: 30 / SECONDS_PER_YEAR },
  { unit: "minute", count: 1, approxYears: 1 / MINUTES_PER_YEAR },
  { unit: "minute", count: 5, approxYears: 5 / MINUTES_PER_YEAR },
  { unit: "minute", count: 10, approxYears: 10 / MINUTES_PER_YEAR },
  { unit: "minute", count: 30, approxYears: 30 / MINUTES_PER_YEAR },
  { unit: "hour", count: 1, approxYears: 1 / HOURS_PER_YEAR },
  { unit: "hour", count: 6, approxYears: 6 / HOURS_PER_YEAR },
  { unit: "hour", count: 12, approxYears: 12 / HOURS_PER_YEAR },
  { unit: "day", count: 1, approxYears: 1 / DAYS_PER_YEAR },
  { unit: "day", count: 7, approxYears: 7 / DAYS_PER_YEAR },
  { unit: "day", count: 14, approxYears: 14 / DAYS_PER_YEAR },
  { unit: "month", count: 1, approxYears: 1 / 12 },
  { unit: "month", count: 3, approxYears: 3 / 12 },
  { unit: "month", count: 6, approxYears: 6 / 12 },
  { unit: "year", count: 1, approxYears: 1 },
  { unit: "year", count: 2, approxYears: 2 },
  { unit: "year", count: 5, approxYears: 5 },
  { unit: "year", count: 10, approxYears: 10 },
  { unit: "year", count: 20, approxYears: 20 },
  { unit: "year", count: 50, approxYears: 50 },
  { unit: "year", count: 100, approxYears: 100 }
];

function createUtcDate(year: number, month = 0, day = 1, hour = 0, minute = 0, second = 0) {
  const date = new Date(Date.UTC(0, month, day, hour, minute, second));
  date.setUTCFullYear(year);
  return date;
}

function worldYToGregorianDate(centerYear: number, worldY: number) {
  const fractionalYear = centerYear + worldY / WORLD_UNITS_PER_YEAR;
  const wholeYear = Math.floor(fractionalYear);
  const yearProgress = fractionalYear - wholeYear;
  const startOfYear = createUtcDate(wholeYear, 0, 1);
  const startOfNextYear = createUtcDate(wholeYear + 1, 0, 1);
  return new Date(startOfYear.getTime() + (startOfNextYear.getTime() - startOfYear.getTime()) * yearProgress);
}

function gregorianDateToWorldY(centerYear: number, date: Date) {
  const year = date.getUTCFullYear();
  const startOfYear = createUtcDate(year, 0, 1);
  const startOfNextYear = createUtcDate(year + 1, 0, 1);
  const elapsed = date.getTime() - startOfYear.getTime();
  const fullYearDuration = startOfNextYear.getTime() - startOfYear.getTime();
  const fractionalYear = year + elapsed / fullYearDuration;
  return (fractionalYear - centerYear) * WORLD_UNITS_PER_YEAR;
}

function padNumber(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function formatGregorianAxisLabel(date: Date, step: GregorianAxisStep) {
  const year = date.getUTCFullYear();
  const month = padNumber(date.getUTCMonth() + 1);
  const day = padNumber(date.getUTCDate());
  const hour = padNumber(date.getUTCHours());
  const minute = padNumber(date.getUTCMinutes());
  const second = padNumber(date.getUTCSeconds());

  switch (step.unit) {
    case "year":
      return `${year}`;
    case "month":
      return `${year}-${month}`;
    case "day":
      return `${year}-${month}-${day}`;
    case "hour":
      return `${month}-${day} ${hour}:00`;
    case "minute":
      return `${month}-${day} ${hour}:${minute}`;
    case "second":
      return `${month}-${day} ${hour}:${minute}:${second}`;
  }
}

function formatGregorianAxisMinorLabel(date: Date, step: GregorianAxisStep) {
  const month = padNumber(date.getUTCMonth() + 1);
  const day = padNumber(date.getUTCDate());
  const hour = padNumber(date.getUTCHours());
  const minute = padNumber(date.getUTCMinutes());
  const second = padNumber(date.getUTCSeconds());

  switch (step.unit) {
    case "year":
      return formatGregorianAxisLabel(date, step);
    case "month":
      return month;
    case "day":
      return day;
    case "hour":
      return `${hour}:00`;
    case "minute":
      return `${hour}:${minute}`;
    case "second":
      return `${minute}:${second}`;
  }
}

function formatAnchorLabel(date: Date, step: GregorianAxisStep) {
  return formatGregorianAxisLabel(date, step);
}

function pickGregorianAxisMajorStep(step: GregorianAxisStep) {
  if (step.unit === "year") {
    return step;
  }

  if (step.unit === "month") {
    return { unit: "year", count: 1, approxYears: 1 } satisfies GregorianAxisStep;
  }

  if (step.unit === "day") {
    return { unit: "month", count: 1, approxYears: 1 / 12 } satisfies GregorianAxisStep;
  }

  if (step.unit === "hour") {
    return { unit: "day", count: 1, approxYears: 1 / DAYS_PER_YEAR } satisfies GregorianAxisStep;
  }

  if (step.unit === "minute") {
    return { unit: "hour", count: 1, approxYears: 1 / HOURS_PER_YEAR } satisfies GregorianAxisStep;
  }

  return { unit: "minute", count: 1, approxYears: 1 / MINUTES_PER_YEAR } satisfies GregorianAxisStep;
}

function buildGregorianAxisTicks(
  centerYear: number,
  step: GregorianAxisStep,
  minWorldY: number,
  maxWorldY: number,
  viewportHeight: number,
  viewY: number,
  scaleY: number,
  labelFormatter: (date: Date, step: GregorianAxisStep) => string
) {
  const minDate = worldYToGregorianDate(centerYear, minWorldY);
  const maxDate = worldYToGregorianDate(centerYear, maxWorldY);
  const ticks: GregorianAxisTick[] = [];

  for (
    let cursor = floorGregorianDateToStep(minDate, step), index = 0;
    cursor.getTime() <= maxDate.getTime() && index < 200;
    cursor = addGregorianStep(cursor, step), index += 1
  ) {
    const worldY = gregorianDateToWorldY(centerYear, cursor);
    const top = viewportHeight / 2 + viewY + worldY * scaleY;
    if (top < -24 || top > viewportHeight + 24) {
      continue;
    }

    ticks.push({
      id: `${step.unit}:${step.count}:${cursor.toISOString()}`,
      top,
      label: labelFormatter(cursor, step)
    });
  }

  return ticks;
}

function applyAxisLabelVisibility(majorTicks: GregorianAxisTick[], minorTicks: GregorianAxisTick[]) {
  const occupiedBands: Array<{ min: number; max: number }> = [];

  const reserve = (ticks: GregorianAxisTick[], labelHeight: number) =>
    ticks.map((tick) => {
      const band = {
        min: tick.top - labelHeight / 2,
        max: tick.top + labelHeight / 2
      };
      const overlaps = occupiedBands.some((occupied) => band.min < occupied.max && band.max > occupied.min);
      if (!overlaps) {
        occupiedBands.push(band);
      }

      return {
        ...tick,
        showLabel: !overlaps
      } satisfies GregorianAxisTick;
    });

  return {
    major: reserve(majorTicks, 18),
    minor: reserve(minorTicks, 12)
  };
}

function pickGregorianAxisStep(scaleY: number) {
  const pixelsPerYear = Math.max(Math.abs(scaleY) * WORLD_UNITS_PER_YEAR, 0.000001);
  for (const step of GREGORIAN_AXIS_STEPS) {
    if (pixelsPerYear * step.approxYears >= AXIS_MIN_PIXEL_SPACING) {
      return step;
    }
  }

  return GREGORIAN_AXIS_STEPS[GREGORIAN_AXIS_STEPS.length - 1];
}

function floorGregorianDateToStep(date: Date, step: GregorianAxisStep) {
  const next = new Date(date.getTime());

  if (step.unit === "year") {
    return createUtcDate(Math.floor(next.getUTCFullYear() / step.count) * step.count, 0, 1);
  }
  if (step.unit === "month") {
    return createUtcDate(next.getUTCFullYear(), Math.floor(next.getUTCMonth() / step.count) * step.count, 1);
  }
  if (step.unit === "day") {
    return createUtcDate(next.getUTCFullYear(), next.getUTCMonth(), Math.floor((next.getUTCDate() - 1) / step.count) * step.count + 1);
  }
  if (step.unit === "hour") {
    return createUtcDate(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), Math.floor(next.getUTCHours() / step.count) * step.count);
  }
  if (step.unit === "minute") {
    return createUtcDate(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), next.getUTCHours(), Math.floor(next.getUTCMinutes() / step.count) * step.count);
  }
  return createUtcDate(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), next.getUTCHours(), next.getUTCMinutes(), Math.floor(next.getUTCSeconds() / step.count) * step.count);
}

function addGregorianStep(date: Date, step: GregorianAxisStep) {
  const next = new Date(date.getTime());
  if (step.unit === "year") next.setUTCFullYear(next.getUTCFullYear() + step.count);
  else if (step.unit === "month") next.setUTCMonth(next.getUTCMonth() + step.count);
  else if (step.unit === "day") next.setUTCDate(next.getUTCDate() + step.count);
  else if (step.unit === "hour") next.setUTCHours(next.getUTCHours() + step.count);
  else if (step.unit === "minute") next.setUTCMinutes(next.getUTCMinutes() + step.count);
  else next.setUTCSeconds(next.getUTCSeconds() + step.count);
  return next;
}

function collectRegionDescendantIds(
  regionId: string,
  regionById: Map<string, GraphShellChartPlaneRegionEntity>,
  visited: Set<string>
): Set<string> {
  if (visited.has(regionId)) {
    return new Set<string>();
  }

  visited.add(regionId);
  const region = regionById.get(regionId);
  if (!region) {
    return new Set<string>();
  }

  const descendantIds = new Set<string>();
  for (const childId of region.contains) {
    descendantIds.add(childId);
    if (!regionById.has(childId)) {
      continue;
    }

    const nestedDescendantIds = collectRegionDescendantIds(childId, regionById, visited);
    for (const nestedId of nestedDescendantIds) {
      descendantIds.add(nestedId);
    }
  }

  return descendantIds;
}

function collectRecursiveRegionClosure(
  seedRegionIds: Set<string>,
  regionById: Map<string, GraphShellChartPlaneRegionEntity>,
  parentRegionIdsByChildId: Map<string, Set<string>>
) {
  const allRegionIds = new Set<string>();
  const stack = [...seedRegionIds];

  while (stack.length > 0) {
    const regionId = stack.pop();
    if (!regionId || allRegionIds.has(regionId)) {
      continue;
    }

    allRegionIds.add(regionId);
    const region = regionById.get(regionId);
    if (!region) {
      continue;
    }

    for (const childId of region.contains) {
      if (regionById.has(childId) && !allRegionIds.has(childId)) {
        stack.push(childId);
      }
    }

    for (const parentRegionId of parentRegionIdsByChildId.get(regionId) ?? []) {
      if (!allRegionIds.has(parentRegionId)) {
        stack.push(parentRegionId);
      }
    }
  }

  return allRegionIds;
}

function computeRegionDepth(
  regionId: string,
  regionById: Map<string, GraphShellChartPlaneRegionEntity>,
  memo: Map<string, number>,
  visited: Set<string>
): number {
  if (memo.has(regionId)) {
    return memo.get(regionId) ?? 0;
  }

  if (visited.has(regionId)) {
    return 0;
  }

  visited.add(regionId);
  const region = regionById.get(regionId);
  if (!region) {
    memo.set(regionId, 0);
    return 0;
  }

  const childRegionIds = region.contains.filter((childId) => regionById.has(childId));
  if (childRegionIds.length === 0) {
    memo.set(regionId, 0);
    return 0;
  }

  const depth = 1 + Math.max(...childRegionIds.map((childId) => computeRegionDepth(childId, regionById, memo, new Set(visited))));
  memo.set(regionId, depth);
  return depth;
}

function getPolygonFootprint(points: ViewportCoordinate[]) {
  if (points.length === 0) {
    return 0;
  }

  const bounds = points.reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      maxX: Math.max(current.maxX, point.x),
      minY: Math.min(current.minY, point.y),
      maxY: Math.max(current.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );

  return Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxY - bounds.minY);
}

function getPolygonArea(points: ViewportCoordinate[]) {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area) * 0.5;
}

function clipPolygonAgainstViewport(points: ViewportCoordinate[], viewportSize: ViewportSize) {
  const clipLeft = (input: ViewportCoordinate[]) => {
    const output: ViewportCoordinate[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]!;
      const previous = input[(index - 1 + input.length) % input.length]!;
      const currentInside = current.x >= 0;
      const previousInside = previous.x >= 0;
      if (currentInside !== previousInside) {
        const dx = current.x - previous.x || 1;
        const t = (0 - previous.x) / dx;
        output.push({ x: 0, y: previous.y + (current.y - previous.y) * t });
      }
      if (currentInside) {
        output.push(current);
      }
    }
    return output;
  };

  const clipRight = (input: ViewportCoordinate[]) => {
    const output: ViewportCoordinate[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]!;
      const previous = input[(index - 1 + input.length) % input.length]!;
      const currentInside = current.x <= viewportSize.width;
      const previousInside = previous.x <= viewportSize.width;
      if (currentInside !== previousInside) {
        const dx = current.x - previous.x || 1;
        const t = (viewportSize.width - previous.x) / dx;
        output.push({ x: viewportSize.width, y: previous.y + (current.y - previous.y) * t });
      }
      if (currentInside) {
        output.push(current);
      }
    }
    return output;
  };

  const clipTop = (input: ViewportCoordinate[]) => {
    const output: ViewportCoordinate[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]!;
      const previous = input[(index - 1 + input.length) % input.length]!;
      const currentInside = current.y >= 0;
      const previousInside = previous.y >= 0;
      if (currentInside !== previousInside) {
        const dy = current.y - previous.y || 1;
        const t = (0 - previous.y) / dy;
        output.push({ x: previous.x + (current.x - previous.x) * t, y: 0 });
      }
      if (currentInside) {
        output.push(current);
      }
    }
    return output;
  };

  const clipBottom = (input: ViewportCoordinate[]) => {
    const output: ViewportCoordinate[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]!;
      const previous = input[(index - 1 + input.length) % input.length]!;
      const currentInside = current.y <= viewportSize.height;
      const previousInside = previous.y <= viewportSize.height;
      if (currentInside !== previousInside) {
        const dy = current.y - previous.y || 1;
        const t = (viewportSize.height - previous.y) / dy;
        output.push({ x: previous.x + (current.x - previous.x) * t, y: viewportSize.height });
      }
      if (currentInside) {
        output.push(current);
      }
    }
    return output;
  };

  return [clipLeft, clipRight, clipTop, clipBottom].reduce((current, clip) => (current.length >= 3 ? clip(current) : current), points);
}

function getCompositeSurfaceOpacityScale(points: ViewportCoordinate[], viewportSize: ViewportSize) {
  const viewportArea = Math.max(viewportSize.width * viewportSize.height, 1);
  const coverage = getPolygonArea(clipPolygonAgainstViewport(points, viewportSize)) / viewportArea;
  if (coverage <= 0.35) {
    return 1;
  }
  if (coverage >= 1) {
    return 0;
  }
  const progress = (coverage - 0.35) / 0.65;
  return 1 - progress;
}

type GraphShellProps = {
  initialWorkspace: GraphShellBootstrapWorkspace;
  initialChartPlane?: GraphShellChartPlane;
  loader?: GraphReadLoader;
  locale: AppLocale;
  compositeHullMode: CompositeHullMode;
  compositeSplineTuning: CompositeSplineTuning;
};

type GraphShellBootstrapWorkspace = GraphShellWorkspaceShell & {
  chartPlane?: GraphShellChartPlane;
};

type XForceControl = {
  key: keyof ChartPlaneXForceLayoutOptions;
  label: Record<AppLocale, string>;
  description: Record<AppLocale, string>;
  min: number;
  max: number;
  step: number;
};

type GraphShellCopy = {
  timelineTabAriaLabel: string;
  canonTabAriaLabel: string;
  warningTabAriaLabel: string;
  eventDrawerLabel: string;
  eventDrawerBackdropCloseLabel: string;
  eventDrawerHandleLabel: string;
  eventDrawerTabsLabel: string;
  eventNotesTabLabel: string;
  eventLinksTabLabel: string;
  closeIslandLabel: string;
  openIslandLabel: string;
  timelineSearchPlaceholder: string;
  canonSearchPlaceholder: string;
  canonRevealHiddenLabel: (count: number) => string;
  canonHiddenBadgeLabel: string;
  canonHiddenHint: string;
  canonSelectedStateLabel: string;
  canonUnselectedStateLabel: string;
  eventOpenPointLabel: (label: string) => string;
  eventMetadataLabel: string;
  eventNotesLabel: string;
  eventLinksLabel: string;
  eventLoadingLabel: string;
  eventLoadErrorLabel: string;
  eventTimeLabel: string;
  eventPlacesLabel: string;
  eventPeopleLabel: string;
  eventCausesLabel: string;
  eventResultsLabel: string;
  eventEmptyValueLabel: string;
  eventNotesEmptyLabel: string;
  eventLinksCurrentLabel: string;
  eventLinksDirectLabel: string;
  eventLinksParentsLabel: string;
  eventLinksChildrenLabel: string;
  eventLinksEmptyLabel: string;
  eventLinksEventKindLabel: string;
  eventLinksRegionKindLabel: string;
  noCanonLabel: string;
  unresolvedWarningMessage: (relatedId: string) => string;
  pinchLabel: string;
  dragLabel: string;
  idleLabel: string;
  resetLabel: string;
  hullModeTitle: string;
  convexHullLabel: string;
  concaveHullLabel: string;
  xForceTitle: string;
  xForceResetLabel: string;
  collapseTabBarLabel: string;
  expandTabBarLabel: string;
  primarySectionsAriaLabel: string;
  islandSearchModeAriaLabel: string;
  settingsTitle: string;
  settingsBody: string;
  settingsLanguageTitle: string;
  settingsLanguageHint: string;
  settingsBrowserDefaultLabel: string;
  settingsOverrideActiveLabel: string;
  settingsPlaceholderTitle: string;
};

const GRAPH_SHELL_COPY: Record<AppLocale, GraphShellCopy> = {
  ko: {
    timelineTabAriaLabel: "타임라인",
    canonTabAriaLabel: "캐논",
    warningTabAriaLabel: "경고",
    eventDrawerLabel: "사건 패널",
    eventDrawerBackdropCloseLabel: "사건 서랍 바깥 닫기",
    eventDrawerHandleLabel: "사건 서랍 핸들",
    eventDrawerTabsLabel: "사건 패널 탭",
    eventNotesTabLabel: "노트",
    eventLinksTabLabel: "링크",
    closeIslandLabel: "아일랜드 접기",
    openIslandLabel: "아일랜드 열기",
    timelineSearchPlaceholder: "타임라인, 시대, 사건 흐름 검색",
    canonSearchPlaceholder: "캐논, 세계관, 시간 체계 검색",
    canonRevealHiddenLabel: (count) => `숨겨진 캐논 보기 (${count})`,
    canonHiddenBadgeLabel: "숨김",
    canonHiddenHint: "현재 타임라인과 직접 호환되지 않아 기본적으로 숨겨집니다.",
    canonSelectedStateLabel: "선택됨",
    canonUnselectedStateLabel: "선택 안 됨",
    eventOpenPointLabel: (label) => `${label} 패널 열기`,
    eventMetadataLabel: "메타데이터",
    eventNotesLabel: "Markdown 노트",
    eventLinksLabel: "1단계 링크",
    eventLoadingLabel: "사건 노트를 불러오는 중입니다.",
    eventLoadErrorLabel: "사건 노트를 불러오지 못했습니다.",
    eventTimeLabel: "시간",
    eventPlacesLabel: "장소",
    eventPeopleLabel: "인물",
    eventCausesLabel: "원인",
    eventResultsLabel: "결과",
    eventEmptyValueLabel: "없음",
    eventNotesEmptyLabel: "기록된 Markdown 노트가 없습니다.",
    eventLinksCurrentLabel: "현재 사건",
    eventLinksDirectLabel: "직접 링크",
    eventLinksParentsLabel: "상위 컴포짓",
    eventLinksChildrenLabel: "같은 컴포짓의 직계 이웃",
    eventLinksEmptyLabel: "현재 메모리 안에서 바로 연결된 링크가 없습니다.",
    eventLinksEventKindLabel: "사건",
    eventLinksRegionKindLabel: "컴포짓",
    noCanonLabel: "캐논 없음",
    unresolvedWarningMessage: (relatedId) => `직접 연관 이벤트 ${relatedId} 가 아직 프로젝션되지 않았습니다.`,
    pinchLabel: "핀치",
    dragLabel: "드래그",
    idleLabel: "대기",
    resetLabel: "초기화",
    hullModeTitle: "컴포짓 외곽선",
    convexHullLabel: "Convex",
    concaveHullLabel: "Concave",
    xForceTitle: "X 배치 힘",
    xForceResetLabel: "X 초기화",
    collapseTabBarLabel: "탭바 숨기기",
    expandTabBarLabel: "탭바 펼치기",
    primarySectionsAriaLabel: "주요 섹션",
    islandSearchModeAriaLabel: "아일랜드 검색 모드",
    settingsTitle: "언어",
    settingsBody: "브라우저 언어를 우선 사용하되, 여기서 수동으로 덮어쓸 수 있습니다.",
    settingsLanguageTitle: "앱 언어",
    settingsLanguageHint: "수동 선택은 셸 상태와 분리되어 저장됩니다.",
    settingsBrowserDefaultLabel: "브라우저 기본값 사용",
    settingsOverrideActiveLabel: "수동 선택 적용 중",
    settingsPlaceholderTitle: "준비 중",
  },
  en: {
    timelineTabAriaLabel: "Timeline",
    canonTabAriaLabel: "Canon",
    warningTabAriaLabel: "Warnings",
    eventDrawerLabel: "Event panel",
    eventDrawerBackdropCloseLabel: "Close event drawer backdrop",
    eventDrawerHandleLabel: "Event drawer handle",
    eventDrawerTabsLabel: "Event panel tabs",
    eventNotesTabLabel: "Notes",
    eventLinksTabLabel: "Links",
    closeIslandLabel: "Collapse island",
    openIslandLabel: "Open island",
    timelineSearchPlaceholder: "Search timelines, eras, or event flows",
    canonSearchPlaceholder: "Search canons, worlds, or time systems",
    canonRevealHiddenLabel: (count) => `Show hidden canons (${count})`,
    canonHiddenBadgeLabel: "Hidden",
    canonHiddenHint: "Hidden by default because it is not directly compatible with this timeline.",
    canonSelectedStateLabel: "Selected",
    canonUnselectedStateLabel: "Not selected",
    eventOpenPointLabel: (label) => `Open panel for ${label}`,
    eventMetadataLabel: "Metadata",
    eventNotesLabel: "Markdown notes",
    eventLinksLabel: "1-depth links",
    eventLoadingLabel: "Loading event notes.",
    eventLoadErrorLabel: "Unable to load event notes.",
    eventTimeLabel: "Time",
    eventPlacesLabel: "Places",
    eventPeopleLabel: "People",
    eventCausesLabel: "Causes",
    eventResultsLabel: "Results",
    eventEmptyValueLabel: "None",
    eventNotesEmptyLabel: "No Markdown notes are recorded yet.",
    eventLinksCurrentLabel: "Current event",
    eventLinksDirectLabel: "Direct links",
    eventLinksParentsLabel: "Composite parents",
    eventLinksChildrenLabel: "Direct neighbors in the same composite",
    eventLinksEmptyLabel: "No immediate links are present in the current in-memory graph.",
    eventLinksEventKindLabel: "Event",
    eventLinksRegionKindLabel: "Composite",
    noCanonLabel: "No canon",
    unresolvedWarningMessage: (relatedId) => `Directly related event ${relatedId} has not been projected yet.`,
    pinchLabel: "Pinch",
    dragLabel: "Drag",
    idleLabel: "Idle",
    resetLabel: "Reset",
    hullModeTitle: "Composite hull",
    convexHullLabel: "Convex",
    concaveHullLabel: "Concave",
    xForceTitle: "X layout force",
    xForceResetLabel: "Reset X",
    collapseTabBarLabel: "Collapse tab bar",
    expandTabBarLabel: "Expand tab bar",
    primarySectionsAriaLabel: "Primary sections",
    islandSearchModeAriaLabel: "Island search mode",
    settingsTitle: "Language",
    settingsBody: "The app prefers the browser locale, but you can override it here.",
    settingsLanguageTitle: "App language",
    settingsLanguageHint: "The manual override is stored separately from shell state.",
    settingsBrowserDefaultLabel: "Use browser default",
    settingsOverrideActiveLabel: "Manual override active",
    settingsPlaceholderTitle: "Coming soon",
  },
};

type EventDrawerContentProps = {
  copy: GraphShellCopy;
  eventLinkGraphFragment: EventLinkGraphFragment;
  eventTab: EventDrawerTab;
  eventChronologySummary?: string;
  eventPlaceLabels: string[];
  eventPeopleLabels: string[];
  eventCauseLabels: string[];
  eventResultLabels: string[];
  notes: string;
  loadState: "idle" | "loading" | "ready" | "error";
  selectedEventTitle: string;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  onTabChange: (tab: EventDrawerTab) => void;
};

type EventDrawerTab = "notes" | "links";

type EventLinkGraphLabelAnchor = "start" | "middle" | "end";

type EventLinkGraphNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  labelAnchor: EventLinkGraphLabelAnchor;
  isCurrent: boolean;
  opacity: number;
};

type EventLinkGraphRegion = CompositeRegion & {
  role: "parent" | "child";
};

type EventLinkGraphFragment = {
  width: number;
  height: number;
  nodes: EventLinkGraphNode[];
  regions: EventLinkGraphRegion[];
  segments: RelationSegment[];
  hasContext: boolean;
};

type EventDrawerSelection = {
  eventId: string;
  label: string;
  requestKey: number;
};

type EventDrawerTarget = {
  eventId: string;
  label: string;
};

type EventDrawerStage = GraphShellDrawerStage;

type EventDrawerDragSource = "sheet";

type EventDrawerDragState = {
  pointerId: number;
  source: EventDrawerDragSource;
  startClientY: number;
  originStage: EventDrawerStage;
};

type PendingEventTap = {
  pointerId: number;
  target: EventDrawerTarget;
  startClientX: number;
  startClientY: number;
};

function clearPersistedGraphShellState() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(GRAPH_SHELL_LOCAL_STATE_KEY);
}

function createDefaultShellSlice(workspace: GraphShellWorkspaceShell): GraphShellRestorableShellSlice {
  const selectedTimelineId = workspace.tabs.find((tab) => tab.id === workspace.defaultTabId)?.id
    ?? workspace.tabs[0]?.id
    ?? workspace.defaultTabId;
  const selectedTimeline = workspace.tabs.find((tab) => tab.id === selectedTimelineId) ?? workspace.tabs[0] ?? null;
  const enabledCanonIds = selectedTimeline?.defaultEnabledCanonIds.length
    ? selectedTimeline.defaultEnabledCanonIds
    : workspace.canons[0]?.id
      ? [workspace.canons[0].id]
      : [];
  const normalized = normalizeGraphShellShellSlice({
    selectedTimelineId,
    enabledCanonIds,
  });
  if (!normalized) {
    throw new Error("Invalid default graph shell state.");
  }
  return normalized;
}

function validateShellSliceForWorkspace(
  slice: GraphShellRestorableShellSlice | undefined,
  workspace: GraphShellWorkspaceShell,
) {
  if (!slice) {
    return undefined;
  }

  const validTimelineIds = new Set(workspace.tabs.map((tab) => tab.id));
  const validCanonIds = new Set(workspace.canons.map((canon) => canon.id));
  if (!validTimelineIds.has(slice.selectedTimelineId)) {
    return undefined;
  }
  if (slice.enabledCanonIds.some((canonId) => !validCanonIds.has(canonId))) {
    return undefined;
  }

  return slice;
}

function readPersistedGraphShellLocalState(viewportSize: ViewportSize) {
  if (typeof window === "undefined") {
    return { hadInvalidState: false, state: null as GraphShellRestorableState | null };
  }

  const raw = window.localStorage.getItem(GRAPH_SHELL_LOCAL_STATE_KEY);
  if (!raw) {
    return { hadInvalidState: false, state: null as GraphShellRestorableState | null };
  }

  try {
    const parsed = parseGraphShellLocalState(JSON.parse(raw) as unknown, viewportSize);
    if (!parsed) {
      return { hadInvalidState: true, state: null as GraphShellRestorableState | null };
    }

    return { hadInvalidState: false, state: parsed };
  } catch {
    return { hadInvalidState: true, state: null as GraphShellRestorableState | null };
  }
}

function resolveBootstrapEventLabel(chartPlane: GraphShellChartPlane | null, eventId: string) {
  const matchingEntity = chartPlane?.entities.find((entity) => entity.eventId === eventId || entity.id === eventId);
  return matchingEntity?.label ?? eventId;
}

function parseEventResponse(payload: unknown) {
  const directEvent = eventDetailResponseSchema.safeParse(payload);
  if (directEvent.success) {
    return directEvent.data;
  }

  throw new Error("Invalid event response payload.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deriveRegionWorldBounds(
  regionId: string,
  contains: string[],
  points: Extract<GraphShellChartPlaneEntity, { geometryKind: "point" }>[],
) {
  const supportPoints = points.filter((point) => contains.includes(point.id) || point.containedBy === regionId);
  if (supportPoints.length === 0) {
    return null;
  }

  return supportPoints.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.position.x),
      minY: Math.min(bounds.minY, point.position.y),
      maxX: Math.max(bounds.maxX, point.position.x),
      maxY: Math.max(bounds.maxY, point.position.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

function salvageRegionEntity(
  entry: unknown,
  points: Extract<GraphShellChartPlaneEntity, { geometryKind: "point" }>[],
) {
  if (!isRecord(entry)) {
    return null;
  }

  if (
    typeof entry.id !== "string" ||
    typeof entry.eventId !== "string" ||
    typeof entry.canonId !== "string" ||
    typeof entry.label !== "string" ||
    entry.geometryKind !== "region" ||
    (entry.validationState !== "ok" && entry.validationState !== "warning" && entry.validationState !== "error")
  ) {
    return null;
  }

  const contains = Array.isArray(entry.contains)
    ? entry.contains.filter((childId): childId is string => typeof childId === "string")
    : [];
  const diagnostics = Array.isArray(entry.diagnostics)
    ? entry.diagnostics.flatMap((diagnostic) => {
        const parsed = chartPlaneDiagnosticSchema.safeParse(diagnostic);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const viewportClass =
    entry.viewportClass === "visible" ||
    entry.viewportClass === "context-retained" ||
    entry.viewportClass === "clipped" ||
    entry.viewportClass === "hidden"
      ? entry.viewportClass
      : "visible";
  const containedBy = typeof entry.containedBy === "string" ? entry.containedBy : undefined;
  const derivedWorldBounds = deriveRegionWorldBounds(entry.id, contains, points);
  if (!derivedWorldBounds) {
    return null;
  }

  return {
    id: entry.id,
    eventId: entry.eventId,
    canonId: entry.canonId,
    label: entry.label,
    geometryKind: "region",
    validationState: entry.validationState,
    contains,
    ...(containedBy ? { containedBy } : {}),
    diagnostics,
    viewportClass,
    worldBounds: derivedWorldBounds,
  } satisfies GraphShellChartPlaneRegionEntity;
}

function parseViewportResponse(payload: unknown) {
  const directViewport = graphShellViewportResponseSchema.safeParse(payload);
  if (directViewport.success) {
    return directViewport.data;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid viewport response payload.");
  }

  const candidate = payload as Record<string, unknown>;
  const parseIntegerField = (fieldName: "revision" | "canonicalRevision" | "lodLevel") => {
    const value = candidate[fieldName];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid viewport response field: ${fieldName}`);
    }

    return value;
  };
  const parseEntityArray = (value: unknown) => {
    if (!Array.isArray(value)) {
      return [] as GraphShellChartPlaneEntity[];
    }

    return value.flatMap((entry) => {
      const parsed = graphShellChartPlaneEntitySchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
  };
  const parseRegionArray = (value: unknown, parsedEntities: GraphShellChartPlaneEntity[]) => {
    if (!Array.isArray(value)) {
      return [] as GraphShellChartPlaneRegionEntity[];
    }

    const parsedPoints = parsedEntities.filter(
      (entity): entity is Extract<GraphShellChartPlaneEntity, { geometryKind: "point" }> => entity.geometryKind === "point"
    );

    return value.flatMap((entry) => {
      const parsed = graphShellChartPlaneRegionEntitySchema.safeParse(entry);
      if (parsed.success) {
        return [parsed.data];
      }

      const salvaged = salvageRegionEntity(entry, parsedPoints);
      return salvaged ? [salvaged] : [];
    });
  };
  const parseDiagnostics = (value: unknown) => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry) => {
      const parsed = chartPlaneDiagnosticSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
  };

  const truncated = candidate.truncated;
  if (typeof truncated !== "boolean") {
    throw new Error("Invalid viewport response field: truncated");
  }

  const cache = candidate.cache;
  if (!cache || typeof cache !== "object" || Array.isArray(cache) || typeof (cache as { stale?: unknown }).stale !== "boolean") {
    throw new Error("Invalid viewport response field: cache");
  }

  const nextSuggestedLod = candidate.nextSuggestedLod;
  if (nextSuggestedLod !== undefined && (typeof nextSuggestedLod !== "number" || !Number.isInteger(nextSuggestedLod))) {
    throw new Error("Invalid viewport response field: nextSuggestedLod");
  }

  const parsedEntities = parseEntityArray(candidate.entities);

  return {
    revision: parseIntegerField("revision"),
    canonicalRevision: parseIntegerField("canonicalRevision"),
    lodLevel: parseIntegerField("lodLevel"),
    entities: parsedEntities,
    edges: parseEntityArray(candidate.edges),
    regions: parseRegionArray(candidate.regions, parsedEntities),
    diagnostics: parseDiagnostics(candidate.diagnostics),
    truncated,
    cache: { stale: (cache as { stale: boolean }).stale },
    ...(nextSuggestedLod === undefined ? {} : { nextSuggestedLod }),
  };
}

async function readResponseMessage(response: Response) {
  try {
    const payload = await response.json() as unknown;
    if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
      return payload.message;
    }
  } catch {
  }

  return response.statusText || `Request failed with status ${response.status}.`;
}

const EVENT_LINK_FRAGMENT_WIDTH = 320;
const EVENT_LINK_FRAGMENT_HEIGHT = 280;
const EVENT_LINK_FRAGMENT_PADDING_X = 34;
const EVENT_LINK_FRAGMENT_PADDING_Y = 34;

function getEventLinkLabelPlacement(dx: number, dy: number, isCurrent: boolean) {
  if (isCurrent) {
    return { dx: 0, dy: -14, anchor: "middle" as EventLinkGraphLabelAnchor };
  }

  return dx >= 0
    ? { dx: 9, dy: -8, anchor: "start" as EventLinkGraphLabelAnchor }
    : { dx: -9, dy: -8, anchor: "end" as EventLinkGraphLabelAnchor };
}

function buildEventLinkGraphFragment({
  allProjectedInstantPoints,
  chartCompositeRegions,
  compositeSplineTuning,
  selectedEventPoint,
  selectedEventTitle,
  visibleRelationSegments,
}: {
  allProjectedInstantPoints: InstantPoint[];
  chartCompositeRegions: CompositeRegion[];
  compositeSplineTuning: CompositeSplineTuning;
  selectedEventPoint: WorldInstantPoint | null;
  selectedEventTitle: string;
  visibleRelationSegments: RelationSegment[];
}): EventLinkGraphFragment {
  const emptyFragment = {
    width: EVENT_LINK_FRAGMENT_WIDTH,
    height: EVENT_LINK_FRAGMENT_HEIGHT,
    nodes: [],
    regions: [],
    segments: [],
    hasContext: false,
  } satisfies EventLinkGraphFragment;

  if (!selectedEventPoint) {
    return emptyFragment;
  }

  const projectedPointById = new Map(allProjectedInstantPoints.map((point) => [point.id, point]));
  const projectedRegionById = new Map(chartCompositeRegions.map((region) => [region.id, region]));
  const selectedProjectedPoint = projectedPointById.get(selectedEventPoint.id);

  if (!selectedProjectedPoint) {
    return emptyFragment;
  }

  const pointIds = new Set<string>([selectedEventPoint.id]);
  const regionIds = new Set<string>();
  const directSegments: RelationSegment[] = [];

  for (const segment of visibleRelationSegments) {
    if (!segment.endpointIds.includes(selectedEventPoint.id)) {
      continue;
    }

    const otherEndpointId = segment.endpointIds.find((endpointId) => endpointId !== selectedEventPoint.id && projectedPointById.has(endpointId));
    if (!otherEndpointId) {
      continue;
    }

    pointIds.add(otherEndpointId);
    directSegments.push(segment);
  }

  const parentRegion = selectedEventPoint.containedBy ? projectedRegionById.get(selectedEventPoint.containedBy) : undefined;
  if (parentRegion) {
    regionIds.add(parentRegion.id);
    for (const childId of parentRegion.contains) {
      if (projectedPointById.has(childId)) {
        pointIds.add(childId);
        continue;
      }

      if (projectedRegionById.has(childId)) {
        regionIds.add(childId);
      }
    }
  }

  const relativeCoordinates: ViewportCoordinate[] = [{ x: 0, y: 0 }];
  for (const pointId of pointIds) {
    const point = projectedPointById.get(pointId);
    if (!point) {
      continue;
    }

    relativeCoordinates.push({ x: point.x - selectedProjectedPoint.x, y: point.y - selectedProjectedPoint.y });
  }

  for (const regionId of regionIds) {
    const region = projectedRegionById.get(regionId);
    if (!region) {
      continue;
    }

    for (const point of region.projectedPoints) {
      relativeCoordinates.push({ x: point.x - selectedProjectedPoint.x, y: point.y - selectedProjectedPoint.y });
    }
  }

  const extents = relativeCoordinates.reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      maxX: Math.max(current.maxX, point.x),
      minY: Math.min(current.minY, point.y),
      maxY: Math.max(current.maxY, point.y),
    }),
    {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    },
  );

  const availableHalfWidth = EVENT_LINK_FRAGMENT_WIDTH / 2 - EVENT_LINK_FRAGMENT_PADDING_X;
  const availableHalfHeight = EVENT_LINK_FRAGMENT_HEIGHT / 2 - EVENT_LINK_FRAGMENT_PADDING_Y;
  const fitRelativeCoordinates = [...pointIds]
    .map((pointId) => projectedPointById.get(pointId))
    .filter((point): point is InstantPoint => Boolean(point))
    .map((point) => ({ x: point.x - selectedProjectedPoint.x, y: point.y - selectedProjectedPoint.y }));
  for (const regionId of regionIds) {
    const region = projectedRegionById.get(regionId);
    if (!region) {
      continue;
    }

    for (const point of region.projectedPoints) {
      fitRelativeCoordinates.push({ x: point.x - selectedProjectedPoint.x, y: point.y - selectedProjectedPoint.y });
    }
  }

  fitRelativeCoordinates.sort((left, right) => left.x - right.x || left.y - right.y);
  const xOutlierTrim = fitRelativeCoordinates.length >= 5 ? 1 : 0;
  const yOutlierTrim = fitRelativeCoordinates.length >= 7 ? 1 : 0;
  const trimmedXCoordinates = fitRelativeCoordinates.slice(xOutlierTrim, fitRelativeCoordinates.length - xOutlierTrim || fitRelativeCoordinates.length);
  const trimmedYCoordinates = [...fitRelativeCoordinates].sort((left, right) => left.y - right.y || left.x - right.x).slice(yOutlierTrim, fitRelativeCoordinates.length - yOutlierTrim || fitRelativeCoordinates.length);
  const leftExtent = Math.max(Math.abs(trimmedXCoordinates[0]?.x ?? extents.minX), 1);
  const rightExtent = Math.max(trimmedXCoordinates[trimmedXCoordinates.length - 1]?.x ?? extents.maxX, 1);
  const topExtent = Math.max(Math.abs(trimmedYCoordinates[0]?.y ?? extents.minY), 1);
  const bottomExtent = Math.max(trimmedYCoordinates[trimmedYCoordinates.length - 1]?.y ?? extents.maxY, 1);
  const scale = Math.min(
    availableHalfWidth / leftExtent,
    availableHalfWidth / rightExtent,
    availableHalfHeight / topExtent,
    availableHalfHeight / bottomExtent,
    1.5,
  );
  const transformPoint = (point: ViewportCoordinate) => ({
    x: EVENT_LINK_FRAGMENT_WIDTH / 2 + (point.x - selectedProjectedPoint.x) * scale,
    y: EVENT_LINK_FRAGMENT_HEIGHT / 2 + (point.y - selectedProjectedPoint.y) * scale,
  });

  const nodes = [...pointIds]
    .map((pointId) => projectedPointById.get(pointId))
    .filter((point): point is InstantPoint => Boolean(point))
    .map((point) => {
      const transformedPoint = transformPoint(point);
      const placement = getEventLinkLabelPlacement(point.x - selectedProjectedPoint.x, point.y - selectedProjectedPoint.y, point.id === selectedEventPoint.id);
      return {
        id: point.id,
        label: point.id === selectedEventPoint.id ? selectedEventTitle : point.label,
        x: transformedPoint.x,
        y: transformedPoint.y,
        labelX: transformedPoint.x + placement.dx,
        labelY: transformedPoint.y + placement.dy,
        labelAnchor: placement.anchor,
        isCurrent: point.id === selectedEventPoint.id,
        opacity: point.opacity,
      } satisfies EventLinkGraphNode;
    })
    .sort((left, right) => {
      if (left.isCurrent !== right.isCurrent) {
        return left.isCurrent ? 1 : -1;
      }

      return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id);
    });

  const regions = [...regionIds]
    .map((regionId) => projectedRegionById.get(regionId))
    .filter((region): region is CompositeRegion => Boolean(region))
    .map((region) => {
      const transformedPoints = region.projectedPoints.map(transformPoint);
      const transformedLabelAttach = transformPoint({ x: region.labelAttachX, y: region.labelAttachY });
      const transformedLabelGuide = transformPoint({ x: region.labelGuideX, y: region.labelGuideY });
      const transformedLabel = transformPoint({ x: region.labelX, y: region.labelY });
      return {
        ...region,
        projectedPoints: transformedPoints,
        path: buildClosedSplinePath(transformedPoints, compositeSplineTuning),
        labelAttachX: transformedLabelAttach.x,
        labelAttachY: transformedLabelAttach.y,
        labelGuideX: transformedLabelGuide.x,
        labelGuideY: transformedLabelGuide.y,
        labelX: transformedLabel.x,
        labelY: transformedLabel.y,
        role: region.id === parentRegion?.id ? "parent" : "child",
      } satisfies EventLinkGraphRegion;
    })
    .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));

  const segments = directSegments
    .map((segment) => {
      const start = transformPoint({ x: segment.x1, y: segment.y1 });
      const end = transformPoint({ x: segment.x2, y: segment.y2 });
      const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      const relationStyle = getRelationStyle(segment.typeKey);
      const estimatedLabelWidth = relationStyle.label.length * 6 + 14;
      return {
        ...segment,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        midX: (start.x + end.x) / 2,
        midY: (start.y + end.y) / 2,
        angle: getReadableEdgeAngle((Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI),
        showLabel: relationStyle.label.length > 0 && segmentLength > estimatedLabelWidth,
      } satisfies RelationSegment;
    })
    .sort((left, right) => left.midY - right.midY || left.midX - right.midX || left.id.localeCompare(right.id));

  return {
    width: EVENT_LINK_FRAGMENT_WIDTH,
    height: EVENT_LINK_FRAGMENT_HEIGHT,
    nodes,
    regions,
    segments,
    hasContext: segments.length > 0 || regions.length > 0 || nodes.some((node) => !node.isCurrent),
  } satisfies EventLinkGraphFragment;
}

function formatEventTypeLabel(type: EventRecord["type"], locale: AppLocale) {
  switch (type) {
    case "instant":
      return locale === "ko" ? "즉시 사건" : "Instant";
    case "duration":
      return locale === "ko" ? "지속 사건" : "Duration";
    default:
      return type;
  }
}

function summarizeWorldAnchorForPanel(anchor: WorldAnchor): string {
  if (anchor.label && anchor.label.trim().length > 0) {
    return anchor.label;
  }

  const formatPoint = (point: WorldAnchor["instant"] | NonNullable<WorldAnchor["range"]>["start"]) => {
    if (!point) {
      return "";
    }

    const segments = [point.year.toString()];
    if (point.month !== undefined) {
      segments.push(String(point.month).padStart(2, "0"));
    }
    if (point.day !== undefined) {
      segments.push(String(point.day).padStart(2, "0"));
    }
    return segments.join("-");
  };

  if (anchor.range) {
    return `${formatPoint(anchor.range.start)} ~ ${formatPoint(anchor.range.end)}`;
  }

  if (anchor.instant) {
    return formatPoint(anchor.instant);
  }

  return anchor.scheme;
}

function renderMarkdownInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let cursor = 0;

  while (true) {
    const match = pattern.exec(text);
    if (!match) {
      break;
    }

    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    const [token, , linkLabel, linkHref, codeLabel, strongLabel, emphasisLabel] = match;
    const tokenKey = `${keyPrefix}:${match.index}`;

    if (linkLabel && linkHref) {
      nodes.push(
        <a href={linkHref} key={tokenKey} rel="noreferrer" target="_blank">
          {linkLabel}
        </a>,
      );
    } else if (codeLabel) {
      nodes.push(<code key={tokenKey}>{codeLabel}</code>);
    } else if (strongLabel) {
      nodes.push(<strong key={tokenKey}>{strongLabel}</strong>);
    } else if (emphasisLabel) {
      nodes.push(<em key={tokenKey}>{emphasisLabel}</em>);
    } else {
      nodes.push(token);
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function renderMarkdownDocument(markdown: string) {
  const elements: ReactNode[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraphLines: string[] = [];
  let unorderedItems: string[] = [];
  let orderedItems: string[] = [];
  let quoteLines: string[] = [];
  let codeLines: string[] = [];
  let codeFenceKey = 0;
  let inCodeBlock = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    const text = paragraphLines.join(" ");
    elements.push(
      <p key={`paragraph:${elements.length}`}>
        {renderMarkdownInline(text, `paragraph:${elements.length}`)}
      </p>,
    );
    paragraphLines = [];
  };

  const flushUnorderedItems = () => {
    if (unorderedItems.length === 0) {
      return;
    }

    const key = `ul:${elements.length}`;
    elements.push(
      <ul key={key}>
        {unorderedItems.map((item) => (
          <li key={`${key}:${item}`}>{renderMarkdownInline(item, `${key}:${item}`)}</li>
        ))}
      </ul>,
    );
    unorderedItems = [];
  };

  const flushOrderedItems = () => {
    if (orderedItems.length === 0) {
      return;
    }

    const key = `ol:${elements.length}`;
    elements.push(
      <ol key={key}>
        {orderedItems.map((item) => (
          <li key={`${key}:${item}`}>{renderMarkdownInline(item, `${key}:${item}`)}</li>
        ))}
      </ol>,
    );
    orderedItems = [];
  };

  const flushQuotes = () => {
    if (quoteLines.length === 0) {
      return;
    }

    const key = `quote:${elements.length}`;
    const text = quoteLines.join(" ");
    elements.push(
      <blockquote key={key}>
        <p>{renderMarkdownInline(text, key)}</p>
      </blockquote>,
    );
    quoteLines = [];
  };

  const flushCodeBlock = () => {
    if (codeLines.length === 0) {
      return;
    }

    const key = `code:${codeFenceKey}`;
    elements.push(
      <pre key={key}>
        <code>{codeLines.join("\n")}</code>
      </pre>,
    );
    codeLines = [];
    codeFenceKey += 1;
  };

  const flushStandardBlocks = () => {
    flushParagraph();
    flushUnorderedItems();
    flushOrderedItems();
    flushQuotes();
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        flushStandardBlocks();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    if (trimmed.length === 0) {
      flushStandardBlocks();
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      flushStandardBlocks();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2] ?? "";
      const key = `heading:${elements.length}`;
      const content = renderMarkdownInline(headingText, key);
      if (level === 1) {
        elements.push(<h1 key={key}>{content}</h1>);
      } else if (level === 2) {
        elements.push(<h2 key={key}>{content}</h2>);
      } else if (level === 3) {
        elements.push(<h3 key={key}>{content}</h3>);
      } else if (level === 4) {
        elements.push(<h4 key={key}>{content}</h4>);
      } else if (level === 5) {
        elements.push(<h5 key={key}>{content}</h5>);
      } else {
        elements.push(<h6 key={key}>{content}</h6>);
      }
      continue;
    }

    const unorderedMatch = /^[-*]\s+(.*)$/.exec(trimmed);
    if (unorderedMatch) {
      flushParagraph();
      flushOrderedItems();
      flushQuotes();
      unorderedItems.push(unorderedMatch[1] ?? "");
      continue;
    }

    const orderedMatch = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (orderedMatch) {
      flushParagraph();
      flushUnorderedItems();
      flushQuotes();
      orderedItems.push(orderedMatch[1] ?? "");
      continue;
    }

    const quoteMatch = /^>\s?(.*)$/.exec(trimmed);
    if (quoteMatch) {
      flushParagraph();
      flushUnorderedItems();
      flushOrderedItems();
      quoteLines.push(quoteMatch[1] ?? "");
      continue;
    }

    flushUnorderedItems();
    flushOrderedItems();
    flushQuotes();
    paragraphLines.push(trimmed);
  }

  flushStandardBlocks();
  if (inCodeBlock) {
    flushCodeBlock();
  }

  return elements;
}

export const X_FORCE_CONTROLS: XForceControl[] = [
  { key: "iterations", label: { ko: "정리 반복 횟수", en: "Iterations" }, description: { ko: "가로 배치를 몇 번 더 다듬을지", en: "How many cleanup passes to run." }, min: 0, max: 120, step: 1 },
  { key: "repulsion", label: { ko: "겹침 피하기", en: "Repulsion" }, description: { ko: "가까운 사건끼리 좌우로 벌어지는 정도", en: "How much nearby events push apart." }, min: 0, max: 1.2, step: 0.01 },
  { key: "causesAttraction", label: { ko: "인과 끌림", en: "Causal attraction" }, description: { ko: "CAUSES 링크가 양쪽 사건을 얼마나 강하게 당길지", en: "How strongly CAUSES edges pull linked events together." }, min: 0, max: 0.8, step: 0.01 },
  { key: "temporalAttraction", label: { ko: "시간 끌림", en: "Temporal attraction" }, description: { ko: "전후 관계가 양쪽 사건을 얼마나 당길지", en: "How strongly temporal links pull related events together." }, min: 0, max: 0.5, step: 0.01 },
  { key: "maxStep", label: { ko: "한 번에 움직이는 폭", en: "Max step" }, description: { ko: "각 반복에서 자리 바꿈이 얼마나 과감할지", en: "How far each iteration can move." }, min: 0.02, max: 1, step: 0.01 }
];

type UrdrGlobalNamespace = {
  toggleHud?: () => boolean;
  showHud?: () => boolean;
  hideHud?: () => boolean;
  isHudVisible?: () => boolean;
};

declare global {
  interface Window {
    _URDR_?: UrdrGlobalNamespace;
  }
}

function getLocalViewportPoint(event: ReactPointerEvent<HTMLDivElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();

  return {
    x: event.clientX - bounds.left - bounds.width / 2,
    y: event.clientY - bounds.top - bounds.height / 2
  };
}

export function formatXForceValue(value: number, step: number) {
  if (Number.isInteger(step)) {
    return String(Math.round(value));
  }

  const decimals = step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return value.toFixed(decimals);
}

function EventDrawerContent({
  copy,
  eventLinkGraphFragment,
  eventTab,
  eventChronologySummary,
  eventPlaceLabels,
  eventPeopleLabels,
  eventCauseLabels,
  eventResultLabels,
  loadState,
  notes,
  selectedEventTitle,
  viewportRef,
  onTabChange
}: EventDrawerContentProps) {
  const statusMessage = loadState === "error"
    ? copy.eventLoadErrorLabel
    : loadState === "loading"
      ? copy.eventLoadingLabel
      : "";
  const statusToneClassName = loadState === "error" ? styles.eventDrawerStatusError : "";
  const metadataRows = [
    { label: copy.eventTimeLabel, value: eventChronologySummary ?? copy.eventEmptyValueLabel },
    { label: copy.eventPlacesLabel, value: eventPlaceLabels.length > 0 ? eventPlaceLabels.join(", ") : copy.eventEmptyValueLabel },
    { label: copy.eventPeopleLabel, value: eventPeopleLabels.length > 0 ? eventPeopleLabels.join(", ") : copy.eventEmptyValueLabel },
    { label: copy.eventCausesLabel, value: eventCauseLabels.length > 0 ? eventCauseLabels.join(", ") : copy.eventEmptyValueLabel },
    { label: copy.eventResultsLabel, value: eventResultLabels.length > 0 ? eventResultLabels.join(", ") : copy.eventEmptyValueLabel },
  ];
  const renderedNotes = notes.trim().length > 0 ? renderMarkdownDocument(notes) : null;
  const hasEventLinks = eventLinkGraphFragment.hasContext;

  return (
    <div className={styles.eventDrawerSurface}>
      <div className={styles.eventDrawerHandleRow}>
        <div aria-hidden="true" className={styles.eventDrawerHandleTouchTarget} data-testid="event-drawer-handle">
          <span className={styles.eventDrawerHandle} />
        </div>
      </div>
      <div className={styles.eventDrawerHeader}>
        <div className={styles.eventDrawerHeaderCopy}>
          <div className={styles.eventDrawerTitle}>{selectedEventTitle}</div>
        </div>
      </div>

      <div className={styles.eventDrawerBody}>
        <div aria-label={copy.eventDrawerTabsLabel} className={styles.eventDrawerTabRow} role="tablist">
          <button
            aria-controls="event-drawer-notes-panel"
            aria-selected={eventTab === "notes"}
            className={`${styles.eventDrawerTab} ${eventTab === "notes" ? styles.eventDrawerTabActive : ""}`}
            id="event-drawer-notes-tab"
            onClick={() => onTabChange("notes")}
            role="tab"
            type="button"
          >
            <span className={styles.eventDrawerTabText}>{copy.eventNotesTabLabel}</span>
          </button>
          <button
            aria-controls="event-drawer-links-panel"
            aria-selected={eventTab === "links"}
            className={`${styles.eventDrawerTab} ${eventTab === "links" ? styles.eventDrawerTabActive : ""}`}
            id="event-drawer-links-tab"
            onClick={() => onTabChange("links")}
            role="tab"
            type="button"
          >
            <span className={styles.eventDrawerTabText}>{copy.eventLinksTabLabel}</span>
          </button>
        </div>

        <div
          className={styles.eventDrawerViewport}
          data-testid="event-drawer-viewport"
          ref={viewportRef}
        >
          {eventTab === "notes" ? (
            <div aria-labelledby="event-drawer-notes-tab" className={styles.eventDrawerPanel} id="event-drawer-notes-panel" role="tabpanel">
              {statusMessage ? <div className={`${styles.eventDrawerStatus} ${statusToneClassName}`.trim()}>{statusMessage}</div> : null}
              <section className={styles.eventDrawerNotesPanel}>
                <table className={styles.eventMetadataTable}>
                  <tbody>
                    {metadataRows.map((row) => (
                      <tr className={styles.eventMetadataRow} key={row.label}>
                        <th className={styles.eventMetadataKey} scope="row">{row.label}</th>
                        <td className={styles.eventMetadataValue}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {renderedNotes ? (
                  <div className={styles.eventMarkdown}>{renderedNotes}</div>
                ) : loadState === "ready" ? (
                  <div className={styles.eventDrawerEmptyCopy}>{copy.eventNotesEmptyLabel}</div>
                ) : null}
              </section>
            </div>
          ) : (
            <div aria-labelledby="event-drawer-links-tab" className={styles.eventDrawerPanel} id="event-drawer-links-panel" role="tabpanel">
              <section className={styles.eventLinksPanel}>
                {hasEventLinks ? (
                  <div className={styles.eventLinksGraph}>
                    <svg
                      aria-hidden="true"
                      className={styles.eventLinksGraphCanvas}
                      data-event-link-graph="true"
                      preserveAspectRatio="xMidYMid meet"
                      viewBox={`0 0 ${eventLinkGraphFragment.width} ${eventLinkGraphFragment.height}`}
                    >
                      <defs>
                        <marker id="event-link-relation-arrow-order" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3">
                          <path d="M0,0 L6,3 L0,6 Z" fill="rgba(58, 74, 104, 0.52)" />
                        </marker>
                        <marker id="event-link-relation-arrow-cause" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3">
                          <path d="M0,0 L6,3 L0,6 Z" fill="rgba(140, 58, 58, 0.78)" />
                        </marker>
                        <marker id="event-link-relation-arrow-soft" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3">
                          <path d="M0,0 L6,3 L0,6 Z" fill="rgba(48, 105, 88, 0.62)" />
                        </marker>
                      </defs>

                      {eventLinkGraphFragment.regions.map((region) => (
                        <path
                          className={`${styles.chartCompositeRegion} ${styles.eventLinksRegionPath} ${region.role === "parent" ? styles.eventLinksRegionParent : styles.eventLinksRegionChild}`}
                          d={region.path}
                          data-depth={region.depth}
                          data-event-link-region-id={region.id}
                          data-event-link-region-role={region.role}
                          key={region.id}
                          style={{
                            opacity: 0.2 * region.opacity,
                          }}
                        />
                      ))}

                      {eventLinkGraphFragment.segments.map((segment) => {
                        const relationStyle = getRelationStyle(segment.typeKey);
                        return segment.typeKey === "causes" ? (
                          <path
                            className={`${styles.chartRelationSegment} ${styles.eventLinksConnection}`}
                            d={buildCurvedRelationPath(segment.x1, segment.y1, segment.x2, segment.y2)}
                            data-event-link-connection="true"
                            data-event-link-segment-id={segment.id}
                            data-event-link-segment-type={segment.typeKey}
                            id={`event-link-${getRelationLabelPathId(segment.id)}`}
                            key={segment.id}
                            markerEnd={`url(#event-link-${relationStyle.markerId})`}
                            style={{
                              fill: "none",
                              stroke: relationStyle.stroke,
                              strokeDasharray: relationStyle.dasharray,
                              strokeWidth: relationStyle.strokeWidth,
                              opacity: segment.opacity,
                            }}
                          />
                        ) : (
                          <line
                            className={`${styles.chartRelationSegment} ${styles.eventLinksConnection}`}
                            data-event-link-connection="true"
                            data-event-link-segment-id={segment.id}
                            data-event-link-segment-type={segment.typeKey}
                            key={segment.id}
                            markerEnd={`url(#event-link-${relationStyle.markerId})`}
                            style={{
                              stroke: relationStyle.stroke,
                              strokeDasharray: relationStyle.dasharray,
                              strokeWidth: relationStyle.strokeWidth,
                              opacity: segment.opacity,
                            }}
                            x1={segment.x1}
                            x2={segment.x2}
                            y1={segment.y1}
                            y2={segment.y2}
                          />
                        );
                      })}

                      {eventLinkGraphFragment.nodes.map((node) => (
                        <g data-event-link-node="true" data-event-link-node-id={node.id} data-event-link-current={node.isCurrent ? "true" : "false"} key={node.id}>
                          <circle
                            className={`${styles.chartInstantPoint} ${node.isCurrent ? styles.eventLinksCurrentPoint : ""}`}
                            cx={node.x}
                            cy={node.y}
                            data-event-link-node-circle="true"
                            data-event-link-node-id={node.id}
                            data-event-link-current={node.isCurrent ? "true" : "false"}
                            r={node.isCurrent ? 7 : 5.5}
                            style={{ opacity: node.opacity }}
                          />
                          <text
                            className={`${styles.chartInstantPointLabel} ${styles.eventLinksPointLabel} ${node.isCurrent ? styles.eventLinksCurrentLabel : ""}`}
                            data-event-link-current-label={node.isCurrent ? "true" : "false"}
                            data-event-link-node-label-id={node.id}
                            style={{ opacity: node.opacity, textAnchor: node.labelAnchor }}
                            x={node.labelX}
                            y={node.labelY}
                          >
                            {node.label}
                          </text>
                        </g>
                      ))}

                      {eventLinkGraphFragment.regions.map((region) => (
                        region.showLabel ? (
                          <g key={`${region.id}:label-group`}>
                            <line
                              className={styles.chartCompositeRegionLabelGuide}
                              data-event-link-region-label-guide-id={region.id}
                              style={{ opacity: region.opacity }}
                              x1={region.labelAttachX}
                              x2={region.labelGuideX}
                              y1={region.labelAttachY}
                              y2={region.labelGuideY}
                            />
                            <text
                              className={`${styles.chartCompositeRegionLabel} ${styles.eventLinksRegionLabel}`}
                              data-depth={region.depth}
                              data-event-link-region-label-anchor={region.labelAnchor}
                              data-event-link-region-label-id={region.id}
                              key={`${region.id}:label`}
                              style={{ opacity: region.opacity }}
                              textAnchor={region.labelAnchor}
                              x={region.labelX}
                              y={region.labelY}
                            >
                              {region.renderedLabel}
                            </text>
                          </g>
                        ) : null
                      ))}

                      {eventLinkGraphFragment.segments.map((segment) => {
                        const relationStyle = getRelationStyle(segment.typeKey);
                        return segment.showLabel && relationStyle.label ? (
                          segment.typeKey === "causes" ? (
                            <text
                              className={`${styles.chartRelationLabel} ${styles.eventLinksRelationLabel}`}
                              data-event-link-relation-label={segment.id}
                              key={`${segment.id}:label`}
                              style={{ opacity: segment.opacity * relationStyle.labelOpacity, fontSize: relationStyle.labelFontSize, fontWeight: relationStyle.labelFontWeight }}
                            >
                              <textPath href={`#event-link-${getRelationLabelPathId(segment.id)}`} startOffset="2%">
                                {relationStyle.label}
                              </textPath>
                            </text>
                          ) : (
                            <text
                              className={`${styles.chartRelationLabel} ${styles.eventLinksRelationLabel}`}
                              data-event-link-relation-label={segment.id}
                              key={`${segment.id}:label`}
                              transform={`translate(${segment.midX} ${segment.midY}) rotate(${segment.angle})`}
                              style={{ opacity: segment.opacity * relationStyle.labelOpacity, fontSize: relationStyle.labelFontSize, fontWeight: relationStyle.labelFontWeight }}
                              x={0}
                              y={-4}
                            >
                              {relationStyle.label}
                            </text>
                          )
                        ) : null;
                      })}
                    </svg>
                  </div>
                ) : (
                  <div className={styles.eventDrawerEmptyState}>{copy.eventLinksEmptyLabel}</div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>

      {eventTab === "links" && statusMessage ? <div className={`${styles.eventDrawerStatus} ${statusToneClassName}`.trim()}>{statusMessage}</div> : null}
    </div>
  );
}

export function GraphShell({
  initialWorkspace,
  initialChartPlane,
  loader = graphReadLoader,
  locale,
  compositeHullMode,
  compositeSplineTuning,
}: GraphShellProps) {
  const copy = GRAPH_SHELL_COPY[locale];
  const workspace = initialWorkspace;
  const usesLoadingWorkspace = initialWorkspace.buildRevision === GRAPH_SHELL_LOADING_WORKSPACE_BUILD_REVISION;
  const defaultShellSlice = useMemo(() => createDefaultShellSlice(workspace), [workspace]);
  const [hasHydratedRestorableState, setHasHydratedRestorableState] = useState(false);
  const [selectedTimelineId, setSelectedTimelineId] = useState(defaultShellSlice.selectedTimelineId);
  const [enabledCanonIds, setEnabledCanonIds] = useState<ReadonlySet<string>>(() => new Set(defaultShellSlice.enabledCanonIds));
  const [imageViewportState, setImageViewportState] = useState(() => createImageViewportState());
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [visibleCompositeRegions, setVisibleCompositeRegions] = useState<CompositeFadePresence<CompositeRegion>[]>([]);
  const [visibleCompositeColorAssignments, setVisibleCompositeColorAssignments] = useState<CompositeColorAssignment[]>([]);
  const [selectedEventSelection, setSelectedEventSelection] = useState<EventDrawerSelection | null>(null);
  const [renderedEventSelection, setRenderedEventSelection] = useState<EventDrawerSelection | null>(null);
  const [isEventDrawerOpen, setIsEventDrawerOpen] = useState(false);
  const [eventDrawerStage, setEventDrawerStage] = useState<EventDrawerStage>("peek");
  const [isEventDrawerDragging, setIsEventDrawerDragging] = useState(false);
  const [selectedEventRecord, setSelectedEventRecord] = useState<EventDetailResponse | null>(null);
  const [selectedEventTab, setSelectedEventTab] = useState<EventDrawerTab>("notes");
  const [selectedEventLoadState, setSelectedEventLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [runtimeViewportResponse, setRuntimeViewportResponse] = useState<ReturnType<typeof graphShellViewportResponseSchema.parse> | null>(null);
  const [runtimeViewportLoadState, setRuntimeViewportLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [runtimeViewportErrorMessage, setRuntimeViewportErrorMessage] = useState<string | null>(null);

  const chartViewportRef = useRef<HTMLDivElement | null>(null);
  const eventDrawerRef = useRef<HTMLElement | null>(null);
  const eventDrawerViewportRef = useRef<HTMLDivElement | null>(null);
  const eventSelectionNonceRef = useRef(0);
  const lastViewportCenterYRef = useRef<number | null>(null);
  const pendingRestoredDrawerStageRef = useRef<EventDrawerStage | null>(null);
  const selectedEventSelectionRef = useRef<EventDrawerSelection | null>(null);
  const pendingEventTapRef = useRef<PendingEventTap | null>(null);
  const eventDrawerDragRef = useRef<EventDrawerDragState | null>(null);
  const bootstrapChartPlane = initialChartPlane ?? null;

  const applyResolvedGraphShellState = useCallback((nextState: ReturnType<typeof resolveGraphShellRestorableState>) => {
    setSelectedTimelineId(nextState.shell.selectedTimelineId);
    setEnabledCanonIds(new Set(nextState.shell.enabledCanonIds));
    setImageViewportState((current) => {
      const nextView = createImageViewportViewFromRestorableSlice(nextState.viewport, viewportSize);
      return nextView ? resetViewportView(current, nextView) : resetViewportView(current);
    });
    if (nextState.drawer) {
      pendingRestoredDrawerStageRef.current = nextState.drawer.stage;
      eventSelectionNonceRef.current += 1;
      setSelectedEventTab("notes");
      setSelectedEventSelection({
        eventId: nextState.drawer.eventId,
        label: resolveBootstrapEventLabel(bootstrapChartPlane, nextState.drawer.eventId),
        requestKey: eventSelectionNonceRef.current,
      });
      return;
    }

    pendingRestoredDrawerStageRef.current = null;
    setSelectedEventSelection(null);
  }, [bootstrapChartPlane, viewportSize]);

  const hydrateRestorableState = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const { hadInvalidState, state: parsedLocalState } = readPersistedGraphShellLocalState(viewportSize);
    if (hadInvalidState) {
      clearPersistedGraphShellState();
    }

    const localState: GraphShellRestorableState | null = parsedLocalState
      ? {
          ...parsedLocalState,
          shell: validateShellSliceForWorkspace(parsedLocalState.shell, workspace),
        }
      : null;
    const parsedUrlState = parseGraphShellUrlState(window.location.search);
    const urlState: GraphShellRestorableState = {
      ...parsedUrlState,
      shell: validateShellSliceForWorkspace(parsedUrlState.shell, workspace),
    };

    applyResolvedGraphShellState(resolveGraphShellRestorableState({
      defaultState: { shell: defaultShellSlice },
      localState,
      urlState,
    }));
    setHasHydratedRestorableState(true);
  }, [applyResolvedGraphShellState, defaultShellSlice, viewportSize, workspace]);

  useEffect(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }

    if (usesLoadingWorkspace) {
      setHasHydratedRestorableState(false);
      return;
    }

    hydrateRestorableState();
  }, [hydrateRestorableState, usesLoadingWorkspace, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (typeof window === "undefined" || usesLoadingWorkspace || viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }

    const handlePopState = () => {
      hydrateRestorableState();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [hydrateRestorableState, usesLoadingWorkspace, viewportSize.height, viewportSize.width]);

  const selectedTimeline = workspace.tabs.find((tab) => tab.id === selectedTimelineId) ?? workspace.tabs[0] ?? null;
  const selectedTimelineCanonIds = selectedTimeline?.availableCanonIds ?? [];
  const effectiveEnabledCanonIds = useMemo(() => {
    const timelineSet = new Set(selectedTimelineCanonIds);
    const intersected = new Set([...enabledCanonIds].filter((id) => timelineSet.has(id)));
    if (intersected.size > 0) {
      return intersected;
    }
    const fallbackId = selectedTimelineCanonIds[0] ?? workspace.canons[0]?.id;
    return fallbackId ? new Set([fallbackId]) : new Set<string>();
  }, [enabledCanonIds, selectedTimelineCanonIds, workspace.canons]);
  // enabledCanonIds are intersected with timeline-available canons via effectiveEnabledCanonIds memo above.

  const bootstrapVisibleChartPlaneEntities = useMemo(() => {
    if (!bootstrapChartPlane) {
      return [] as GraphShellChartPlaneEntity[];
    }

    if (effectiveEnabledCanonIds.size === 0) {
      return bootstrapChartPlane.entities;
    }

    return bootstrapChartPlane.entities.filter((entity) => effectiveEnabledCanonIds.has(entity.canonId));
  }, [bootstrapChartPlane, effectiveEnabledCanonIds]);

  const { view, activePointers } = imageViewportState;
  void activePointers;

  useEffect(() => {
    if (!usesLoadingWorkspace && !hasHydratedRestorableState) {
      return;
    }

    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }

    const canonIds = [...effectiveEnabledCanonIds];
    if (canonIds.length === 0) {
      setRuntimeViewportResponse(null);
      return;
    }

    const abortController = new AbortController();
    let active = true;
    const bounds = expandWorldBoundsForViewportRequest(getVisibleWorldBounds(view, viewportSize));
    const params = new URLSearchParams({
      canonIds: canonIds.join(","),
      bbox: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join(","),
      scale: String(view.scaleX),
      viewportWidth: String(viewportSize.width),
      viewportHeight: String(viewportSize.height),
      includeNeighbors: selectedEventSelection ? "true" : "false",
    });
    if (selectedEventSelection) {
      params.set("selectedEntityId", selectedEventSelection.eventId);
    }

    const loadViewport = async () => {
      setRuntimeViewportLoadState("loading");
      setRuntimeViewportErrorMessage(null);
      try {
        const baseQuery = {
          canonIds,
          bbox: bounds,
          scale: view.scaleX,
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          currentTimeLevel: GRAPH_SHELL_DEFAULT_TIME_LEVEL,
          includeNeighbors: selectedEventSelection ? true : false,
          ...(selectedEventSelection ? { selectedEntityId: selectedEventSelection.eventId } : {}),
        } as const;
        const coreResponse = parseViewportResponse(await loader.loadViewport(locale, {
          ...baseQuery,
          artifactClasses: [...GRAPH_SHELL_CORE_ARTIFACT_CLASSES],
        }));
        if (active) {
          setRuntimeViewportResponse(coreResponse);
          setRuntimeViewportLoadState("ready");
        }

        const fullResponse = parseViewportResponse(await loader.loadViewport(locale, {
          ...baseQuery,
          artifactClasses: [...GRAPH_SHELL_FULL_ARTIFACT_CLASSES],
        }));
        if (active) {
          setRuntimeViewportResponse(fullResponse);
        }

        const currentCenterY = (bounds.minY + bounds.maxY) / 2;
        const lastCenterY = lastViewportCenterYRef.current;
        lastViewportCenterYRef.current = currentCenterY;
        if (lastCenterY !== null) {
          const deltaY = currentCenterY - lastCenterY;
          if (Math.abs(deltaY) > 0.001) {
            const viewportHeight = bounds.maxY - bounds.minY;
            const direction = deltaY > 0 ? 1 : -1;
            const prefetchBounds = {
              minX: bounds.minX,
              maxX: bounds.maxX,
              minY: bounds.minY + viewportHeight * direction,
              maxY: bounds.maxY + viewportHeight * direction,
            };
            void loader.loadViewport(locale, {
              ...baseQuery,
              bbox: prefetchBounds,
              artifactClasses: [...GRAPH_SHELL_FULL_ARTIFACT_CLASSES],
            }).catch(() => undefined);
          }
        }
      } catch (error) {
        if (!active || abortController.signal.aborted) {
          return;
        }
        setRuntimeViewportResponse(null);
        setRuntimeViewportLoadState("error");
        setRuntimeViewportErrorMessage(
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : locale === "ko"
              ? "뷰포트 데이터를 불러오지 못했습니다."
              : "Unable to load viewport data.",
        );
      }
    };

    const isGestureActive = Object.keys(activePointers).length > 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (isGestureActive) {
      timeoutId = setTimeout(() => {
        void loadViewport();
      }, VIEWPORT_FETCH_GESTURE_SETTLE_MS);
    } else {
      void loadViewport();
    }

    return () => {
      active = false;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      abortController.abort();
    };
  }, [activePointers, effectiveEnabledCanonIds, hasHydratedRestorableState, loader, locale, selectedEventSelection, usesLoadingWorkspace, view, viewportSize]);

  const runtimeLinearEntities = useMemo(() => {
    if (!runtimeViewportResponse) {
      return [] as GraphShellChartPlaneEntity[];
    }
    return [...runtimeViewportResponse.entities, ...runtimeViewportResponse.edges];
  }, [runtimeViewportResponse]);

  const runtimeRegionEntities = useMemo(() => {
    if (!runtimeViewportResponse) {
      return [] as GraphShellChartPlaneEntity[];
    }
    return runtimeViewportResponse.regions;
  }, [runtimeViewportResponse]);

  const visibleChartPlaneEntities = useMemo(() => {
    if (runtimeViewportLoadState === "ready" && runtimeViewportResponse) {
      return [...runtimeLinearEntities, ...runtimeRegionEntities];
    }

    if (runtimeViewportLoadState === "loading" || runtimeViewportLoadState === "error") {
      return [] as GraphShellChartPlaneEntity[];
    }

    if (runtimeViewportResponse === null) {
      return bootstrapVisibleChartPlaneEntities;
    }

    return [...runtimeLinearEntities, ...runtimeRegionEntities];
  }, [bootstrapVisibleChartPlaneEntities, runtimeLinearEntities, runtimeRegionEntities, runtimeViewportLoadState, runtimeViewportResponse]);

  useEffect(() => {
    if (usesLoadingWorkspace || !hasHydratedRestorableState) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const nextViewportSlice = createGraphShellViewportSliceFromView(view, viewportSize);
    if (!nextViewportSlice) {
      return;
    }

    if (pendingRestoredDrawerStageRef.current && !renderedEventSelection) {
      return;
    }

    const persistedDrawerStage = selectedEventSelection
      ? pendingRestoredDrawerStageRef.current ?? eventDrawerStage
      : null;

    const nextRestorableState: GraphShellRestorableState = {
      shell: {
        selectedTimelineId,
        enabledCanonIds: [...effectiveEnabledCanonIds],
      },
      viewport: nextViewportSlice,
      ...(selectedEventSelection && persistedDrawerStage
        ? {
            drawer: {
              eventId: selectedEventSelection.eventId,
              stage: persistedDrawerStage,
            },
          }
        : {}),
    };

    const gestureActive = Object.keys(activePointers).length > 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const writeRestorableState = () => {
      window.localStorage.setItem(
        GRAPH_SHELL_LOCAL_STATE_KEY,
        JSON.stringify(serializeGraphShellLocalState(nextRestorableState)),
      );
      const nextSearch = buildGraphShellUrlSearch(window.location.search, nextRestorableState);
      if (nextSearch !== window.location.search) {
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${nextSearch}${window.location.hash}`,
        );
      }
    };

    if (gestureActive) {
      timeoutId = setTimeout(() => {
        writeRestorableState();
      }, VIEWPORT_PERSIST_SETTLE_MS);
    } else {
      writeRestorableState();
    }

    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    activePointers,
    effectiveEnabledCanonIds,
    eventDrawerStage,
    hasHydratedRestorableState,
    renderedEventSelection,
    selectedEventSelection,
    selectedTimelineId,
    usesLoadingWorkspace,
    view,
    viewportSize,
  ]);

  useEffect(() => {
    const node = chartViewportRef.current;
    if (!node) {
      return;
    }

    const updateSize = () => {
      const bounds = node.getBoundingClientRect();
      setViewportSize({ width: bounds.width, height: bounds.height });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const chartPlane = useMemo(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return null;
    }

    return createChartPlaneSnapshot(view, viewportSize, []);
  }, [view, viewportSize]);

  const chartAnchors = useMemo(() => {
    if (!workspace.chronologyBoard || viewportSize.width <= 0 || viewportSize.height <= 0) {
      return [] as AnchorLine[];
    }

    const centerYear = (workspace.chronologyBoard.axis.startYear + workspace.chronologyBoard.axis.endYear) / 2;
    const anchorStep = pickGregorianAxisStep(view.scaleY);

    return visibleChartPlaneEntities
      .filter(
        (entity) =>
          entity.geometryKind === "point" &&
          (entity.id.startsWith("t_") || entity.label.toLowerCase().includes("anchor"))
      )
      .filter((entity): entity is Extract<GraphShellChartPlaneEntity, { geometryKind: "point" }> => entity.geometryKind === "point")
      .map((entity) => ({
        id: entity.id,
        label: formatAnchorLabel(worldYToGregorianDate(centerYear, entity.position.y), anchorStep),
        y: viewportSize.height / 2 + view.y + entity.position.y * view.scaleY
      }))
      .filter((anchor) => anchor.y >= -24 && anchor.y <= viewportSize.height + 24)
      .sort((left, right) => left.y - right.y);
  }, [visibleChartPlaneEntities, workspace.chronologyBoard, viewportSize.height, viewportSize.width, view.y, view.scaleY]);

  const chartRelationSegments = useMemo(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return [] as RelationSegment[];
    }

    return visibleChartPlaneEntities
      .filter((entity) => entity.geometryKind === "segment")
      .map((entity) => {
        const normalized = normalizeRelationGeometry(
          entity.contains,
          viewportSize.width / 2 + view.x + entity.start.x * view.scaleX,
          viewportSize.height / 2 + view.y + entity.start.y * view.scaleY,
          viewportSize.width / 2 + view.x + entity.end.x * view.scaleX,
          viewportSize.height / 2 + view.y + entity.end.y * view.scaleY
        );
        const projected = shortenLineEnd(normalized.x1, normalized.y1, normalized.x2, normalized.y2, EDGE_POINT_BACKOFF);
        const typeKey = entity.label.trim().toLowerCase();
        const relationStyle = getRelationStyle(typeKey);
        const segmentLength = Math.hypot(projected.x2 - projected.x1, projected.y2 - projected.y1);
        const angle = getReadableEdgeAngle((Math.atan2(projected.y2 - projected.y1, projected.x2 - projected.x1) * 180) / Math.PI);
        const estimatedLabelWidth = relationStyle.label.length * 6 + 14;

        return {
          id: entity.id,
          typeKey,
          label: entity.label,
          endpointIds: entity.contains,
          x1: projected.x1,
          y1: projected.y1,
          x2: projected.x2,
          y2: projected.y2,
          midX: (projected.x1 + projected.x2) / 2,
          midY: (projected.y1 + projected.y2) / 2,
          angle,
          showLabel: relationStyle.label.length > 0 && segmentLength > estimatedLabelWidth,
          opacity: 1
        } satisfies RelationSegment;
      })
      .filter(
        (segment) =>
          Math.max(segment.x1, segment.x2) >= -24 &&
          Math.min(segment.x1, segment.x2) <= viewportSize.width + 24 &&
          Math.max(segment.y1, segment.y2) >= -24 &&
          Math.min(segment.y1, segment.y2) <= viewportSize.height + 24
      );
  }, [visibleChartPlaneEntities, viewportSize.height, viewportSize.width, view.x, view.y, view.scaleX, view.scaleY]);

  const allWorldInstantPoints = useMemo(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return [] as WorldInstantPoint[];
    }

    return visibleChartPlaneEntities
      .filter(
        (entity) =>
          entity.geometryKind === "point" &&
          !entity.id.startsWith("t_") &&
          !entity.label.toLowerCase().includes("anchor")
      )
      .filter((entity): entity is Extract<GraphShellChartPlaneEntity, { geometryKind: "point" }> => entity.geometryKind === "point")
      .map((entity) => ({
        id: entity.id,
        eventId: entity.eventId,
        canonId: entity.canonId,
        label: entity.label,
        containedBy: entity.containedBy,
        editorial: entity.editorial,
        x: entity.position.x,
        y: entity.position.y,
      }))
      .sort((left, right) => left.y - right.y || left.x - right.x);
  }, [visibleChartPlaneEntities, viewportSize.height, viewportSize.width]);

  const allProjectedInstantPoints = useMemo(() => {
    return allWorldInstantPoints
      .map((point) => {
        const projected = projectWorldPoint(view, viewportSize, { x: point.x, y: point.y });
        return {
          ...point,
          x: projected.x,
          y: projected.y,
          opacity: 1,
        } satisfies InstantPoint;
      })
      .sort((left, right) => left.y - right.y || left.x - right.x);
  }, [allWorldInstantPoints, view, viewportSize]);

  const worldCompositeRegions = useMemo(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return [] as WorldCompositeRegion[];
    }

    const visibleWorldBounds = getVisibleWorldBounds(view, viewportSize);
    const seedVisibleInstantIds = new Set(
      allProjectedInstantPoints
        .filter((point) => point.x >= -16 && point.x <= viewportSize.width + 16 && point.y >= -16 && point.y <= viewportSize.height + 16)
        .map((point) => point.id)
    );
    const allWorldInstantPointById = new Map(allWorldInstantPoints.map((point) => [point.id, point]));
    const regionById = new Map(
      visibleChartPlaneEntities
        .filter((entity): entity is Extract<GraphShellChartPlaneEntity, { geometryKind: "region" }> => entity.geometryKind === "region")
        .map((entity) => [entity.id, entity])
    );
    const parentRegionIdsByChildId = new Map<string, Set<string>>();
    for (const region of regionById.values()) {
      for (const childId of region.contains) {
        const parents = parentRegionIdsByChildId.get(childId) ?? new Set<string>();
        parents.add(region.id);
        parentRegionIdsByChildId.set(childId, parents);
      }
    }

    const seedRegionIds = new Set(
      [...regionById.values()]
        .filter(
          (entity) =>
            entity.contains.some((childId) => seedVisibleInstantIds.has(childId)) ||
            worldBoundsIntersect(entity.worldBounds, visibleWorldBounds)
        )
        .map((entity) => entity.id)
    );
    const recursiveRegionIds = collectRecursiveRegionClosure(seedRegionIds, regionById, parentRegionIdsByChildId);
    const selectedRegionEntities = [...recursiveRegionIds]
      .map((regionId) => regionById.get(regionId))
      .filter((entity): entity is Extract<GraphShellChartPlaneEntity, { geometryKind: "region" }> => Boolean(entity));
    const regionDepthById = new Map<string, number>();
    for (const entity of selectedRegionEntities) {
      regionDepthById.set(entity.id, computeRegionDepth(entity.id, regionById, regionDepthById, new Set<string>()));
    }

    const regionGeometryById = new Map<string, CompositeHullGeometry>();
    const rawRegions = selectedRegionEntities
      .sort(
        (left, right) =>
          (regionDepthById.get(left.id) ?? 0) - (regionDepthById.get(right.id) ?? 0) || left.id.localeCompare(right.id)
      )
      .map((entity) => {
        const directSupportPoints: ViewportCoordinate[] = [];
        const childRegionPolygons: ViewportCoordinate[][] = [];

        for (const childId of entity.contains) {
          if (allWorldInstantPointById.has(childId)) {
            const point = allWorldInstantPointById.get(childId);
            if (point) {
              directSupportPoints.push({ x: point.x, y: point.y });
            }
            continue;
          }

          const childRegionGeometry = regionGeometryById.get(childId);
          if (childRegionGeometry) {
            childRegionPolygons.push(childRegionGeometry.points);
          }
        }

        const fallbackBoundsPolygon =
          directSupportPoints.length === 0 && childRegionPolygons.length === 0
            ? worldBoundsToPolygon(entity.worldBounds)
            : [];
        const hullSupportPoints = directSupportPoints.length > 0 ? directSupportPoints : fallbackBoundsPolygon;

        const hullPoints = buildCompositeHull(
          {
            instantPoints: hullSupportPoints,
            childPolygons: childRegionPolygons,
          },
          compositeHullMode,
        );
        const geometry = {
          points: hullPoints,
        } satisfies CompositeHullGeometry;
        regionGeometryById.set(entity.id, geometry);

        return {
          id: entity.id,
          label: entity.label,
          depth: (regionDepthById.get(entity.id) ?? 0) + 1,
          contains: entity.contains,
          containedBy: entity.containedBy,
          editorial: entity.editorial,
          points: geometry.points,
        } satisfies WorldCompositeRegion;
      })
      .filter((region) => region !== null)
      .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id)) as WorldCompositeRegion[];

    return rawRegions;
  }, [allProjectedInstantPoints, allWorldInstantPoints, compositeHullMode, view, viewportSize, visibleChartPlaneEntities]);

  const chartCompositeRegions = useMemo(() => {
    const zoomBucket = getEditorialZoomBucket(view.scaleY);
    const projectedRawRegions = worldCompositeRegions.map((region) => {
      const projectedHullPoints = region.points.map((point) => projectWorldPoint(view, viewportSize, point));
      const projectedPoints = expandPolygon(projectedHullPoints, getCompositeRegionPadding(region.depth));
      const renderedLabel = formatCompositeDisplayLabel({ label: region.label }, zoomBucket, region.editorial);
      const placement = resolveCompositeEdgeLabelPlacement(
        projectedPoints,
        Math.max(renderedLabel.length * COMPOSITE_LABEL_CHAR_WIDTH, 72),
        COMPOSITE_LABEL_LINE_HEIGHT,
        viewportSize,
        COMPOSITE_LABEL_GUIDE_LENGTH,
        COMPOSITE_LABEL_GAP,
        allProjectedInstantPoints.map((point) => ({ x: point.x, y: point.y })),
      );
      return {
        id: region.id,
        label: region.label,
        renderedLabel,
        path: buildClosedSplinePath(projectedPoints, compositeSplineTuning),
        labelPath: buildOpenSplinePath(placement.pathPoints, DEFAULT_COMPOSITE_LABEL_PATH_SPLINE_TUNING),
        projectedPoints,
        labelAttachX: placement.attachX,
        labelAttachY: placement.attachY,
        labelGuideX: placement.guideX,
        labelGuideY: placement.guideY,
        labelX: placement.labelX,
        labelY: placement.labelY,
        labelAnchor: placement.labelAnchor,
        labelAngle: placement.labelAngle,
        textPathStartOffset: placement.textPathStartOffset,
        depth: region.depth,
        contains: region.contains,
        containedBy: region.containedBy,
        editorial: region.editorial,
        showLabel: true,
        opacity: 1,
        surfaceOpacity: getCompositeSurfaceOpacityScale(projectedPoints, viewportSize),
      } satisfies CompositeRegion;
    });

    const regionById = new Map(projectedRawRegions.map((region) => [region.id, region]));
    const descendantOpacityById = new Map<string, number>();
    for (const region of projectedRawRegions) {
      const opacity = getCompositeChildrenOpacity(region.projectedPoints);
      if (opacity >= 0.999) {
        continue;
      }

      const descendantIds = collectRegionDescendantIds(region.id, regionById as unknown as Map<string, GraphShellChartPlaneRegionEntity>, new Set<string>());
      for (const descendantId of descendantIds) {
        descendantOpacityById.set(descendantId, Math.min(descendantOpacityById.get(descendantId) ?? 1, opacity));
      }
    }

    const labelPolicyById = new Map(
      applyCompositeLabelVisibilityPolicy(
        projectedRawRegions.map((region) => ({
          id: region.id,
          label: region.label,
          depth: region.depth,
          footprint: getPolygonFootprint(region.projectedPoints),
          opacity: descendantOpacityById.get(region.id) ?? 1,
          labelX: region.labelX,
          labelY: region.labelY,
          labelAnchor: region.labelAnchor,
          labelAngle: region.labelAngle,
          editorial: region.editorial,
        })),
        zoomBucket,
      ).map((entry) => [entry.id, entry] as const),
    );

    const regions = projectedRawRegions
      .map((region) => {
        const policy = labelPolicyById.get(region.id);
        return {
          ...region,
          renderedLabel: policy?.renderedLabel ?? region.renderedLabel,
          showLabel: policy?.showLabel ?? true,
          opacity: descendantOpacityById.get(region.id) ?? 1,
          surfaceOpacity: region.surfaceOpacity,
        } satisfies CompositeRegion;
      })
      .sort((left, right) => left.labelAttachY - right.labelAttachY || left.labelAttachX - right.labelAttachX || left.id.localeCompare(right.id));

    const activeColorRegionIds = projectedRawRegions
      .filter((region) => regionIntersectsViewport(region.projectedPoints, viewportSize))
      .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id))
      .map((region) => region.id);

    return { regions, activeColorRegionIds, descendantOpacityById } satisfies CompositeRenderState;
  }, [allProjectedInstantPoints, compositeSplineTuning, view, viewportSize, worldCompositeRegions]);

  const farZoomElisionState = useMemo(() => {
    const zoomBucket = getEditorialZoomBucket(view.scaleY);
    if (zoomBucket !== "far") {
      return {
        hiddenPointIds: new Set<string>(),
      };
    }

    const visibleRegionIds = new Set(chartCompositeRegions.regions.map((region) => region.id));
    const selectedEventId = renderedEventSelection?.eventId ?? selectedEventSelection?.eventId ?? null;
    const allEntityIds = new Set(visibleChartPlaneEntities.map((entity) => entity.id));

    const pointById = new Map(allProjectedInstantPoints.map((point) => [point.id, point]));
    const hiddenPointIds = new Set(
      allProjectedInstantPoints
        .filter((point) => point.x >= -16 && point.x <= viewportSize.width + 16 && point.y >= -16 && point.y <= viewportSize.height + 16)
        .filter((point) => point.containedBy && visibleRegionIds.has(point.containedBy))
        .filter((point) =>
          shouldElidePointForFarZoom({
            id: point.id,
            containedBy: point.containedBy,
            editorial: point.editorial,
            diagnostics: [],
            isSelected: point.eventId === selectedEventId,
            hasWarningRisk:
              visibleChartPlaneEntities.some((entity) => entity.id === point.id && entity.diagnostics.length > 0) ||
              point.containedBy === undefined ||
              !allEntityIds.has(point.id),
          }),
        )
        .map((point) => point.id),
    );

    for (const segment of chartRelationSegments) {
      const hiddenEndpoints = segment.endpointIds.filter((endpointId) => hiddenPointIds.has(endpointId));
      if (hiddenEndpoints.length !== segment.endpointIds.length || hiddenEndpoints.length === 0) {
        continue;
      }

      const endpointToKeep = [...hiddenEndpoints]
        .map((endpointId) => pointById.get(endpointId))
        .filter((point): point is NonNullable<typeof pointById extends Map<string, infer T> ? T : never> => Boolean(point))
        .sort((left, right) => {
          const leftIsSelected = left.eventId === selectedEventId;
          const rightIsSelected = right.eventId === selectedEventId;
          if (leftIsSelected !== rightIsSelected) {
            return leftIsSelected ? -1 : 1;
          }
          return getEditorialPointPriority(right.editorial) - getEditorialPointPriority(left.editorial);
        })[0];

      if (endpointToKeep) {
        hiddenPointIds.delete(endpointToKeep.id);
      }
    }

    for (const segment of chartRelationSegments) {
      const hiddenEndpoints = segment.endpointIds.filter((endpointId) => hiddenPointIds.has(endpointId));
      if (hiddenEndpoints.length !== 1) {
        continue;
      }

      const hiddenPoint = pointById.get(hiddenEndpoints[0]!);
      const visiblePoint = pointById.get(segment.endpointIds.find((endpointId) => !hiddenPointIds.has(endpointId)) ?? "");
      if (!hiddenPoint || !visiblePoint || hiddenPoint.containedBy !== visiblePoint.containedBy) {
        if (hiddenPoint) {
          hiddenPointIds.delete(hiddenPoint.id);
        }
      }
    }

    return { hiddenPointIds };
  }, [allProjectedInstantPoints, chartCompositeRegions.regions, chartRelationSegments, renderedEventSelection, selectedEventSelection, view.scaleY, viewportSize.height, viewportSize.width, visibleChartPlaneEntities]);

  const chartInstantPoints = useMemo(() => {
    const visiblePoints = allProjectedInstantPoints
      .filter((point) => point.x >= -16 && point.x <= viewportSize.width + 16 && point.y >= -16 && point.y <= viewportSize.height + 16)
      .filter((point) => !farZoomElisionState.hiddenPointIds.has(point.id))
      .map((point) => ({
        ...point,
        opacity: chartCompositeRegions.descendantOpacityById.get(point.id) ?? 1
      }))
      .sort((left, right) => left.y - right.y || left.x - right.x);
    const labelPolicy = applyEditorialPointLabelPolicy(visiblePoints, getEditorialZoomBucket(view.scaleY));
    const policyById = new Map(labelPolicy.map((entry) => [entry.id, entry] as const));

    return visiblePoints.map((point) => {
      const policy = policyById.get(point.id);
      return {
        ...point,
        renderedLabel: policy?.renderedLabel ?? point.label,
        showLabel: policy?.showLabel ?? true,
      };
    });
  }, [allProjectedInstantPoints, chartCompositeRegions.descendantOpacityById, farZoomElisionState.hiddenPointIds, viewportSize.height, viewportSize.width, view.scaleY]);

  useEffect(() => {
    selectedEventSelectionRef.current = renderedEventSelection;
  }, [renderedEventSelection]);

  useEffect(() => {
    let openTimeoutId: number | undefined;

    if (!selectedEventSelection) {
      setIsEventDrawerOpen(false);
      return;
    }

    setRenderedEventSelection(selectedEventSelection);
    openTimeoutId = window.setTimeout(() => {
      setIsEventDrawerOpen(true);
    }, EVENT_DRAWER_ENTER_DELAY_MS);

    return () => {
      if (openTimeoutId !== undefined) {
        window.clearTimeout(openTimeoutId);
      }
    };
  }, [selectedEventSelection]);

  useEffect(() => {
    if (selectedEventSelection || !renderedEventSelection || isEventDrawerOpen) {
      return;
    }

    const closeTimeoutId = window.setTimeout(() => {
      setRenderedEventSelection(null);
    }, EVENT_DRAWER_EXIT_DURATION_MS);

    return () => {
      window.clearTimeout(closeTimeoutId);
    };
  }, [isEventDrawerOpen, renderedEventSelection, selectedEventSelection]);

  useEffect(() => {
    if (!renderedEventSelection) {
      if (selectedEventSelection || pendingRestoredDrawerStageRef.current) {
        return;
      }
      pendingRestoredDrawerStageRef.current = null;
      setEventDrawerStage("peek");
      setIsEventDrawerDragging(false);
      if (eventDrawerRef.current) {
        eventDrawerRef.current.style.setProperty("--event-drawer-drag-offset", "0px");
      }
      eventDrawerDragRef.current = null;
      return;
    }

    setEventDrawerStage(pendingRestoredDrawerStageRef.current ?? "peek");
    setIsEventDrawerDragging(false);
    if (eventDrawerRef.current) {
      eventDrawerRef.current.style.setProperty("--event-drawer-drag-offset", "0px");
    }
    eventDrawerDragRef.current = null;
    if (eventDrawerViewportRef.current) {
      eventDrawerViewportRef.current.scrollTop = 0;
    }
  }, [renderedEventSelection, selectedEventSelection]);

  useEffect(() => {
    if (!renderedEventSelection || !pendingRestoredDrawerStageRef.current) {
      return;
    }

    if (eventDrawerStage === pendingRestoredDrawerStageRef.current) {
      pendingRestoredDrawerStageRef.current = null;
    }
  }, [eventDrawerStage, renderedEventSelection]);

  useEffect(() => {
    if (!renderedEventSelection) {
      setSelectedEventRecord(null);
      setSelectedEventTab("notes");
      setSelectedEventLoadState("idle");
      return;
    }

    const abortController = new AbortController();
    const selectedEventId = renderedEventSelection.eventId;

    setSelectedEventRecord(null);
    setSelectedEventTab("notes");
    setSelectedEventLoadState("loading");

      void loader.loadEventDetail(locale, selectedEventId)
      .then((eventRecord) => parseEventResponse(eventRecord))
      .then((eventRecord) => {
        if (selectedEventSelectionRef.current?.requestKey !== renderedEventSelection.requestKey) {
          return;
        }

        setSelectedEventRecord(eventRecord);
        setSelectedEventLoadState("ready");
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("[graph-shell:event-load:error]", error);
        if (selectedEventSelectionRef.current?.requestKey !== renderedEventSelection.requestKey) {
          return;
        }

        setSelectedEventLoadState("error");
      });

    return () => abortController.abort();
  }, [loader, locale, renderedEventSelection]);

  useEffect(() => {
    setVisibleCompositeRegions((current) => reconcileCompositeFadePresence(current, chartCompositeRegions.regions));

    const animationFrameId = window.requestAnimationFrame(() => {
      setVisibleCompositeRegions((current) => advanceCompositeFadePresence(current));
    });

    const pruneTimeoutId = window.setTimeout(() => {
      setVisibleCompositeRegions((current) => pruneExitedCompositeFadePresence(current));
    }, COMPOSITE_FADE_DURATION_MS);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(pruneTimeoutId);
    };
  }, [chartCompositeRegions.regions]);

  useEffect(() => {
    setVisibleCompositeColorAssignments((current) =>
      reconcileCompositeColorAssignments(
        current,
        chartCompositeRegions.activeColorRegionIds,
        visibleCompositeRegions.map((region) => region.id),
      ),
    );
  }, [chartCompositeRegions.activeColorRegionIds, visibleCompositeRegions]);

  const visibleRelationSegments = useMemo<RelationSegment[]>(
    () => {
      const visiblePointById = new Map(chartInstantPoints.map((point) => [point.id, point]));
      const regionById = new Map(chartCompositeRegions.regions.map((region) => [region.id, region]));

      return chartRelationSegments.flatMap((segment) => {
        const visibleEndpointIds = segment.endpointIds.filter((endpointId) => visiblePointById.has(endpointId));
        const hiddenEndpointIds = segment.endpointIds.filter((endpointId) => farZoomElisionState.hiddenPointIds.has(endpointId));

        if (hiddenEndpointIds.length === 0) {
          return [{
            ...segment,
            opacity: segment.endpointIds.reduce(
              (current, endpointId) => Math.min(current, chartCompositeRegions.descendantOpacityById.get(endpointId) ?? 1),
              1,
            ),
          }];
        }

        if (hiddenEndpointIds.length !== 1 || visibleEndpointIds.length !== 1) {
          return [];
        }

        const visiblePoint = visiblePointById.get(visibleEndpointIds[0]!);
        const hiddenPoint = allProjectedInstantPoints.find((point) => point.id === hiddenEndpointIds[0]);
        const hiddenRegion = hiddenPoint?.containedBy ? regionById.get(hiddenPoint.containedBy) : undefined;
        if (!visiblePoint || !hiddenPoint || !hiddenRegion || visiblePoint.containedBy !== hiddenPoint.containedBy) {
          return [];
        }

        const normalized = normalizeRelationGeometry(
          segment.endpointIds,
          visiblePoint.x,
          visiblePoint.y,
          hiddenRegion.labelAttachX,
          hiddenRegion.labelAttachY,
        );
        return [{
          ...segment,
          x1: normalized.x1,
          y1: normalized.y1,
          x2: normalized.x2,
          y2: normalized.y2,
          midX: (normalized.x1 + normalized.x2) / 2,
          midY: (normalized.y1 + normalized.y2) / 2,
          angle: getReadableEdgeAngle((Math.atan2(normalized.y2 - normalized.y1, normalized.x2 - normalized.x1) * 180) / Math.PI),
          opacity: Math.min(chartCompositeRegions.descendantOpacityById.get(visiblePoint.id) ?? 1, hiddenRegion.opacity),
          showLabel: false,
          isSurrogate: true,
        } satisfies RelationSegment];
      });
    },
    [allProjectedInstantPoints, chartCompositeRegions.descendantOpacityById, chartCompositeRegions.regions, chartInstantPoints, chartRelationSegments, farZoomElisionState.hiddenPointIds]
  );

  const compositeStyleById = useMemo(
    () => new Map(visibleCompositeColorAssignments.map((assignment) => [assignment.id, assignment])),
    [visibleCompositeColorAssignments],
  );

  const activeDiagnosticMessages = useMemo(() => {
    if (runtimeViewportLoadState === "idle") {
      return [] as string[];
    }

    return [
      ...(runtimeViewportResponse?.diagnostics ?? []).map((diagnostic) => `[viewport:${diagnostic.severity}] ${diagnostic.message}`),
      ...visibleChartPlaneEntities.flatMap((entity) =>
        entity.diagnostics.map((diagnostic) => `[entity:${diagnostic.severity}] ${entity.label}: ${diagnostic.message}`),
      ),
      ...(runtimeViewportLoadState === "error" && runtimeViewportErrorMessage
        ? [`[viewport:error] ${runtimeViewportErrorMessage}`]
        : []),
    ];
  }, [runtimeViewportErrorMessage, runtimeViewportLoadState, runtimeViewportResponse, visibleChartPlaneEntities]);

  const viewportStatusMessage = runtimeViewportLoadState === "error"
    ? locale === "ko"
      ? "뷰포트 데이터를 불러오지 못했습니다."
      : "Unable to load viewport data."
    : null;

  useEffect(() => {
    for (const message of activeDiagnosticMessages) {
      console.warn(message);
    }
  }, [activeDiagnosticMessages]);

  const gregorianAxisTicks = useMemo(() => {
    if (!chartPlane || !workspace.chronologyBoard) {
      return {
        major: [] as GregorianAxisTick[],
        minor: [] as GregorianAxisTick[]
      };
    }

    const centerYear = (workspace.chronologyBoard.axis.startYear + workspace.chronologyBoard.axis.endYear) / 2;
    const minorStep = pickGregorianAxisStep(view.scaleY);
    const majorStep = pickGregorianAxisMajorStep(minorStep);

    const majorTicks = buildGregorianAxisTicks(
        centerYear,
        majorStep,
        chartPlane.visibleWorldBounds.minY,
        chartPlane.visibleWorldBounds.maxY,
        viewportSize.height,
        view.y,
        view.scaleY,
        formatGregorianAxisLabel
      );
    const minorTicks = majorStep.unit === minorStep.unit && majorStep.count === minorStep.count
        ? []
        : buildGregorianAxisTicks(
            centerYear,
            minorStep,
            chartPlane.visibleWorldBounds.minY,
            chartPlane.visibleWorldBounds.maxY,
            viewportSize.height,
            view.y,
            view.scaleY,
            formatGregorianAxisMinorLabel
          );

    return applyAxisLabelVisibility(majorTicks, minorTicks);
  }, [chartPlane, viewportSize.height, view.scaleY, view.y, workspace.chronologyBoard]);

  const handleViewportPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    if (pendingEventTapRef.current && pendingEventTapRef.current.pointerId !== event.pointerId) {
      pendingEventTapRef.current = null;
    }

    event.preventDefault();
    const point = getLocalViewportPoint(event);

    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      typeof event.currentTarget.setPointerCapture === "function" &&
      !event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    setImageViewportState((current) => addViewportPointer(current, event.pointerId, point));
  }, []);

  const handleViewportPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (pendingEventTapRef.current?.pointerId === event.pointerId) {
      const deltaX = event.clientX - pendingEventTapRef.current.startClientX;
      const deltaY = event.clientY - pendingEventTapRef.current.startClientY;
      if (Math.hypot(deltaX, deltaY) > EVENT_DRAWER_TAP_SLOP_PX) {
        pendingEventTapRef.current = null;
      }
    }

    const point = getLocalViewportPoint(event);
    setImageViewportState((current) => moveViewportPointer(current, event.pointerId, point));
  }, []);

  const handleViewportPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const pendingEventTap = pendingEventTapRef.current;
    if (pendingEventTap?.pointerId === event.pointerId) {
      const deltaX = event.clientX - pendingEventTap.startClientX;
      const deltaY = event.clientY - pendingEventTap.startClientY;
      const stayedWithinTapSlop = Math.hypot(deltaX, deltaY) <= EVENT_DRAWER_TAP_SLOP_PX;
      pendingEventTapRef.current = null;
      if (stayedWithinTapSlop && Object.keys(imageViewportState.activePointers).length === 1) {
        eventSelectionNonceRef.current += 1;
        pendingRestoredDrawerStageRef.current = "peek";
        setSelectedEventTab("notes");
        setSelectedEventSelection({
          eventId: pendingEventTap.target.eventId,
          label: pendingEventTap.target.label,
          requestKey: eventSelectionNonceRef.current,
        });
      }
    }

    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      typeof event.currentTarget.releasePointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setImageViewportState((current) => removeViewportPointer(current, event.pointerId));
  }, [imageViewportState.activePointers]);

  const handleCloseSelectedEvent = useCallback(() => {
    pendingRestoredDrawerStageRef.current = null;
    setSelectedEventSelection(null);
  }, []);

  const resetEventDrawerGesture = useCallback(() => {
    eventDrawerDragRef.current = null;
    setIsEventDrawerDragging(false);
    if (eventDrawerRef.current) {
      eventDrawerRef.current.style.setProperty("--event-drawer-drag-offset", "0px");
    }
  }, []);

  const finishEventDrawerDrag = useCallback((deltaY: number, originStage: EventDrawerStage) => {
    if (eventDrawerRef.current) {
      eventDrawerRef.current.style.setProperty("--event-drawer-drag-offset", "0px");
    }

    if (originStage === "peek") {
      if (deltaY <= -EVENT_DRAWER_EXPAND_THRESHOLD_PX) {
        setEventDrawerStage("full");
        return;
      }
      if (deltaY >= EVENT_DRAWER_PEEK_DISMISS_THRESHOLD_PX) {
        handleCloseSelectedEvent();
        return;
      }
      setEventDrawerStage("peek");
      return;
    }

    if (deltaY >= EVENT_DRAWER_FULL_DISMISS_THRESHOLD_PX) {
      handleCloseSelectedEvent();
      return;
    }
    if (deltaY >= EVENT_DRAWER_COLLAPSE_THRESHOLD_PX) {
      setEventDrawerStage("peek");
      return;
    }
    setEventDrawerStage("full");
  }, [handleCloseSelectedEvent]);

  const updateEventDrawerDrag = useCallback((deltaY: number, originStage: EventDrawerStage) => {
    if (eventDrawerRef.current) {
      eventDrawerRef.current.style.setProperty(
        "--event-drawer-drag-offset",
        `${clampEventDrawerDragOffset(deltaY, originStage)}px`,
      );
    }
  }, []);

  const startEventDrawerDrag = useCallback((pointerId: number, clientY: number, currentTarget: HTMLElement, originStage: EventDrawerStage, source: EventDrawerDragSource) => {
    eventDrawerDragRef.current = {
      pointerId,
      source,
      startClientY: clientY,
      originStage,
    };
    setIsEventDrawerDragging(true);
    if (eventDrawerRef.current) {
      eventDrawerRef.current.style.setProperty("--event-drawer-drag-offset", "0px");
    }
    if (typeof currentTarget.setPointerCapture === "function") {
      currentTarget.setPointerCapture(pointerId);
    }
  }, []);

  const handleEventDrawerPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.preventDefault();
    startEventDrawerDrag(event.pointerId, event.clientY, event.currentTarget, eventDrawerStage, "sheet");
  }, [eventDrawerStage, startEventDrawerDrag]);

  const handleEventDrawerPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = eventDrawerDragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      event.preventDefault();
      updateEventDrawerDrag(event.clientY - drag.startClientY, drag.originStage);
    }
  }, [updateEventDrawerDrag]);

  const handleEventDrawerPointerEnd = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = eventDrawerDragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      event.preventDefault();
      eventDrawerDragRef.current = null;
      setIsEventDrawerDragging(false);
      if (
        typeof event.currentTarget.hasPointerCapture === "function" &&
        typeof event.currentTarget.releasePointerCapture === "function" &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishEventDrawerDrag(event.clientY - drag.startClientY, drag.originStage);
    }
  }, [finishEventDrawerDrag]);

  const handleEventDrawerPointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = eventDrawerDragRef.current;
    if (drag?.pointerId === event.pointerId) {
      if (
        typeof event.currentTarget.hasPointerCapture === "function" &&
        typeof event.currentTarget.releasePointerCapture === "function" &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
    resetEventDrawerGesture();
  }, [resetEventDrawerGesture]);

  const handleEventDrawerTargetPointerDown = useCallback((target: EventDrawerTarget, event: ReactPointerEvent<Element>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    pendingEventTapRef.current = {
      pointerId: event.pointerId,
      target,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
  }, []);

  const handleEventPointPointerDown = useCallback((point: InstantPoint, event: ReactPointerEvent<Element>) => {
    handleEventDrawerTargetPointerDown({ eventId: point.eventId, label: point.label }, event);
  }, [handleEventDrawerTargetPointerDown]);

  const handleCompositeRegionPointerDown = useCallback((region: CompositeRegion, event: ReactPointerEvent<Element>) => {
    handleEventDrawerTargetPointerDown({ eventId: region.id, label: region.label }, event);
  }, [handleEventDrawerTargetPointerDown]);

  const selectedEventPoint = useMemo(() => {
    if (!renderedEventSelection) {
      return null;
    }

    return allWorldInstantPoints.find((point) => point.eventId === renderedEventSelection.eventId) ?? null;
  }, [allWorldInstantPoints, renderedEventSelection]);
  const selectedEventTitle = selectedEventRecord?.title ?? renderedEventSelection?.label ?? "";
  const selectedEventNotes = selectedEventRecord?.notes ?? "";
  const selectedEventChronologySummary = selectedEventRecord?.chronologySummary ?? (() => {
    const firstAnchor = selectedEventRecord?.chronology?.authored?.[0];
    return firstAnchor ? summarizeWorldAnchorForPanel(firstAnchor) : undefined;
  })();
  const selectedEventPlaceLabels = selectedEventRecord?.placeEvents.map((item) => item.label) ?? [];
  const selectedEventPeopleLabels = selectedEventRecord?.people.map((item) => item.label) ?? [];
  const selectedEventCauseLabels = selectedEventRecord?.causeEvents.map((item) => item.label) ?? [];
  const selectedEventResultLabels = selectedEventRecord?.resultEvents.map((item) => item.label) ?? [];
  const eventLinkGraphFragment = useMemo(
    () => buildEventLinkGraphFragment({
      allProjectedInstantPoints,
      chartCompositeRegions: chartCompositeRegions.regions,
      compositeSplineTuning,
      selectedEventPoint,
      selectedEventTitle,
      visibleRelationSegments,
    }),
    [allProjectedInstantPoints, chartCompositeRegions.regions, compositeSplineTuning, selectedEventPoint, selectedEventTitle, visibleRelationSegments],
  );

  return (
    <>
      <GraphSourceIsland locale={locale} />

      <div className={styles.canvasFrame}>
          <div
            className={styles.chartPlaneStage}
            data-testid="graph-stage"
            onLostPointerCapture={handleViewportPointerEnd}
            onPointerCancel={handleViewportPointerEnd}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handleViewportPointerMove}
            onPointerUp={handleViewportPointerEnd}
          >
            <div aria-hidden="true" className={styles.canvasProbeBox}>
              <div className={styles.canvasProbeAxisTrack}>
                {gregorianAxisTicks.major.map((tick) => (
                  <div
                    className={`${styles.canvasProbeAxisTick} ${styles.canvasProbeAxisTickMajor}`}
                    key={tick.id}
                    style={{ top: tick.top }}
                  >
                    <span className={styles.canvasProbeAxisTickMark} />
                    {tick.showLabel !== false ? <span className={styles.canvasProbeAxisTickLabel}>{tick.label}</span> : null}
                  </div>
                ))}
                {gregorianAxisTicks.minor.map((tick) => (
                  <div className={`${styles.canvasProbeAxisTick} ${styles.canvasProbeAxisTickMinor}`} key={tick.id} style={{ top: tick.top }}>
                    <span className={styles.canvasProbeAxisTickMark} />
                    {tick.showLabel !== false ? <span className={styles.canvasProbeAxisTickLabel}>{tick.label}</span> : null}
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.chartPlaneViewport} ref={chartViewportRef}>
              {viewportStatusMessage ? <div className={styles.chartViewportStatus}>{viewportStatusMessage}</div> : null}
              <div
                className={styles.chartBackdropImage}
                data-backdrop-texture="paper-grain"
                style={{ backgroundImage: `url("${GRAPH_BACKDROP_REFERENCE_IMAGE_URL}")` }}
              />
              {chartPlane ? (
                <svg aria-label="Projected chart surface" className={styles.chartSurface} viewBox={`0 0 ${viewportSize.width} ${viewportSize.height}`}>
                  <defs>
                    <marker id="relation-arrow-order" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3">
                      <path d="M0,0 L6,3 L0,6 Z" fill={RELATION_ORDER_STROKE} />
                    </marker>
                    <marker id="relation-arrow-cause" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3">
                      <path d="M0,0 L6,3 L0,6 Z" fill={RELATION_CAUSE_STROKE} />
                    </marker>
                    <marker id="relation-arrow-soft" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3">
                      <path d="M0,0 L6,3 L0,6 Z" fill={RELATION_SOFT_STROKE} />
                    </marker>
                    {visibleCompositeRegions.map((region) =>
                      region.showLabel && region.labelPath ? (
                        <path
                          d={region.labelPath}
                          data-region-label-path-id={region.id}
                          id={getCompositeLabelPathId(region.id)}
                          key={`${region.id}:label-path`}
                        />
                      ) : null,
                    )}
                  </defs>
                  <rect className={styles.chartBackdrop} height={viewportSize.height} width={viewportSize.width} x={0} y={0} />
                  {visibleCompositeRegions.map((region) => {
                    const compositeStyle = compositeStyleById.get(region.id);
                    return (
                      <path
                        className={styles.chartCompositeRegion}
                        data-depth={region.depth}
                        data-region-id={region.id}
                        key={region.id}
                        d={region.path}
                        onPointerDown={(event) => handleCompositeRegionPointerDown(region, event)}
                        style={{
                          fill: compositeStyle?.fill,
                          mixBlendMode: "darken",
                          fillOpacity: COMPOSITE_SURFACE_FILL_OPACITY * region.renderedOpacity * region.surfaceOpacity,
                          stroke: compositeStyle?.label,
                          strokeOpacity: COMPOSITE_SURFACE_STROKE_OPACITY * region.renderedOpacity * region.surfaceOpacity,
                        }}
                      />
                    );
                  })}
                  {chartPlane.gridLines.map((line) => (
                    <line
                      className={line.worldValue === 0 ? styles.chartGridAxis : styles.chartGridLine}
                      key={line.id}
                      x1={line.viewportStart.x}
                      x2={line.viewportEnd.x}
                      y1={line.viewportStart.y}
                      y2={line.viewportEnd.y}
                    />
                  ))}
                  {chartAnchors.map((anchor) => (
                    <g key={anchor.id}>
                      <line className={styles.chartAnchorLine} x1={0} x2={viewportSize.width} y1={anchor.y} y2={anchor.y} />
                    </g>
                  ))}
                  {visibleRelationSegments.map((segment) => {
                    const relationStyle = getRelationStyle(segment.typeKey);
                    return (
                      <g key={segment.id}>
                        {segment.typeKey === "causes" && !segment.isSurrogate ? (
                          <path
                            className={styles.chartRelationSegment}
                            d={buildCurvedRelationPath(segment.x1, segment.y1, segment.x2, segment.y2)}
                            id={getRelationLabelPathId(segment.id)}
                            data-relation-segment-id={segment.id}
                            data-relation-segment-type={segment.typeKey}
                            markerEnd={`url(#${relationStyle.markerId})`}
                            style={{
                              fill: "none",
                              stroke: relationStyle.stroke,
                              strokeDasharray: relationStyle.dasharray,
                              strokeWidth: relationStyle.strokeWidth,
                              opacity: segment.opacity,
                            }}
                          />
                        ) : (
                          <line
                            className={`${styles.chartRelationSegment} ${segment.isSurrogate ? styles.chartRelationSegmentSurrogate : ""}`}
                            data-relation-segment-id={!segment.isSurrogate ? segment.id : undefined}
                            data-relation-segment-type={!segment.isSurrogate ? segment.typeKey : undefined}
                            data-surrogate-segment-id={segment.isSurrogate ? segment.id : undefined}
                            markerEnd={segment.isSurrogate ? undefined : `url(#${relationStyle.markerId})`}
                            style={{
                              stroke: segment.isSurrogate ? RELATION_SURROGATE_STROKE : relationStyle.stroke,
                              strokeDasharray: segment.isSurrogate ? "5 5" : relationStyle.dasharray,
                              strokeWidth: segment.isSurrogate ? 1 : relationStyle.strokeWidth,
                              opacity: segment.opacity,
                            }}
                            x1={segment.x1}
                            x2={segment.x2}
                            y1={segment.y1}
                            y2={segment.y2}
                          />
                        )}
                      </g>
                    );
                  })}
                  {chartInstantPoints.map((point) => {
                    const labelHitWidth = Math.max(point.label.length * 8 + 20, 64);
                    const hitTargetWidth = Math.max(labelHitWidth + 20, 24);
                    const hitTargetHeight = 36;

                    return (
                      <g key={point.id}>
                        <rect
                          className={styles.chartInstantPointHitTarget}
                          data-event-point-id={point.eventId}
                          data-event-point-label-id={point.showLabel !== false ? point.eventId : undefined}
                          height={hitTargetHeight}
                          onPointerDown={(event) => handleEventPointPointerDown(point, event)}
                          rx={hitTargetHeight / 2}
                          ry={hitTargetHeight / 2}
                          width={hitTargetWidth}
                          x={point.x - 12}
                          y={point.y - 24}
                        >
                          <title>{copy.eventOpenPointLabel(point.label)}</title>
                        </rect>
                        <circle
                          className={styles.chartInstantPoint}
                          cx={point.x}
                          cy={point.y}
                          r={6}
                          style={{ opacity: point.opacity, pointerEvents: "none" }}
                        />
                        {point.showLabel !== false ? (
                          <text className={styles.chartInstantPointLabel} style={{ opacity: point.opacity, pointerEvents: "none" }} x={point.x + 10} y={point.y - 10}>{point.renderedLabel ?? point.label}</text>
                        ) : null}
                      </g>
                    );
                  })}
                  {visibleCompositeRegions.map((region) => {
                    if (!region.showLabel || !region.labelPath) {
                      return null;
                    }

                    const compositeStyle = compositeStyleById.get(region.id);
                    return (
                      <text
                        className={styles.chartCompositeRegionLabel}
                        data-depth={region.depth}
                        data-region-id={region.id}
                        data-region-label-anchor={region.labelAnchor}
                        dominantBaseline="middle"
                        key={`${region.id}:label`}
                        onPointerDown={(event) => handleCompositeRegionPointerDown(region, event)}
                        style={{
                          fill: compositeStyle?.label,
                          opacity: region.renderedOpacity * region.surfaceOpacity * 0.45,
                        }}
                        textAnchor={region.labelAnchor}
                      >
                        <textPath
                          alignmentBaseline="middle"
                          dominantBaseline="middle"
                          href={`#${getCompositeLabelPathId(region.id)}`}
                          startOffset={region.textPathStartOffset}
                        >
                          {region.renderedLabel}
                        </textPath>
                      </text>
                    );
                  })}
                  {visibleRelationSegments.map((segment) => {
                    const relationStyle = getRelationStyle(segment.typeKey);
                    return segment.showLabel && relationStyle.label ? (
                      segment.typeKey === "causes" && !segment.isSurrogate ? (
                        <text
                          className={styles.chartRelationLabel}
                          key={`${segment.id}:label`}
                          style={{ opacity: segment.opacity * relationStyle.labelOpacity, fontSize: relationStyle.labelFontSize, fontWeight: relationStyle.labelFontWeight }}
                        >
                          <textPath href={`#${getRelationLabelPathId(segment.id)}`} startOffset="2%">
                            {relationStyle.label}
                          </textPath>
                        </text>
                      ) : (
                        <text
                          className={styles.chartRelationLabel}
                          key={`${segment.id}:label`}
                          transform={`translate(${segment.midX} ${segment.midY}) rotate(${segment.angle})`}
                          style={{ opacity: segment.opacity * relationStyle.labelOpacity, fontSize: relationStyle.labelFontSize, fontWeight: relationStyle.labelFontWeight }}
                          x={0}
                          y={-4}
                        >
                          {relationStyle.label}
                        </text>
                      )
                    ) : null;
                  })}
                </svg>
              ) : null}
            </div>

              </div>

        {renderedEventSelection ? (
          <button
            aria-label={copy.eventDrawerBackdropCloseLabel}
            className={styles.eventDrawerBackdrop}
            data-open={isEventDrawerOpen ? "true" : "false"}
            onClick={handleCloseSelectedEvent}
            type="button"
          />
        ) : null}

        {renderedEventSelection ? (
          <aside
            aria-label={copy.eventDrawerLabel}
            className={styles.eventDrawer}
            data-dragging={isEventDrawerDragging ? "true" : "false"}
            data-open={isEventDrawerOpen ? "true" : "false"}
            data-stage={eventDrawerStage}
            data-testid="event-drawer-sheet"
            onPointerCancel={handleEventDrawerPointerCancel}
            onPointerDown={handleEventDrawerPointerDown}
            onPointerMove={handleEventDrawerPointerMove}
            onPointerUp={handleEventDrawerPointerEnd}
            ref={eventDrawerRef}
            role="dialog"
            style={{
              "--event-drawer-rest-offset": `${getEventDrawerStageOffset(eventDrawerStage)}px`,
            } as CSSProperties}
          >
            <EventDrawerContent
              copy={copy}
              eventCauseLabels={selectedEventCauseLabels}
              eventChronologySummary={selectedEventChronologySummary}
              eventLinkGraphFragment={eventLinkGraphFragment}
              eventPeopleLabels={selectedEventPeopleLabels}
              eventTab={selectedEventTab}
              eventPlaceLabels={selectedEventPlaceLabels}
              eventResultLabels={selectedEventResultLabels}
              loadState={selectedEventLoadState}
              notes={selectedEventNotes}
              onTabChange={setSelectedEventTab}
              selectedEventTitle={selectedEventTitle}
              viewportRef={eventDrawerViewportRef}
            />
          </aside>
        ) : null}
      </div>
    </>
  );
}
