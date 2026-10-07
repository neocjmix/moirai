import { describe, expect, it } from "vitest";
import {
  compositePointDisplay,
  compositeRepresentationDisplay
} from "../../urdr-port/src/components/composite-point-display";
import {
  DEFAULT_REPRESENTATION_CONFIG as defaults,
  evaluateRepresentationScene as evaluate,
  advanceRepresentationStages,
  representationStageSpans,
  validateRepresentationConfig,
  validateRepresentationHistory,
  REPRESENTATION_GROUPS,
  REPRESENTATION_PARAMETERS,
  type RepresentationNode
} from "./representation";

const bounds = (width: number, height: number) => ({
  minX: 0,
  maxX: width,
  minY: 0,
  maxY: height
});
const composite = (width: number, height = width): RepresentationNode => ({
  id: "composite",
  kind: "composite",
  bounds: bounds(width, height)
});
const points = (count: number): RepresentationNode[] =>
  Array.from({ length: count }, (_, index) => ({
    id: String(index).padStart(3, "0"),
    kind: "event",
    bounds: bounds(0, 0)
  }));

describe("isolated research representation policy", () => {
  it("covers every parameter once in the stage controls", () => {
    const keys = REPRESENTATION_GROUPS.flatMap((group) => group.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(
      REPRESENTATION_PARAMETERS.map((p) => p.key).sort()
    );
  });

  it("adjusts hull, ordinary and small-point labels independently without changing input or hiding facts", () => {
    const input = { nodes: [composite(80), ...points(80)] };
    const source = JSON.stringify(input);
    const config = {
      ...defaults,
      hullOpacityScale: 0.5,
      hullLabelOpacity: 0.8,
      ordinaryPointOpacityScale: 0.6,
      ordinaryLabelOpacity: 0.5,
      smallPointOpacityScale: 0.7,
      smallLabelOpacity: 0.9
    };
    const result = evaluate(input, config);
    const hull = result.nodes.find((n) => n.id === "composite")!;
    expect(hull.hullOpacity).toBe(0.5);
    expect(hull.labelOpacity).toBe(0.4);
    const ordinary = result.nodes.find((n) => n.id === "000")!;
    expect(ordinary.ordinaryPointOpacity).toBe(0.6);
    expect(ordinary.labelOpacity).toBe(0.3);
    const small = result.nodes.find((n) => n.id === "070")!;
    expect(small.smallPointOpacity).toBe(0.7);
    expect(small.labelOpacity).toBeCloseTo(0.63);
    const hidden = evaluate(input, {
      ...config,
      normalPointCount: 0,
      normalHysteresisCount: 0,
      smallPointCount: 1,
      hiddenPointCount: 2
    });
    expect(hidden.nodes.find((n) => n.id === "070")!.labelOpacity).toBe(0);
    expect(JSON.stringify(input)).toBe(source);
    expect(result.state).toEqual(evaluate(input).state);
  });

  it("matches production hull blend and compact ownership in both zoom directions", () => {
    let history = {};
    let wasCompact = false;
    for (const span of [
      80, 44, 38, 32, 24, 20, 16, 12, 10, 8, 6, 3, 2, 1, 2, 6, 12, 16, 20, 21,
      32, 44
    ]) {
      const support = [
        { x: 0, y: 0 },
        { x: span, y: span }
      ];
      const result = evaluate({ nodes: [composite(span)] }, defaults, history);
      const node = result.nodes[0]!;
      const expected = compositeRepresentationDisplay(support)!;
      const compact: boolean =
        compositePointDisplay(support, wasCompact) !== null;
      expect(node.hullOpacity).toBe(expected.hullOpacity);
      expect(node.ordinaryPointOpacity + node.smallPointOpacity).toBeCloseTo(
        expected.pointOpacity * expected.pointVisibility
      );
      expect(node.radiusScale).toBeCloseTo(expected.pointScale);
      expect(node.hullFillOpacity).toBe(expected.hullFillOpacity);
      expect(node.childrenOpacity).toBeCloseTo(expected.childrenOpacity);
      expect(node.hullStrokeOpacity).toBe(expected.hullStrokeOpacity);
      expect(node.compact).toBe(compact);
      wasCompact = compact;
      history = result.state;
    }
  });

  it("keeps the colored hull and readable label after its border disappears, before shrinking to a point", () => {
    const borderless = evaluate({ nodes: [composite(32)] }).nodes[0]!;
    expect(borderless.state).toBe("borderless-hull");
    expect(borderless.hullOpacity).toBe(1);
    expect(borderless.hullFillOpacity).toBe(0.62);
    expect(borderless.hullStrokeOpacity).toBe(0);
    expect(borderless.ordinaryPointOpacity).toBe(0);
    expect(borderless.labelOpacity).toBe(0.58);
    const borderFading = evaluate({ nodes: [composite(38)] }).nodes[0]!;
    expect(borderFading.hullOpacity).toBe(1);
    expect(borderFading.hullStrokeOpacity).toBe(0.5);
    expect(borderFading.labelOpacity).toBe(borderless.labelOpacity);
    const point = evaluate({ nodes: [composite(12)] }).nodes[0]!;
    expect(point.state).toBe("ordinary-point");
    expect(point.ordinaryPointOpacity).toBe(1);
  });

  it("keeps labels visible while hull paint takes over before compact ownership releases", () => {
    let history = evaluate({ nodes: [composite(12)] }).state;
    for (const span of [12, 16, 19.99, 20, 20.01, 24]) {
      const scene = evaluate({ nodes: [composite(span)] }, defaults, history);
      const node = scene.nodes[0]!;
      expect(node.labelOpacity).toBeGreaterThanOrEqual(0.58);
      if (span === 20) {
        expect(node.compact).toBe(true);
        expect(node.state).toBe("borderless-hull");
        expect(node.ordinaryPointOpacity).toBe(0);
        expect(node.labelOpacity).toBe(0.58);
      }
      history = scene.state;
    }
  });

  it("uses the time-axis span for default reveal and retains legacy raw-span controls", () => {
    for (const span of [0, 12, 16, 28, 40, 100]) {
      const wide = evaluate({ nodes: [composite(span, 1)] }).nodes[0]!;
      const tall = evaluate({ nodes: [composite(1, span)] }).nodes[0]!;
      const expected = compositeRepresentationDisplay([
        { x: 0, y: 0 },
        { x: span, y: 1 }
      ])!;
      expect(wide.childrenOpacity).toBeCloseTo(expected.childrenOpacity);
      const expectedTall = compositeRepresentationDisplay([
        { x: 0, y: 0 },
        { x: 1, y: span }
      ])!;
      expect(tall.childrenOpacity).toBeCloseTo(expectedTall.childrenOpacity);
      const legacy = {
        ...defaults,
        stagedHierarchy: false,
        childRevealHeightPx: 40,
        childFadeStartRatio: 0.4
      };
      expect(
        evaluate({ nodes: [composite(span, 1)] }, legacy).nodes[0]!
          .childrenOpacity
      ).toBe(
        evaluate({ nodes: [composite(1, span)] }, legacy).nodes[0]!
          .childrenOpacity
      );
    }
    expect(
      evaluate({ nodes: [composite(300, 1)] }).nodes[0]!.childrenOpacity
    ).toBe(1);
    expect(evaluate({ nodes: [composite(10)] }).nodes[0]!.compact).toBe(true);
  });

  it("keeps a density-ranked Composite visible through hull, ordinary, small, and hidden size stages", () => {
    const leafPoints = points(140);
    for (const [span, state] of [
      [24, "borderless-hull"],
      [12, "ordinary-point"],
      [8, "small-point"],
      [6, "small-point"],
      [2, "small-point"],
      [1, "hidden"]
    ] as const) {
      const node = evaluate({
        nodes: [composite(span), ...leafPoints]
      }).nodes.find((node) => node.id === "composite")!;
      expect(node.state).toBe(state);
      expect(node.labelOpacity).toBe(span >= 20 ? 0.58 : 0);
      if (span > 1) expect(node.opacity).toBeGreaterThan(0);
      if (span === 6) expect(node.radiusScale).toBe(0.35);
    }
  });

  it("propagates authored nested and overlapping suppression even with offscreen children", () => {
    const input = {
      nodes: [
        { ...composite(28, 20), id: "outer", childIds: ["nested", "shared"] },
        { ...composite(40, 40), id: "nested", childIds: ["leaf"] },
        { ...composite(16, 16), id: "overlap", childIds: ["shared"] },
        {
          id: "leaf",
          kind: "event" as const,
          bounds: bounds(0, 0),
          inViewport: false
        },
        { id: "shared", kind: "event" as const, bounds: bounds(0, 0) }
      ],
      relations: [{ id: "relation", endpointIds: ["leaf", "shared"] }]
    };
    const before = JSON.stringify(input);
    const result = evaluate(input, {
      ...defaults,
      stagedHierarchy: false,
      childRevealHeightPx: 40,
      childFadeStartRatio: 0.4
    });
    expect(
      result.nodes.find((node) => node.id === "leaf")!.opacity
    ).toBeCloseTo(0.5);
    expect(result.nodes.find((node) => node.id === "shared")!.state).toBe(
      "hidden"
    );
    expect(result.relations[0]!.opacity).toBe(0);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("passes child points through a smaller unlabeled stage before the parent closes", () => {
    const sample = (span: number) =>
      evaluate({
        nodes: [
          { ...composite(span), childIds: ["child"] },
          { id: "child", kind: "event", bounds: bounds(0, 0) }
        ]
      }).nodes.find((node) => node.id === "child")!;
    const open = sample(16),
      half = sample(10),
      closed = sample(4);
    expect(open.radiusScale).toBe(1);
    expect(open.labelOpacity).toBe(1);
    expect(half.state).toBe("small-point");
    expect(half.radiusScale).toBeGreaterThan(0.35);
    expect(half.radiusScale).toBeLessThan(1);
    expect(half.labelOpacity).toBeLessThan(half.opacity);
    expect(closed.state).toBe("hidden");
  });

  it("retains zero-extent root Composites as visible points on cold restore", () => {
    expect(evaluate({ nodes: [composite(0)] }).nodes[0]!.state).toBe(
      "ordinary-point"
    );
    const node = evaluate({ nodes: [composite(0), ...points(80)] }).nodes.find(
      (node) => node.id === "composite"
    )!;
    expect(node.state).toBe("ordinary-point");
    expect(node.opacity).toBe(1);
    expect(node.radiusScale).toBe(1);
  });

  it("exposes ordinary/small/fading/hidden density ranks and retention hysteresis", () => {
    const input = { nodes: points(140) };
    const initial = evaluate(input);
    const byId = new Map(initial.nodes.map((node) => [node.id, node]));
    expect(byId.get("063")!.state).toBe("ordinary-point");
    expect(byId.get("064")!.state).toBe("small-point");
    expect(byId.get("095")!.radiusScale).toBe(0.35);
    expect(byId.get("112")!.opacity).toBeCloseTo(1 - 16 / 31);
    expect(byId.get("127")!.state).toBe("hidden");
    expect(byId.get("139")!.state).toBe("hidden");
    const normalBefore = {
      ...initial.state,
      "070": { compact: true, normal: true },
      "060": { compact: true, normal: false }
    };
    const next = evaluate(input, defaults, normalBefore);
    expect(next.nodes.find((node) => node.id === "070")!.state).toBe(
      "ordinary-point"
    );
    expect(next.nodes.find((node) => node.id === "060")!.state).toBe(
      "small-point"
    );
  });

  it("round-trips preset history exactly at hysteresis thresholds and is order-independent", () => {
    const initial = evaluate({ nodes: [composite(12), ...points(80)] });
    const input = { nodes: [composite(16), ...points(80)] };
    const config = validateRepresentationConfig(
      JSON.parse(JSON.stringify(defaults))
    );
    const history = validateRepresentationHistory(
      JSON.parse(JSON.stringify(initial.state))
    );
    const expected = evaluate(input, defaults, initial.state);
    expect(evaluate(input, config, history)).toEqual(expected);
    expect(
      evaluate({ nodes: [...input.nodes].reverse() }, config, history)
    ).toEqual(expected);
    expect(expected.state.composite!.compact).toBe(true);
    expect(evaluate(input).state.composite!.compact).toBe(false);
  });

  it("switches paint, labels, children, and relations without changing input identity or containment", () => {
    const nodes = [
      { ...composite(200), childIds: ["child"] },
      { id: "child", kind: "event" as const, bounds: bounds(0, 0) }
    ];
    const input = {
      nodes,
      relations: [{ id: "r", endpointIds: ["composite", "child"] }]
    };
    const before = JSON.stringify(input);
    expect(evaluate(input).relations[0]!.opacity).toBe(1);
    expect(
      evaluate(input, { ...defaults, showRelations: false }).relations[0]!
        .opacity
    ).toBe(0);
    expect(
      evaluate(input, { ...defaults, showLabels: false }).nodes.every(
        (node) => node.labelOpacity === 0
      )
    ).toBe(true);
    expect(
      evaluate(input, { ...defaults, showChildren: false }).nodes.find(
        (node) => node.id === "child"
      )!.state
    ).toBe("hidden");
    expect(
      evaluate(input, {
        ...defaults,
        showHulls: false,
        showOrdinaryPoints: false,
        showSmallPoints: false
      }).nodes.every((node) => node.state === "hidden")
    ).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("visibility removes density competition without reinterpreting authored child sets", () => {
    const nodes = points(80);
    const reduced = evaluate({
      nodes: nodes.map((node, rank) => ({ ...node, visible: rank >= 60 }))
    });
    expect(reduced.nodes.find((node) => node.id === "060")!.state).toBe(
      "ordinary-point"
    );
    expect(reduced.nodes.find((node) => node.id === "000")!.state).toBe(
      "hidden"
    );
    expect(reduced.nodes.map((node) => node.id)).toEqual(
      nodes.map((node) => node.id)
    );
  });

  it("handles zero-width fades and rejects malformed presets rather than changing their meaning", () => {
    const config = { ...defaults, hullFadePx: 0, childFadeStartRatio: 1 };
    expect(
      evaluate({ nodes: [composite(12)] }, config).nodes[0]!.hullOpacity
    ).toBe(0);
    expect(
      evaluate({ nodes: [composite(13)] }, config).nodes[0]!.hullOpacity
    ).toBe(1);
    expect(
      evaluate({ nodes: [composite(100)] }, config).nodes[0]!.childrenOpacity
    ).toBe(1);
    expect(() =>
      validateRepresentationConfig({ ...defaults, hiddenPointCount: 40 })
    ).toThrow("Density ranks");
    expect(() =>
      validateRepresentationConfig({ ...defaults, hullFadePx: NaN })
    ).toThrow("hullFadePx");
    expect(() =>
      validateRepresentationConfig({ ...defaults, canonicalTime: 1592 })
    ).toThrow("Unknown representation");
    expect(() =>
      validateRepresentationHistory({ x: { compact: "true", normal: true } })
    ).toThrow("history entry");
  });
});

it("keeps each Composite stage independent and its parent visible later, including malformed bounds and zero-span children", () => {
  for (const span of [100, 44, 32, 20, 12, 8, 6, 3, 2, 1, 0.5]) {
    const nodes: RepresentationNode[] = [
      { ...composite(1, span / 3), id: "parent", childIds: ["child"] },
      { ...composite(1, span), id: "child", childIds: ["leaf"] },
      { id: "leaf", kind: "event", bounds: bounds(0, 0) }
    ];
    const spans = representationStageSpans(nodes, defaults);
    expect(spans.get("parent")).toBeGreaterThanOrEqual(
      spans.get("child")! * 1.35
    );
    const result = evaluate({ nodes });
    const parent = result.nodes.find((node) => node.id === "parent")!;
    const child = result.nodes.find((node) => node.id === "child")!;
    const expected = compositeRepresentationDisplay(
      [
        { x: 0, y: 0 },
        { x: 1, y: span }
      ],
      false,
      spans.get("child")
    )!;
    expect(child.opacity).toBeCloseTo(
      expected.hullOpacity + expected.pointOpacity * expected.pointVisibility
    );
    if (parent.state === "hidden") expect(child.state).toBe("hidden");
    const zeroChild = evaluate({
      nodes: nodes.map((node) =>
        node.id === "child" ? { ...node, bounds: bounds(0, 0) } : node
      )
    });
    if (
      zeroChild.nodes.find((node) => node.id === "parent")!.state === "hidden"
    )
      expect(zeroChild.nodes.find((node) => node.id === "child")!.state).toBe(
        "hidden"
      );
  }
});

it("traverses all representation stages after a camera jump and reverses with the current camera geometry", () => {
  let prior = representationStageSpans([composite(120)], defaults);
  let history = {};
  for (const target of [0.5, 120]) {
    const seen = new Set<string>();
    for (let frame = 0; frame < 80; frame++) {
      const input = [composite(target)];
      const next = advanceRepresentationStages(input, defaults, prior, 16);
      const scene = evaluate({ nodes: next.nodes }, defaults, history);
      expect(next.nodes[0]!.bounds).toBe(input[0]!.bounds);
      seen.add(scene.nodes[0]!.state);
      history = scene.state;
      prior = next.spans;
      if (!next.active) break;
    }
    for (const state of [
      "hull",
      "borderless-hull",
      "ordinary-point",
      "small-point",
      "hidden"
    ])
      expect(seen.has(state), `${target}: ${state}`).toBe(true);
  }
  const legacy = { ...defaults, stagedHierarchy: false };
  expect(
    advanceRepresentationStages([composite(0.5)], legacy, prior, 0).active
  ).toBe(false);
  const reduced = advanceRepresentationStages(
    [composite(0.5)],
    defaults,
    prior,
    0,
    true
  );
  expect(reduced.active).toBe(false);
  expect(reduced.spans.get("composite")).toBe(0.5);
});

it("keeps co-located Composite support as a point even when its inherited stage span is large", () => {
  for (const [span, expectedState] of [
    [200, "ordinary-point"],
    [12, "ordinary-point"],
    [6, "small-point"],
    [2, "small-point"],
    [0.5, "hidden"]
  ] as const) {
    const input = {
      nodes: [
        { ...composite(0, span * 1.35), id: "parent", childIds: ["child"] },
        { ...composite(0), id: "child" }
      ]
    };
    const original = JSON.stringify(input);
    const result = evaluate(input).nodes.find((node) => node.id === "child")!;
    const expected = compositeRepresentationDisplay(
      [{ x: 0, y: 0 }],
      false,
      span
    )!;
    expect(result.state).toBe(expectedState);
    expect(result.compact).toBe(true);
    expect(result.hullOpacity).toBe(0);
    expect(result.hullStrokeOpacity).toBe(0);
    expect(result.ordinaryPointOpacity + result.smallPointOpacity).toBeCloseTo(
      expected.pointVisibility
    );
    expect(result.radiusScale).toBeCloseTo(expected.pointScale);
    expect(JSON.stringify(input)).toBe(original);
  }
  const line = evaluate({ nodes: [composite(0, 200)] }).nodes[0]!;
  expect(line.hullOpacity).toBe(1);
  expect(line.compact).toBe(false);
});
