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
});
