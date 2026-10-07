import {
  compositeStageSpan,
  resolveCompositeHierarchySpans,
  compositeLeafChildrenOpacity,
  advanceCompositeStageSpan
} from "../../urdr-port/src/components/composite-visibility-policy";
import {
  COMPOSITE_COMPACT_THRESHOLD_PX,
  COMPOSITE_COMPACT_HYSTERESIS_PX,
  COMPOSITE_HULL_FADE_PX,
  COMPOSITE_BORDERLESS_SPAN_PX,
  COMPOSITE_BORDER_FADE_PX,
  COMPOSITE_BORDERLESS_FILL_SCALE,
  COMPOSITE_SMALL_POINT_SPAN_PX,
  COMPOSITE_ORDINARY_POINT_SPAN_PX,
  COMPOSITE_HIDDEN_SPAN_PX,
  COMPOSITE_VISIBLE_POINT_SPAN_PX
} from "../../urdr-port/src/components/composite-point-display";

/** Research-only screen representation policy. No canonical facts or geometry
 * are produced here. A caller supplies a complete immutable authored closure,
 * projects it with its camera, and keeps this policy's small history in presets.
 */
export const REPRESENTATION_CONFIG_VERSION = "lab-representation/5";

export interface RepresentationConfig {
  hullOpacityScale: number;
  ordinaryPointOpacityScale: number;
  smallPointOpacityScale: number;
  hullLabelOpacity: number;
  ordinaryLabelOpacity: number;
  smallLabelOpacity: number;
  showHulls: boolean;
  showOrdinaryPoints: boolean;
  showSmallPoints: boolean;
  showLabels: boolean;
  showChildren: boolean;
  showRelations: boolean;
  compactThresholdPx: number;
  hullFadePx: number;
  hullBorderFadeStartPx: number;
  hullBorderFadePx: number;
  hullBorderlessOpacityScale: number;
  compositePointSizeStages: boolean;
  smallCompositeSpanPx: number;
  ordinaryCompositeSpanPx: number;
  hiddenCompositeSpanPx: number;
  visibleCompositeSpanPx: number;
  childRevealBySpan: boolean;
  sequentialChildPoints: boolean;
  stagedHierarchy: boolean;
  compactHysteresisPx: number;
  childRevealHeightPx: number;
  childFadeStartRatio: number;
  normalPointCount: number;
  normalHysteresisCount: number;
  smallPointCount: number;
  hiddenPointCount: number;
  smallPointScale: number;
  hiddenPointScale: number;
  hullSuppressCoverageStart: number;
  fadeDurationMs: number;
  labelFadeDurationMs: number;
}

type Parameter = {
  key: keyof RepresentationConfig;
  label: string;
  description: string;
} & (
  | { type: "boolean"; default: boolean }
  | { type: "number"; default: number; min: number; max: number; step: number }
);

export const REPRESENTATION_PARAMETERS: readonly Parameter[] = [
  ...(
    [
      ["hullOpacityScale", 1],
      ["hullLabelOpacity", 0.58],
      ["ordinaryPointOpacityScale", 1],
      ["ordinaryLabelOpacity", 1],
      ["smallPointOpacityScale", 1],
      ["smallLabelOpacity", 0]
    ] as const
  ).map(([key, value]) => ({
    key,
    label: key,
    type: "number" as const,
    default: value,
    min: 0,
    max: 1,
    step: 0.01,
    description:
      "Research-only stage opacity. Zero suppresses paint, not facts."
  })),
  {
    key: "showHulls",
    label: "Hull",
    type: "boolean",
    default: true,
    description: "Composite hull paint."
  },
  {
    key: "showOrdinaryPoints",
    label: "Ordinary point",
    type: "boolean",
    default: true,
    description: "Normal Event and compact Composite point paint."
  },
  {
    key: "showSmallPoints",
    label: "Small point",
    type: "boolean",
    default: true,
    description: "Density-reduced point paint; labels remain suppressed."
  },
  {
    key: "showLabels",
    label: "Labels",
    type: "boolean",
    default: true,
    description: "Event and Composite labels; contains is unchanged."
  },
  {
    key: "showChildren",
    label: "Children",
    type: "boolean",
    default: true,
    description:
      "Reveal descendants as their parent opens; switching off suppresses authored descendants."
  },
  {
    key: "showRelations",
    label: "Relations",
    type: "boolean",
    default: true,
    description: "Relations with visible endpoints."
  },
  {
    key: "compactThresholdPx",
    label: "Hull → point (px)",
    type: "number",
    default: COMPOSITE_COMPACT_THRESHOLD_PX,
    min: 0,
    max: 200,
    step: 1,
    description:
      "Maximum raw screen X/Y span at which compact ownership begins."
  },
  {
    key: "hullFadePx",
    label: "Hull fade interval (px)",
    type: "number",
    default: COMPOSITE_HULL_FADE_PX,
    min: 0,
    max: 160,
    step: 1,
    description:
      "Smooth hull/point blend above the compact threshold; independent of ownership hysteresis."
  },
  {
    key: "hullBorderFadeStartPx",
    label: "Borderless hull span (px)",
    type: "number",
    default: COMPOSITE_BORDERLESS_SPAN_PX,
    min: 0,
    max: 400,
    step: 1,
    description:
      "Maximum raw screen span at which the hull border is fully hidden. Fill and labels remain."
  },
  {
    key: "hullBorderFadePx",
    label: "Hull border fade interval (px)",
    type: "number",
    default: COMPOSITE_BORDER_FADE_PX,
    min: 0,
    max: 160,
    step: 1,
    description:
      "Border fade above the borderless span. Zero disables the separate border fade for legacy presets."
  },
  {
    key: "hullBorderlessOpacityScale",
    label: "Borderless hull fill",
    type: "number",
    default: COMPOSITE_BORDERLESS_FILL_SCALE,
    min: 0,
    max: 1,
    step: 0.01,
    description:
      "Fill multiplier while the border is hidden; labels keep their own opacity."
  },
  {
    key: "compositePointSizeStages",
    label: "Composite size stages",
    type: "boolean",
    default: true,
    description:
      "Use each Composite's screen span for ordinary, small and hidden stages. Legacy presets use density ranks."
  },
  ...(
    [
      ["smallCompositeSpanPx", COMPOSITE_SMALL_POINT_SPAN_PX],
      ["ordinaryCompositeSpanPx", COMPOSITE_ORDINARY_POINT_SPAN_PX],
      ["hiddenCompositeSpanPx", COMPOSITE_HIDDEN_SPAN_PX],
      ["visibleCompositeSpanPx", COMPOSITE_VISIBLE_POINT_SPAN_PX]
    ] as const
  ).map(([key, value]) => ({
    key,
    label: key,
    type: "number" as const,
    default: value,
    min: 0,
    max: 200,
    step: 1,
    description:
      "Composite raw screen span controlling reversible point size and visibility."
  })),
  {
    key: "stagedHierarchy",
    label: "Time-axis hierarchy stages",
    type: "boolean",
    default: true,
    description:
      "Weight Y over X, keep parent Composites visible after their children, and traverse each paint stage during camera changes."
  },
  {
    key: "childRevealBySpan",
    label: "Reveal by parent span",
    type: "boolean",
    default: true,
    description:
      "Use the larger raw X/Y span for parent-child reveal; off retains legacy Y-only behavior."
  },
  {
    key: "sequentialChildPoints",
    label: "Sequential child points",
    type: "boolean",
    default: true,
    description:
      "Shrink child points and release labels before their parent's collapse hides them."
  },
  {
    key: "compactHysteresisPx",
    label: "Compact hysteresis (px)",
    type: "number",
    default: COMPOSITE_COMPACT_HYSTERESIS_PX,
    min: 0,
    max: 160,
    step: 1,
    description:
      "Additional span retained by an already compact Composite; affects label ownership."
  },
  {
    key: "childRevealHeightPx",
    label: "Child reveal height (px)",
    type: "number",
    default: 16,
    min: 0,
    max: 600,
    step: 1,
    description:
      "Raw screen span for fully visible descendants; legacy presets may use only Y height."
  },
  {
    key: "childFadeStartRatio",
    label: "Child fade start ratio",
    type: "number",
    default: 0.25,
    min: 0,
    max: 1,
    step: 0.01,
    description:
      "Fraction of child reveal height where descendants start fading in."
  },
  {
    key: "normalPointCount",
    label: "Ordinary density rank",
    type: "number",
    default: 64,
    min: 0,
    max: 512,
    step: 1,
    description:
      "Number of normal points before hysteresis. Counts label candidates; Composite point paint follows its own size."
  },
  {
    key: "normalHysteresisCount",
    label: "Density hysteresis ranks",
    type: "number",
    default: 8,
    min: 0,
    max: 64,
    step: 1,
    description:
      "Retained normal points get extra ranks; previously small points need fewer ranks."
  },
  {
    key: "smallPointCount",
    label: "Small → fading rank",
    type: "number",
    default: 96,
    min: 0,
    max: 768,
    step: 1,
    description:
      "Start of the outgoing small-point fade band; must be ≥ ordinary rank."
  },
  {
    key: "hiddenPointCount",
    label: "Hidden density rank",
    type: "number",
    default: 128,
    min: 1,
    max: 1024,
    step: 1,
    description: "End of the outgoing fade band; must be > small rank."
  },
  {
    key: "smallPointScale",
    label: "Small point radius scale",
    type: "number",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.01,
    description: "Scale relative to the ordinary 6px radius."
  },
  {
    key: "hiddenPointScale",
    label: "Outgoing radius scale",
    type: "number",
    default: 0.2,
    min: 0,
    max: 1,
    step: 0.01,
    description: "Radius scale approached while small points fade to hidden."
  },
  {
    key: "hullSuppressCoverageStart",
    label: "Large hull fade coverage",
    type: "number",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.01,
    description:
      "Viewport coverage above which hull opacity falls linearly, reaching zero at full coverage."
  },
  {
    key: "fadeDurationMs",
    label: "Paint fade (ms)",
    type: "number",
    default: 220,
    min: 0,
    max: 2000,
    step: 10,
    description:
      "Renderer transition time; policy returns target weights deterministically."
  },
  {
    key: "labelFadeDurationMs",
    label: "Label fade (ms)",
    type: "number",
    default: 260,
    min: 0,
    max: 2000,
    step: 10,
    description: "Renderer label transition time."
  }
];

export const DEFAULT_REPRESENTATION_CONFIG = Object.freeze(
  Object.fromEntries(REPRESENTATION_PARAMETERS.map((p) => [p.key, p.default]))
) as Readonly<RepresentationConfig>;

/** Reject invalid imports instead of silently changing a supposedly reproducible preset. */
export function validateRepresentationConfig(
  value: unknown
): RepresentationConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid representation config");
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) => !REPRESENTATION_PARAMETERS.some((p) => p.key === key)
    )
  )
    throw Error("Unknown representation parameter");
  for (const parameter of REPRESENTATION_PARAMETERS) {
    const item = record[parameter.key];
    if (parameter.type === "boolean") {
      if (typeof item !== "boolean") throw Error(`Invalid ${parameter.key}`);
    } else if (
      typeof item !== "number" ||
      !Number.isFinite(item) ||
      item < parameter.min ||
      item > parameter.max ||
      (parameter.step === 1 && !Number.isInteger(item))
    ) {
      throw Error(`Invalid ${parameter.key}`);
    }
  }
  const config = record as unknown as RepresentationConfig;
  if (
    config.smallPointCount < config.normalPointCount ||
    config.hiddenPointCount <= config.smallPointCount
  )
    throw Error("Density ranks must satisfy ordinary ≤ small < hidden");
  if (
    config.ordinaryCompositeSpanPx <= config.smallCompositeSpanPx ||
    config.visibleCompositeSpanPx <= config.hiddenCompositeSpanPx
  )
    throw Error("Composite spans must have increasing fade intervals");
  return { ...config };
}

export type RepresentationBounds = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
};
export interface RepresentationNode {
  readonly id: string;
  readonly kind: "event" | "composite";
  readonly bounds: RepresentationBounds;
  /** Complete authored child IDs, including offscreen children. */
  readonly childIds?: readonly string[];
  /** Caller may supply padded hull height to match production child reveal. */
  readonly childScreenHeight?: number;
  /** Transient display clock only; omitted on cold/preset restore. */
  readonly stageSpan?: number;
  /** Polygon viewport coverage; caller may use a documented bounds approximation. */
  readonly viewportCoverage?: number;
  readonly inViewport?: boolean;
  readonly visible?: boolean;
  /** Presentation ranking only; defaults to stable Event identity. */
  readonly densityPriority?: string;
}

export interface RepresentationRelation {
  readonly id: string;
  readonly endpointIds: readonly string[];
  readonly visible?: boolean;
}

export type RepresentationHistory = Record<
  string,
  { compact: boolean; normal: boolean }
>;

export function validateRepresentationHistory(
  value: unknown
): RepresentationHistory {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid representation history");
  const history: RepresentationHistory = Object.create(
    null
  ) as RepresentationHistory;
  for (const [id, entry] of Object.entries(value)) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).some((key) => key !== "compact" && key !== "normal") ||
      typeof (entry as { compact?: unknown }).compact !== "boolean" ||
      typeof (entry as { normal?: unknown }).normal !== "boolean"
    )
      throw Error("Invalid representation history entry");
    const item = entry as { compact: boolean; normal: boolean };
    history[id] = { compact: item.compact, normal: item.normal };
  }
  return history;
}

export interface RepresentationResult {
  id: string;
  state:
    "hull" | "borderless-hull" | "ordinary-point" | "small-point" | "hidden";
  hullOpacity: number;
  hullStrokeOpacity: number;
  hullFillOpacity: number;
  ordinaryPointOpacity: number;
  smallPointOpacity: number;
  hiddenOpacity: number;
  labelOpacity: number;
  childrenOpacity: number;
  radiusScale: number;
  opacity: number;
  compact: boolean;
  densityRank: number | null;
}

const unit = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = unit(value);
  return t * t * (3 - 2 * t);
};
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function representationStageSpans(
  nodes: readonly RepresentationNode[],
  config: Readonly<RepresentationConfig>
): Map<string, number> {
  const composites = nodes
    .filter((node) => node.kind === "composite")
    .map((node) => {
      const width = node.bounds.maxX - node.bounds.minX;
      const height = node.bounds.maxY - node.bounds.minY;
      return {
        id: node.id,
        childIds: node.childIds ?? [],
        span: config.stagedHierarchy
          ? (node.stageSpan ?? compositeStageSpan(width, height))
          : Math.max(width, height)
      };
    });
  return config.stagedHierarchy
    ? resolveCompositeHierarchySpans(composites)
    : new Map(composites.map((node) => [node.id, node.span]));
}

/** A temporary paint clock; immutable geometry and the camera never lag. */
export function advanceRepresentationStages(
  nodes: readonly RepresentationNode[],
  config: Readonly<RepresentationConfig>,
  previous: ReadonlyMap<string, number>,
  elapsedMs: number,
  reducedMotion = false
) {
  const targets = representationStageSpans(nodes, config);
  if (!config.stagedHierarchy) return { nodes, spans: targets, active: false };
  let active = false;
  const advancing = nodes.map((node) => {
    const target = targets.get(node.id);
    if (target === undefined) return node;
    const next = advanceCompositeStageSpan(
      previous.get(node.id),
      target,
      elapsedMs,
      reducedMotion
    );
    active ||= next.active;
    return { ...node, stageSpan: next.span };
  });
  const spans = representationStageSpans(advancing, config);
  for (const [id, span] of spans)
    if (Math.abs(span - targets.get(id)!) > 0.0001) active = true;
  return {
    nodes: advancing.map((node) =>
      spans.has(node.id) ? { ...node, stageSpan: spans.get(node.id)! } : node
    ),
    spans,
    active
  };
}

export function evaluateRepresentationScene(
  input: {
    readonly nodes: readonly RepresentationNode[];
    readonly relations?: readonly RepresentationRelation[];
  },
  parameters: Readonly<RepresentationConfig> = DEFAULT_REPRESENTATION_CONFIG,
  previous: Readonly<RepresentationHistory> = {}
): {
  nodes: RepresentationResult[];
  relations: { id: string; opacity: number }[];
  state: RepresentationHistory;
} {
  const config = validateRepresentationConfig(parameters);
  const byId = new Map(input.nodes.map((node) => [node.id, node]));
  if (byId.size !== input.nodes.length)
    throw Error("Duplicate representation Event identity");
  const candidates = input.nodes
    .filter((node) => node.visible !== false && node.inViewport !== false)
    .sort(
      (a, b) =>
        order(a.densityPriority ?? a.id, b.densityPriority ?? b.id) ||
        order(a.id, b.id)
    );
  const ranks = new Map(candidates.map((node, rank) => [node.id, rank]));
  const spans = representationStageSpans(input.nodes, config);
  const children = new Map<string, number>();
  const descendantOpacity = new Map<string, number>();
  for (const node of input.nodes) {
    if (node.kind !== "composite") continue;
    const height = config.stagedHierarchy
      ? spans.get(node.id)!
      : config.childRevealBySpan
        ? Math.max(
            node.bounds.maxX - node.bounds.minX,
            node.bounds.maxY - node.bounds.minY
          )
        : (node.childScreenHeight ?? node.bounds.maxY - node.bounds.minY);
    const reveal =
      config.childRevealHeightPx <= 0
        ? 1
        : config.stagedHierarchy &&
            config.childRevealHeightPx === 16 &&
            config.childFadeStartRatio === 0.25
          ? compositeLeafChildrenOpacity(height)
          : config.childFadeStartRatio === 1
            ? Number(height >= config.childRevealHeightPx)
            : smooth(
                (Math.min(height / config.childRevealHeightPx, 1) -
                  config.childFadeStartRatio) /
                  (1 - config.childFadeStartRatio)
              );
    const opacity = config.showChildren ? reveal : 0;
    children.set(node.id, opacity);
    if (node.visible === false) continue;
    const stack = [...(node.childIds ?? [])];
    const seen = new Set([node.id]);
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      if (
        !config.stagedHierarchy ||
        !config.showChildren ||
        byId.get(id)?.kind !== "composite"
      )
        descendantOpacity.set(
          id,
          Math.min(descendantOpacity.get(id) ?? 1, opacity)
        );
      stack.push(...(byId.get(id)?.childIds ?? []));
    }
  }
  const state: RepresentationHistory = Object.create(
    null
  ) as RepresentationHistory;
  const nodes = [...input.nodes]
    .sort((a, b) => order(a.id, b.id))
    .map((node): RepresentationResult => {
      const span =
        spans.get(node.id) ??
        Math.max(
          node.bounds.maxX - node.bounds.minX,
          node.bounds.maxY - node.bounds.minY
        );
      const pointSupport =
        config.stagedHierarchy &&
        node.kind === "composite" &&
        compositeStageSpan(
          node.bounds.maxX - node.bounds.minX,
          node.bounds.maxY - node.bounds.minY
        ) <= Number.EPSILON;
      const compact =
        node.kind === "event" ||
        pointSupport ||
        span <=
          config.compactThresholdPx +
            (previous[node.id]?.compact ? config.compactHysteresisPx : 0);
      const hullWeight =
        node.kind === "event" || pointSupport
          ? 0
          : config.hullFadePx === 0
            ? Number(span > config.compactThresholdPx)
            : smooth((span - config.compactThresholdPx) / config.hullFadePx);
      const hullStrokeOpacity = pointSupport
        ? 0
        : config.hullBorderFadePx === 0
          ? 1
          : smooth(
              (span - config.hullBorderFadeStartPx) / config.hullBorderFadePx
            );
      const rank = ranks.get(node.id);
      const prior = previous[node.id];
      const threshold =
        candidates.length <= config.normalPointCount || prior === undefined
          ? config.normalPointCount
          : config.normalPointCount +
            (prior.normal
              ? config.normalHysteresisCount
              : -config.normalHysteresisCount);
      const normal =
        rank === undefined
          ? (prior?.normal ?? true)
          : rank < Math.min(config.smallPointCount, Math.max(0, threshold));
      const densityOpacity =
        normal || rank === undefined || rank < config.smallPointCount
          ? 1
          : unit(
              1 -
                (rank - config.smallPointCount) /
                  Math.max(
                    1,
                    config.hiddenPointCount - config.smallPointCount - 1
                  )
            );
      const coverage = unit(node.viewportCoverage ?? 0);
      const surfaceOpacity =
        coverage <= config.hullSuppressCoverageStart
          ? 1
          : config.hullSuppressCoverageStart === 1
            ? 1
            : unit((1 - coverage) / (1 - config.hullSuppressCoverageStart));
      const visibility =
        node.visible === false ? 0 : (descendantOpacity.get(node.id) ?? 1);
      const hullOpacity = config.showHulls
        ? hullWeight * surfaceOpacity * visibility * config.hullOpacityScale
        : 0;
      const sizeStages =
        node.kind === "composite" &&
        config.compositePointSizeStages &&
        span > 0;
      const ordinaryWeight = sizeStages
        ? smooth(
            (span - config.smallCompositeSpanPx) /
              (config.ordinaryCompositeSpanPx - config.smallCompositeSpanPx)
          )
        : Number(normal);
      const pointVisibility = sizeStages
        ? smooth(
            (span - config.hiddenCompositeSpanPx) /
              (config.visibleCompositeSpanPx - config.hiddenCompositeSpanPx)
          )
        : config.stagedHierarchy && node.kind === "composite"
          ? 1
          : densityOpacity;
      const pointOpacity = (1 - hullWeight) * pointVisibility * visibility;
      const ordinaryPointOpacity = config.showOrdinaryPoints
        ? pointOpacity * ordinaryWeight * config.ordinaryPointOpacityScale
        : 0;
      const smallPointOpacity = config.showSmallPoints
        ? pointOpacity * (1 - ordinaryWeight) * config.smallPointOpacityScale
        : 0;
      const hullFillOpacity =
        config.hullBorderlessOpacityScale +
        (1 - config.hullBorderlessOpacityScale) * hullStrokeOpacity;
      const opacity = unit(
        hullOpacity + ordinaryPointOpacity + smallPointOpacity
      );
      const parentPointScale = config.sequentialChildPoints
        ? 0.35 + 0.65 * smooth((visibility - 0.2) / 0.6)
        : 1;
      const parentLabelWeight = config.sequentialChildPoints
        ? smooth((visibility - 0.4) / 0.5)
        : 1;
      const radiusScale =
        (sizeStages
          ? config.smallPointScale +
            (1 - config.smallPointScale) * ordinaryWeight
          : normal
            ? 1
            : config.hiddenPointScale +
              (config.smallPointScale - config.hiddenPointScale) *
                densityOpacity) * parentPointScale;
      const labelOpacity = !config.showLabels
        ? 0
        : hullOpacity * config.hullLabelOpacity +
          (ordinaryPointOpacity * config.ordinaryLabelOpacity +
            smallPointOpacity * config.smallLabelOpacity) *
            (sizeStages ? Number(normal) : 1) *
            parentLabelWeight;
      state[node.id] = { compact, normal };
      return {
        id: node.id,
        state:
          opacity <= 0.001
            ? "hidden"
            : !compact && hullOpacity > 0
              ? hullStrokeOpacity === 0
                ? "borderless-hull"
                : "hull"
              : radiusScale >= 0.999 && ordinaryPointOpacity > 0
                ? "ordinary-point"
                : smallPointOpacity + ordinaryPointOpacity > 0
                  ? "small-point"
                  : hullStrokeOpacity === 0
                    ? "borderless-hull"
                    : "hull",
        hullOpacity,
        hullStrokeOpacity,
        hullFillOpacity,
        ordinaryPointOpacity,
        smallPointOpacity,
        hiddenOpacity: 1 - opacity,
        labelOpacity,
        childrenOpacity: children.get(node.id) ?? 1,
        radiusScale,
        opacity,
        compact,
        densityRank: rank ?? null
      };
    });
  const rendered = new Map(nodes.map((node) => [node.id, node]));
  const relations = [...(input.relations ?? [])]
    .sort((a, b) => order(a.id, b.id))
    .map((relation) => ({
      id: relation.id,
      opacity:
        !config.showRelations ||
        relation.visible === false ||
        !relation.endpointIds.length
          ? 0
          : Math.min(
              ...relation.endpointIds.map(
                (id) => rendered.get(id)?.opacity ?? 0
              )
            )
    }));
  return { nodes, relations, state };
}

export const REPRESENTATION_GROUPS: readonly {
  title: string;
  description: string;
  keys: readonly (keyof RepresentationConfig)[];
}[] = [
  {
    title: "1 · 영역 단계",
    description:
      "충분히 크게 보이는 묶음 사건입니다. 영역과 이름표의 진하기를 따로 비교하세요.",
    keys: [
      "showHulls",
      "hullOpacityScale",
      "hullLabelOpacity",
      "compactThresholdPx",
      "hullFadePx",
      "compactHysteresisPx",
      "hullSuppressCoverageStart"
    ]
  },
  {
    title: "2 · 테두리 없는 영역 단계",
    description:
      "점으로 줄어들기 전에 테두리를 없애고 면을 조금 흐리게 유지합니다. 이름은 그대로 읽을 수 있습니다.",
    keys: [
      "hullBorderFadeStartPx",
      "hullBorderFadePx",
      "hullBorderlessOpacityScale"
    ]
  },
  {
    title: "3 · 보통 점 단계",
    description:
      "작게 축소된 묶음과 일반 사건이 점으로 보입니다. 점의 진하기와 이름표를 조절하세요.",
    keys: [
      "showOrdinaryPoints",
      "ordinaryPointOpacityScale",
      "ordinaryLabelOpacity",
      "normalPointCount",
      "normalHysteresisCount",
      "compositePointSizeStages",
      "ordinaryCompositeSpanPx"
    ]
  },
  {
    title: "4 · 작은 점 단계",
    description:
      "일반 사건은 밀집도에 따라, 묶음은 화면 크기에 따라 점을 줄입니다. 이름표는 기본적으로 숨깁니다.",
    keys: [
      "showSmallPoints",
      "smallPointOpacityScale",
      "smallLabelOpacity",
      "smallPointScale",
      "smallPointCount",
      "smallCompositeSpanPx"
    ]
  },
  {
    title: "5 · 숨김 단계",
    description:
      "일반 사건은 밀집 순위, 묶음은 화면 크기에 따라 점과 이름표가 사라집니다. 실제 사건이나 구성 관계는 유지합니다.",
    keys: [
      "hiddenPointCount",
      "hiddenPointScale",
      "hiddenCompositeSpanPx",
      "visibleCompositeSpanPx"
    ]
  },
  {
    title: "구성 사건·연결선·전환",
    description:
      "이름 전체 표시, 묶음 안의 사건, 연결선과 전환 시간을 함께 조절합니다. 이름은 화면 경계까지 표시하며, 서로 겹치는 이름은 일부 생략합니다.",
    keys: [
      "showLabels",
      "showChildren",
      "showRelations",
      "childRevealHeightPx",
      "childRevealBySpan",
      "stagedHierarchy",
      "sequentialChildPoints",
      "childFadeStartRatio",
      "fadeDurationMs",
      "labelFadeDurationMs"
    ]
  }
];
