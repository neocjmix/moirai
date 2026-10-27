import { describe, expect, it } from "vitest";
import {
  createXSimulation,
  DEFAULT_CONFIG,
  importRun,
  MAX_TICK,
  stateDigest,
  SYNTHETIC_INPUT,
  type SimulationInput
} from "./index.js";

const inert = {
  repulsionStrength: 0,
  linkStrength: 0,
  centerStrength: 0,
  collisionStrength: 0
};
const pair: SimulationInput = {
  nodes: [
    { id: "a", x: 0, y: 0, radius: 5 },
    { id: "b", x: 0, y: 6, radius: 5 }
  ],
  links: []
};

describe("X-only force simulation", () => {
  it("has a byte-identical prefix independent of the final observation horizon", () => {
    const at100 = createXSimulation(SYNTHETIC_INPUT);
    at100.tick(100);
    const long = createXSimulation(SYNTHETIC_INPUT);
    let prefix = "";
    for (let i = 1; i <= 1000; i++) {
      long.tick();
      if (i === 100) prefix = JSON.stringify(long.state());
    }
    expect(prefix).toBe(JSON.stringify(at100.state()));
    expect(long.state().tick).toBe(1000);
    expect(long.seek(100)).toEqual(at100.state());
  });
  it("replays exact earlier states after increasing and decreasing ticks", () => {
    const sim = createXSimulation(SYNTHETIC_INPUT, {
      alphaTarget: 0,
      alphaDecay: 0.012
    });
    const states = [0, 1, 19, 100, 900].map((t) => sim.seek(t));
    for (const previous of states.slice().reverse())
      expect(sim.seek(previous.tick)).toEqual(previous);
    const chunked = createXSimulation(SYNTHETIC_INPUT, {
      alphaTarget: 0,
      alphaDecay: 0.012
    });
    chunked.tick(31);
    chunked.tick(69);
    expect(chunked.state()).toEqual(states[3]);
  });
  it("preserves caller data, Event identities and exact fixed Y", () => {
    const input = structuredClone(SYNTHETIC_INPUT),
      before = JSON.stringify(input);
    Object.freeze(input.nodes);
    Object.freeze(input.links);
    Object.freeze(input);
    const sim = createXSimulation(input);
    sim.tick(1000);
    expect(JSON.stringify(input)).toBe(before);
    expect(sim.state().nodes.map((n) => [n.id, n.y])).toEqual(
      input.nodes.map((n) => [n.id, n.y])
    );
  });
  it("normalizes input ordering and isolates later caller mutations", () => {
    const input = {
      nodes: [...SYNTHETIC_INPUT.nodes].reverse(),
      links: [...SYNTHETIC_INPUT.links].reverse()
    };
    const first = createXSimulation(input),
      second = createXSimulation(SYNTHETIC_INPUT);
    input.nodes.pop();
    input.links.length = 0;
    expect(first.tick(200)).toEqual(second.tick(200));
  });
  it("separates circles by exactly the required X at fixed Y", () => {
    const sim = createXSimulation(pair, {
      ...inert,
      collisionStrength: 1,
      velocityDecay: 0
    });
    const state = sim.tick();
    expect(state.nodes.map((n) => n.x)).toEqual([-4, 4]);
    expect(state.nodes.map((n) => n.y)).toEqual([0, 6]);
    expect(sim.diagnostics().quality.collisionCount).toBe(0);
  });
  it("does not collide circles already separated along Y", () => {
    const sim = createXSimulation(
      {
        nodes: [
          { id: "a", x: 0, y: 0, radius: 5 },
          { id: "b", x: 0, y: 11, radius: 5 }
        ],
        links: []
      },
      { ...inert, collisionStrength: 1, velocityDecay: 0 }
    );
    expect(sim.tick().nodes.map((n) => n.x)).toEqual([0, 0]);
  });
  it("distinguishes excessive damping from force balance", () => {
    const sim = createXSimulation(pair, {
      ...inert,
      collisionStrength: 1,
      velocityDecay: 1,
      stabilityWindow: 4
    });
    sim.tick(4);
    const diagnostics = sim.diagnostics();
    expect(diagnostics.movement.rmsDisplacement).toBe(0);
    expect(diagnostics.movement.maxForceImpulse).toBe(4);
    expect(diagnostics.stability.status).toBe("damping-stalled");
    expect(diagnostics.quality.collisionCount).toBe(1);
  });
  it("keeps bad layout quality separate from balanced motion", () => {
    const sim = createXSimulation(pair, { ...inert, stabilityWindow: 4 });
    sim.tick(4);
    expect(sim.diagnostics().stability.status).toBe("balanced");
    expect(sim.diagnostics().quality.collisionCount).toBe(1);
  });
  it("marks cooling-induced stillness and never auto-stops", () => {
    const sim = createXSimulation(pair, {
      ...inert,
      alphaInitial: 0,
      alphaTarget: 0,
      stabilityWindow: 4
    });
    sim.tick(1000);
    expect(sim.state().tick).toBe(1000);
    expect(sim.diagnostics().stability.status).toBe("cooled");
  });
  it("does not infer force balance from a small constant alpha", () => {
    const sim = createXSimulation(
      { nodes: [{ id: "a", x: 10, y: 0, radius: 0 }], links: [] },
      {
        ...inert,
        centerStrength: 0.1,
        alphaInitial: 0.001,
        alphaTarget: 0.001,
        stabilityWindow: 20
      }
    );
    sim.tick(20);
    expect(sim.diagnostics().stability.status).toBe("cooled");
    expect(sim.state().nodes[0]!.x).toBeGreaterThan(9);
  });
  it("reports impossible fixed-Y link target distances without changing Y", () => {
    const sim = createXSimulation(
      {
        nodes: [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 0, y: 100 }
        ],
        links: [
          { id: "r", source: "a", target: "b", kind: "direct", distance: 20 }
        ]
      },
      { ...inert, linkStrength: 0.1 }
    );
    sim.tick(50);
    expect(sim.diagnostics().quality.relationStrain).toEqual([
      { kind: "direct", count: 1, rms: 80, impossibleYCount: 1 }
    ]);
    expect(sim.state().nodes.map((n) => n.y)).toEqual([0, 100]);
  });
  it("round-trips exported run and rejects a mismatched trajectory", () => {
    const sim = createXSimulation(SYNTHETIC_INPUT);
    sim.tick(100);
    const run = sim.exportRun();
    expect(importRun(JSON.parse(JSON.stringify(run))).state()).toEqual(
      sim.state()
    );
    expect(() => importRun({ ...run, stateDigest: "00000000" })).toThrow(
      "mismatch"
    );
    expect(() =>
      importRun({ ...run, config: { ...run.config, unknown: 1 } })
    ).toThrow("Unknown config");
    expect(() => importRun({ ...run, tick: MAX_TICK + 1 })).toThrow(
      "Invalid replay tick"
    );
    expect(() => importRun({ ...run, algorithm: "legacy-force" })).toThrow(
      "Unsupported"
    );
  });
  it("rejects invalid inputs and settings before touching d3", () => {
    expect(() =>
      createXSimulation({ ...pair, nodes: [pair.nodes[0]!, pair.nodes[0]!] })
    ).toThrow("Duplicate");
    expect(() =>
      createXSimulation({
        ...pair,
        links: [{ id: "r", source: "a", target: "missing" }]
      })
    ).toThrow("Invalid link");
    expect(() => createXSimulation(pair, { velocityDecay: 1.1 })).toThrow(
      "Invalid"
    );
    expect(() => createXSimulation(pair, { seed: 0xffffffff })).not.toThrow();
    expect(() => createXSimulation(pair, { alphaDecay: Number.NaN })).toThrow(
      "Invalid"
    );
    expect(() => createXSimulation(pair).seek(1.5)).toThrow("integer");
    expect(() => createXSimulation(pair).seek(-1)).toThrow("Invalid");
    expect(() => createXSimulation(pair).seek(MAX_TICK + 1)).toThrow("Invalid");
  });
  it("does not leak timing into replay state or mutate returned snapshots", () => {
    const sim = createXSimulation(SYNTHETIC_INPUT),
      before = stateDigest(sim.state());
    sim.diagnostics();
    sim.diagnostics();
    const copy = sim.state();
    copy.nodes[0]!.x = 99999;
    expect(stateDigest(sim.state())).toBe(before);
    expect(sim.exportRun().config).toEqual(DEFAULT_CONFIG);
    expect(sim.diagnostics().elapsedMs).toBeGreaterThanOrEqual(0);
  });
  it("converges a simple center force within the declared rolling window", () => {
    const sim = createXSimulation(
      { nodes: [{ id: "a", x: 100, y: 12 }], links: [] },
      { ...inert, centerStrength: 0.1, stabilityWindow: 20 }
    );
    sim.tick(300);
    expect(sim.diagnostics().stability.status).toBe("balanced");
    expect(Math.abs(sim.state().nodes[0]!.x)).toBeLessThan(0.01);
    expect(sim.state().nodes[0]!.y).toBe(12);
  });
  it("preserves exact prefixes and historical Y beyond the original demo size", () => {
    const input = {
      nodes: Array.from({ length: 539 }, (_, i) => ({
        id: `history-${i.toString().padStart(4, "0")}`,
        x: (i % 23) * 12 - 132,
        y: 223000 + Math.floor(i / 23) * 35,
        radius: 4
      })),
      links: Array.from({ length: 538 }, (_, i) => ({
        id: `relation-${i}`,
        source: `history-${i.toString().padStart(4, "0")}`,
        target: `history-${(i + 1).toString().padStart(4, "0")}`
      }))
    };
    const short = createXSimulation(input);
    short.tick(10);
    const expected = JSON.stringify(short.state());
    const long = createXSimulation(input);
    for (let i = 0; i < 10; i++) long.tick();
    expect(JSON.stringify(long.state())).toBe(expected);
    long.tick(10);
    long.seek(10);
    expect(JSON.stringify(long.state())).toBe(expected);
    expect(long.state().nodes.map((n) => [n.id, n.y])).toEqual(
      input.nodes.map((n) => [n.id, n.y])
    );
    expect(() =>
      createXSimulation({
        nodes: Array.from({ length: 2001 }, (_, i) => ({
          id: String(i),
          y: i
        })),
        links: []
      })
    ).toThrow("at most 2000");
  });
});

describe("Composite virtual hubs", () => {
  const grouped: SimulationInput = {
    nodes: [
      { id: "a", x: -20, y: 0 },
      { id: "b", x: 20, y: 0 }
    ],
    links: [],
    groups: [{ id: "g", members: ["a", "b"] }]
  };
  it("uses one hub and n springs, with independently disabled forces", () => {
    const off = createXSimulation(grouped, {
      ...inert,
      compositeAttraction: 0,
      compositeRepulsion: 0
    });
    expect(off.tick().nodes.map((n) => n.x)).toEqual([-20, 20]);
    const on = createXSimulation(grouped, {
      ...inert,
      compositeAttraction: 0.2,
      compositeRepulsion: 0
    });
    const state = on.tick();
    expect(state.hubs).toHaveLength(1);
    expect(state.nodes[0]!.x).toBeGreaterThan(-20);
    expect(state.nodes[1]!.x).toBeLessThan(20);
  });
  it("repels coincident Composite hubs and transmits separation through spokes", () => {
    const input: SimulationInput = {
      nodes: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 0, y: 0 }
      ],
      links: [],
      groups: [
        { id: "g", members: ["a"] },
        { id: "h", members: ["b"] }
      ]
    };
    const sim = createXSimulation(input, {
      ...inert,
      compositeAttraction: 0.1,
      compositeRepulsion: 24
    });
    const state = sim.tick(20);
    expect(Math.abs(state.hubs![0]!.x - state.hubs![1]!.x)).toBeGreaterThan(0);
    expect(Math.abs(state.nodes[0]!.x - state.nodes[1]!.x)).toBeGreaterThan(0);
    expect(state.nodes.every((node) => node.y === 0)).toBe(true);
    const prefix = JSON.stringify(state);
    sim.seek(100);
    expect(JSON.stringify(sim.seek(20))).toBe(prefix);
    expect(importRun(sim.exportRun()).state()).toEqual(sim.state());
  });
  it("rejects malformed and duplicate memberships", () => {
    expect(() =>
      createXSimulation({
        ...grouped,
        groups: [{ id: "g", members: ["missing"] }]
      })
    ).toThrow();
    expect(() =>
      createXSimulation({
        ...grouped,
        groups: [{ id: "g", members: ["a", "a"] }]
      })
    ).toThrow();
  });
});
