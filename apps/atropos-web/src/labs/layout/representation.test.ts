import { describe, expect, it } from "vitest";
import {
  compositePointDisplay,
  compositeRepresentationDisplay
} from "../../urdr-port/src/components/composite-point-display";
import { getCompositeChildrenOpacity } from "../../urdr-port/src/components/graph-shell-composite";
import {
  DEFAULT_REPRESENTATION_CONFIG as defaults,
  evaluateRepresentationScene as evaluate,
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
    for (const span of [80, 48, 40, 32, 20, 32, 40, 48, 49, 40, 32, 40]) {
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
      expect(node.ordinaryPointOpacity).toBe(expected.pointOpacity);
      expect(node.compact).toBe(compact);
      wasCompact = compact;
      history = result.state;
    }
  });

  it("independent X/Y projection controls max-span ownership but only Y reveals children", () => {
    for (const height of [0, 57, 58, 79, 100, 300]) {
      const input = composite(300, height);
      const wide = evaluate({ nodes: [input] }).nodes[0]!;
      const narrow = evaluate({
        nodes: [{ ...input, bounds: bounds(1, height) }]
      }).nodes[0]!;
      expect(wide.childrenOpacity).toBe(
        getCompositeChildrenOpacity([
          { x: 0, y: 0 },
          { x: 300, y: height }
        ])
      );
      expect(wide.childrenOpacity).toBe(narrow.childrenOpacity);
    }
    expect(evaluate({ nodes: [composite(10, 100)] }).nodes[0]!.compact).toBe(
      false
    );
    expect(evaluate({ nodes: [composite(100, 10)] }).nodes[0]!.compact).toBe(
      false
    );
    expect(evaluate({ nodes: [composite(10)] }).nodes[0]!.compact).toBe(true);
  });

  it("propagates authored nested and overlapping suppression even with offscreen children", () => {
    const input = {
      nodes: [
        { ...composite(100, 79), id: "outer", childIds: ["nested", "shared"] },
        { ...composite(100, 100), id: "nested", childIds: ["leaf"] },
        { ...composite(100, 58), id: "overlap", childIds: ["shared"] },
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
    const result = evaluate(input);
    expect(
      result.nodes.find((node) => node.id === "leaf")!.opacity
    ).toBeCloseTo(0.5);
    expect(result.nodes.find((node) => node.id === "shared")!.state).toBe(
      "hidden"
    );
    expect(result.relations[0]!.opacity).toBe(0);
    expect(JSON.stringify(input)).toBe(before);
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
    const initial = evaluate({ nodes: [composite(20), ...points(80)] });
    const input = { nodes: [composite(40), ...points(80)] };
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
      evaluate({ nodes: [composite(32)] }, config).nodes[0]!.hullOpacity
    ).toBe(0);
    expect(
      evaluate({ nodes: [composite(33)] }, config).nodes[0]!.hullOpacity
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
