// @ts-nocheck -- Next.js adapter: preserve copied URDR source under Moirai's stricter TS config.
import {
  buildGraphShellAbsoluteUrl,
  GRAPH_SHELL_URL_PARAM_CANONS,
  GRAPH_SHELL_URL_PARAM_EVENT,
  GRAPH_SHELL_URL_PARAM_STAGE,
  GRAPH_SHELL_URL_PARAM_TIMELINE,
} from "@urdr/domain";
import type { GraphShellDrawerStage } from "@urdr/domain";

import type { ImageViewportView } from "./image-viewport";
import type { ViewportSize } from "./chart-surface";

export const GRAPH_SHELL_LOCAL_STATE_KEY = "urdr:graph-shell:local-state";
export const GRAPH_SHELL_LOCAL_STATE_VERSION = 3;

export const GRAPH_SHELL_URL_PARAM_VIEWPORT = "gsViewport";
export {
  GRAPH_SHELL_URL_PARAM_CANONS,
  GRAPH_SHELL_URL_PARAM_EVENT,
  GRAPH_SHELL_URL_PARAM_STAGE,
  GRAPH_SHELL_URL_PARAM_TIMELINE,
};
export type { GraphShellDrawerStage };

export type GraphShellRestorableShellSlice = {
  selectedTimelineId: string;
  enabledCanonIds: string[];
};

export type GraphShellRestorableViewportSlice = {
  centerX: number;
  centerY: number;
  spanX: number;
  spanY: number;
};

export type GraphShellRestorableDrawerSlice = {
  eventId: string;
  stage: GraphShellDrawerStage;
};

export type GraphShellRestorableState = {
  shell?: GraphShellRestorableShellSlice;
  viewport?: GraphShellRestorableViewportSlice;
  drawer?: GraphShellRestorableDrawerSlice;
};

export type ResolvedGraphShellRestorableState = {
  shell: GraphShellRestorableShellSlice;
  viewport: GraphShellRestorableViewportSlice | undefined;
  drawer: GraphShellRestorableDrawerSlice | undefined;
};

type GraphShellPersistedStateV3 = {
  version: 3;
  shell?: GraphShellRestorableShellSlice;
  viewport?: GraphShellRestorableViewportSlice;
  drawer?: GraphShellRestorableDrawerSlice;
};

type GraphShellPersistedStateV2 = {
  version?: 2;
  selectedTimelineId?: string;
  selectedCanonId?: string | null;
  enabledCanonIds?: string[];
  viewportCenterX?: number;
  viewportCenterY?: number;
  viewportScaleX?: number;
  viewportScaleY?: number;
};

type ResolveGraphShellRestorableStateArgs = {
  defaultState: {
    shell: GraphShellRestorableShellSlice;
    viewport?: GraphShellRestorableViewportSlice;
    drawer?: GraphShellRestorableDrawerSlice;
  };
  localState: GraphShellRestorableState | null;
  urlState: GraphShellRestorableState;
};

const MIN_VIEWPORT_SCALE = 0.01;
const MAX_VIEWPORT_SCALE = 100;
const MAX_VIEWPORT_CENTER = 1_000_000;
const MAX_VIEWPORT_TRANSLATION = 10_000_000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function dedupeCanonIds(canonIds: string[]) {
  const nextIds: string[] = [];
  const seen = new Set<string>();
  for (const canonId of canonIds) {
    if (seen.has(canonId)) {
      continue;
    }
    seen.add(canonId);
    nextIds.push(canonId);
  }
  return nextIds;
}

function formatNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}

function parseViewportNumbers(value: string) {
  const numbers = value.split(",").map((part) => Number(part));
  if (numbers.length !== 4 || numbers.some((entry) => !Number.isFinite(entry))) {
    return null;
  }

  return {
    centerX: numbers[0]!,
    centerY: numbers[1]!,
    spanX: numbers[2]!,
    spanY: numbers[3]!,
  } satisfies GraphShellRestorableViewportSlice;
}

export function normalizeGraphShellShellSlice(slice: unknown): GraphShellRestorableShellSlice | null {
  if (!slice || typeof slice !== "object" || Array.isArray(slice)) {
    return null;
  }

  const candidate = slice as Record<string, unknown>;
  if (!isNonEmptyString(candidate.selectedTimelineId)) {
    return null;
  }
  if (!Array.isArray(candidate.enabledCanonIds) || candidate.enabledCanonIds.some((entry) => !isNonEmptyString(entry))) {
    return null;
  }

  const enabledCanonIds = dedupeCanonIds(candidate.enabledCanonIds);

  return {
    selectedTimelineId: candidate.selectedTimelineId,
    enabledCanonIds,
  };
}

export function normalizeGraphShellViewportSlice(slice: unknown): GraphShellRestorableViewportSlice | null {
  if (!slice || typeof slice !== "object" || Array.isArray(slice)) {
    return null;
  }

  const candidate = slice as Record<string, unknown>;
  if (
    !isFiniteNumber(candidate.centerX) ||
    !isFiniteNumber(candidate.centerY) ||
    !isFiniteNumber(candidate.spanX) ||
    !isFiniteNumber(candidate.spanY)
  ) {
    return null;
  }

  if (
    candidate.spanX <= 0 ||
    candidate.spanY <= 0 ||
    Math.abs(candidate.centerX) > MAX_VIEWPORT_CENTER ||
    Math.abs(candidate.centerY) > MAX_VIEWPORT_CENTER
  ) {
    return null;
  }

  return {
    centerX: candidate.centerX,
    centerY: candidate.centerY,
    spanX: candidate.spanX,
    spanY: candidate.spanY,
  };
}

export function normalizeGraphShellDrawerSlice(slice: unknown): GraphShellRestorableDrawerSlice | null {
  if (!slice || typeof slice !== "object" || Array.isArray(slice)) {
    return null;
  }

  const candidate = slice as Record<string, unknown>;
  if (!isNonEmptyString(candidate.eventId)) {
    return null;
  }

  const stage = candidate.stage === "full" ? "full" : candidate.stage === "peek" ? "peek" : null;
  if (!stage) {
    return null;
  }

  return {
    eventId: candidate.eventId,
    stage,
  };
}

export function createGraphShellViewportSliceFromView(view: ImageViewportView, viewportSize: ViewportSize): GraphShellRestorableViewportSlice | null {
  if (viewportSize.width <= 0 || viewportSize.height <= 0 || view.scaleX === 0 || view.scaleY === 0) {
    return null;
  }

  return normalizeGraphShellViewportSlice({
    centerX: -view.x / view.scaleX,
    centerY: -view.y / view.scaleY,
    spanX: viewportSize.width / view.scaleX,
    spanY: viewportSize.height / view.scaleY,
  });
}

export function createImageViewportViewFromRestorableSlice(
  slice: GraphShellRestorableViewportSlice | null | undefined,
  viewportSize: ViewportSize,
): ImageViewportView | null {
  if (!slice || viewportSize.width <= 0 || viewportSize.height <= 0) {
    return null;
  }

  const normalizedSlice = normalizeGraphShellViewportSlice(slice);
  if (!normalizedSlice) {
    return null;
  }

  const scaleX = viewportSize.width / normalizedSlice.spanX;
  const scaleY = viewportSize.height / normalizedSlice.spanY;
  if (
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY) ||
    scaleX < MIN_VIEWPORT_SCALE ||
    scaleX > MAX_VIEWPORT_SCALE ||
    scaleY < MIN_VIEWPORT_SCALE ||
    scaleY > MAX_VIEWPORT_SCALE ||
    Math.abs(normalizedSlice.centerX * scaleX) > MAX_VIEWPORT_TRANSLATION ||
    Math.abs(normalizedSlice.centerY * scaleY) > MAX_VIEWPORT_TRANSLATION
  ) {
    return null;
  }

  return {
    x: -normalizedSlice.centerX * scaleX,
    y: -normalizedSlice.centerY * scaleY,
    scaleX,
    scaleY,
  };
}

export function parseGraphShellUrlState(search: string): GraphShellRestorableState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const nextState: GraphShellRestorableState = {};

  const selectedTimelineId = params.get(GRAPH_SHELL_URL_PARAM_TIMELINE);
  const canons = params.get(GRAPH_SHELL_URL_PARAM_CANONS);
  if (selectedTimelineId && canons) {
    const shellSlice = normalizeGraphShellShellSlice({
      selectedTimelineId,
      enabledCanonIds: canons.split(",").filter((entry) => entry.length > 0),
    });
    if (shellSlice) {
      nextState.shell = shellSlice;
    }
  }

  const viewport = params.get(GRAPH_SHELL_URL_PARAM_VIEWPORT);
  if (viewport) {
    const viewportSlice = normalizeGraphShellViewportSlice(parseViewportNumbers(viewport));
    if (viewportSlice) {
      nextState.viewport = viewportSlice;
    }
  }

  const eventId = params.get(GRAPH_SHELL_URL_PARAM_EVENT);
  if (eventId) {
    const drawerSlice = normalizeGraphShellDrawerSlice({
      eventId,
      stage: params.get(GRAPH_SHELL_URL_PARAM_STAGE) ?? "peek",
    });
    if (drawerSlice) {
      nextState.drawer = drawerSlice;
    }
  }

  return nextState;
}

export function buildGraphShellUrlSearch(baseSearch: string, state: GraphShellRestorableState) {
  const baseUrl = new URL("https://graph-shell.local/");
  baseUrl.search = baseSearch.startsWith("?") ? baseSearch : baseSearch.length > 0 ? `?${baseSearch}` : "";

  const withShell = new URL(buildGraphShellAbsoluteUrl(baseUrl, {
    shell: state.shell ?? null,
  }));

  withShell.searchParams.delete(GRAPH_SHELL_URL_PARAM_VIEWPORT);
  if (state.viewport) {
    withShell.searchParams.set(
      GRAPH_SHELL_URL_PARAM_VIEWPORT,
      [state.viewport.centerX, state.viewport.centerY, state.viewport.spanX, state.viewport.spanY]
        .map(formatNumber)
        .join(","),
    );
  }

  const withDrawer = new URL(buildGraphShellAbsoluteUrl(withShell, {
    drawer: state.drawer ?? null,
  }));

  const nextSearch = withDrawer.searchParams.toString();
  return nextSearch.length > 0 ? `?${nextSearch}` : "";
}

export function serializeGraphShellLocalState(state: GraphShellRestorableState): GraphShellPersistedStateV3 {
  return {
    version: GRAPH_SHELL_LOCAL_STATE_VERSION,
    ...(state.shell ? { shell: state.shell } : {}),
    ...(state.viewport ? { viewport: state.viewport } : {}),
  };
}

function parseLegacyGraphShellLocalState(raw: GraphShellPersistedStateV2, viewportSize: ViewportSize) {
  const nextState: GraphShellRestorableState = {};

  const legacyEnabledCanonIds = Array.isArray(raw.enabledCanonIds)
    ? raw.enabledCanonIds
    : isNonEmptyString(raw.selectedCanonId)
      ? [raw.selectedCanonId]
      : null;
  if (isNonEmptyString(raw.selectedTimelineId) && legacyEnabledCanonIds) {
    const shellSlice = normalizeGraphShellShellSlice({
      selectedTimelineId: raw.selectedTimelineId,
      enabledCanonIds: legacyEnabledCanonIds,
    });
    if (!shellSlice) {
      return null;
    }
    nextState.shell = shellSlice;
  }

  if (
    raw.viewportCenterX !== undefined ||
    raw.viewportCenterY !== undefined ||
    raw.viewportScaleX !== undefined ||
    raw.viewportScaleY !== undefined
  ) {
    if (
      !isFiniteNumber(raw.viewportCenterX) ||
      !isFiniteNumber(raw.viewportCenterY) ||
      !isFiniteNumber(raw.viewportScaleX) ||
      !isFiniteNumber(raw.viewportScaleY) ||
      raw.viewportScaleX < MIN_VIEWPORT_SCALE ||
      raw.viewportScaleX > MAX_VIEWPORT_SCALE ||
      raw.viewportScaleY < MIN_VIEWPORT_SCALE ||
      raw.viewportScaleY > MAX_VIEWPORT_SCALE ||
      viewportSize.width <= 0 ||
      viewportSize.height <= 0 ||
      Math.abs(raw.viewportCenterX) > MAX_VIEWPORT_CENTER ||
      Math.abs(raw.viewportCenterY) > MAX_VIEWPORT_CENTER ||
      Math.abs(raw.viewportCenterX * raw.viewportScaleX) > MAX_VIEWPORT_TRANSLATION ||
      Math.abs(raw.viewportCenterY * raw.viewportScaleY) > MAX_VIEWPORT_TRANSLATION
    ) {
      return null;
    }

    const viewportSlice = normalizeGraphShellViewportSlice({
      centerX: raw.viewportCenterX,
      centerY: raw.viewportCenterY,
      spanX: viewportSize.width / raw.viewportScaleX,
      spanY: viewportSize.height / raw.viewportScaleY,
    });
    if (!viewportSlice) {
      return null;
    }
    nextState.viewport = viewportSlice;
  }

  return nextState;
}

export function parseGraphShellLocalState(raw: unknown, viewportSize: ViewportSize): GraphShellRestorableState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (candidate.version === GRAPH_SHELL_LOCAL_STATE_VERSION) {
    const state = candidate as GraphShellPersistedStateV3;
    const nextState: GraphShellRestorableState = {};

    if (state.shell !== undefined) {
      const shellSlice = normalizeGraphShellShellSlice(state.shell);
      if (!shellSlice) {
        return null;
      }
      nextState.shell = shellSlice;
    }

    if (state.viewport !== undefined) {
      const viewportSlice = normalizeGraphShellViewportSlice(state.viewport);
      if (!viewportSlice || !createImageViewportViewFromRestorableSlice(viewportSlice, viewportSize)) {
        return null;
      }
      nextState.viewport = viewportSlice;
    }

    return nextState;
  }

  if (candidate.version === 2) {
    return parseLegacyGraphShellLocalState(candidate as GraphShellPersistedStateV2, viewportSize);
  }

  return null;
}

export function resolveGraphShellRestorableState({
  defaultState,
  localState,
  urlState,
}: ResolveGraphShellRestorableStateArgs): ResolvedGraphShellRestorableState {
  return {
    shell: urlState.shell ?? localState?.shell ?? defaultState.shell,
    viewport: urlState.viewport ?? localState?.viewport ?? defaultState.viewport,
    drawer: urlState.drawer ?? defaultState.drawer,
  };
}
