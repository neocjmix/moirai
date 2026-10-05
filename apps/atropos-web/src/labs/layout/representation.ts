/** Research-only screen representation policy. No canonical facts or geometry
 * are produced here. A caller supplies a complete immutable authored closure,
 * projects it with its camera, and keeps this policy's small history in presets.
 */
export const REPRESENTATION_CONFIG_VERSION = "lab-representation/3";

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
      "Apply height-based reveal; switching off suppresses authored descendants."
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
    default: 20,
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
    default: 8,
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
    default: 36,
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
    default: 12,
    min: 0,
    max: 160,
    step: 1,
    description:
      "Border fade above the borderless span. Zero disables the separate border fade for legacy presets."
  },
  {
    key: "compactHysteresisPx",
    label: "Compact hysteresis (px)",
    type: "number",
    default: 8,
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
    default: 100,
    min: 0,
    max: 600,
    step: 1,
    description:
      "Y screen height for fully visible descendants. X width intentionally has no effect."
  },
  {
    key: "childFadeStartRatio",
    label: "Child fade start ratio",
    type: "number",
    default: 0.58,
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
      "Number of normal points before hysteresis. Counts composites and events together."
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
  const children = new Map<string, number>();
  const descendantOpacity = new Map<string, number>();
  for (const node of input.nodes) {
    if (node.kind !== "composite") continue;
    const height =
      node.childScreenHeight ?? node.bounds.maxY - node.bounds.minY;
    const reveal =
      config.childRevealHeightPx <= 0
        ? 1
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
      const span = Math.max(
        node.bounds.maxX - node.bounds.minX,
        node.bounds.maxY - node.bounds.minY
      );
      const compact =
        node.kind === "event" ||
        span <=
          config.compactThresholdPx +
            (previous[node.id]?.compact ? config.compactHysteresisPx : 0);
      const hullWeight =
        node.kind === "event"
          ? 0
          : config.hullFadePx === 0
            ? Number(span > config.compactThresholdPx)
            : smooth((span - config.compactThresholdPx) / config.hullFadePx);
      const hullStrokeOpacity =
        config.hullBorderFadePx === 0
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
      const pointOpacity = (1 - hullWeight) * densityOpacity * visibility;
      const ordinaryPointOpacity =
        normal && config.showOrdinaryPoints
          ? pointOpacity * config.ordinaryPointOpacityScale
          : 0;
      const smallPointOpacity =
        !normal && config.showSmallPoints
          ? pointOpacity * config.smallPointOpacityScale
          : 0;
      const opacity = unit(
        hullOpacity + ordinaryPointOpacity + smallPointOpacity
      );
      const labelOpacity = !config.showLabels
        ? 0
        : hullOpacity * config.hullLabelOpacity +
          ordinaryPointOpacity * config.ordinaryLabelOpacity +
          smallPointOpacity * config.smallLabelOpacity;
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
              : ordinaryPointOpacity > 0
                ? "ordinary-point"
                : smallPointOpacity > 0
                  ? "small-point"
                  : hullStrokeOpacity === 0
                    ? "borderless-hull"
                    : "hull",
        hullOpacity,
        hullStrokeOpacity,
        ordinaryPointOpacity,
        smallPointOpacity,
        hiddenOpacity: 1 - opacity,
        labelOpacity,
        childrenOpacity: children.get(node.id) ?? 1,
        radiusScale: normal
          ? 1
          : config.hiddenPointScale +
            (config.smallPointScale - config.hiddenPointScale) * densityOpacity,
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
      "점으로 줄어들기 전에 테두리만 사라지고 영역의 색과 이름은 남습니다.",
    keys: ["hullBorderFadeStartPx", "hullBorderFadePx"]
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
      "normalHysteresisCount"
    ]
  },
  {
    title: "4 · 작은 점 단계",
    description:
      "사건이 밀집하면 점을 줄입니다. 이름표는 기본적으로 숨기며, 여기서 켜 보는 실험이 가능합니다.",
    keys: [
      "showSmallPoints",
      "smallPointOpacityScale",
      "smallLabelOpacity",
      "smallPointScale",
      "smallPointCount"
    ]
  },
  {
    title: "5 · 숨김 단계",
    description:
      "밀집 순위가 기준을 넘으면 점과 이름표가 함께 사라집니다. 실제 사건이나 구성 관계를 삭제하지 않습니다.",
    keys: ["hiddenPointCount", "hiddenPointScale"]
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
      "childFadeStartRatio",
      "fadeDurationMs",
      "labelFadeDurationMs"
    ]
  }
];
