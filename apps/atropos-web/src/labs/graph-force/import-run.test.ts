import { describe, expect, it } from "vitest";
import {
  createXSimulation,
  type SimulationInput
} from "@moirai/layout-simulation";
import { prepareGraphRunImport } from "./import-run";

const input: SimulationInput = {
  source: { worldId: "history", revision: 56, digest: "pinned-public-input" },
  nodes: [
    { id: "a", x: 0, y: 100, radius: 5 },
    { id: "b", x: 0, y: 100, radius: 5 },
    { id: "c", x: 4, y: 120, radius: 5 }
  ],
  links: [{ id: "ab", source: "a", target: "b", kind: "causes" }]
};

describe("GraphShell imported replay", () => {
  it("validates first, then verifies exact state after incremental replay", () => {
    const original = createXSimulation(input);
    original.tick(100);
    const run = original.exportRun();
    const imported = prepareGraphRunImport(
      input,
      JSON.parse(JSON.stringify(run))
    );
    expect(imported.simulation.state().tick).toBe(0);
    expect(imported.tick).toBe(100);
    for (let i = 0; i < 10; i++) imported.simulation.tick(10);
    expect(imported.verify(imported.simulation.state())).toBe(run.stateDigest);
  });

  it("rejects a different source or initial coordinates", () => {
    const run = createXSimulation(input).exportRun();
    expect(() =>
      prepareGraphRunImport(input, {
        ...run,
        input: { ...run.input, source: { ...run.input.source, revision: 57 } }
      })
    ).toThrow("different World");
    expect(() =>
      prepareGraphRunImport(input, {
        ...run,
        input: {
          ...run.input,
          nodes: run.input.nodes.map((n) => ({ ...n, y: n.y + 1 }))
        }
      })
    ).toThrow("different World");
  });

  it("rejects incomplete configuration and invalid iteration targets", () => {
    const run = createXSimulation(input).exportRun();
    expect(() => prepareGraphRunImport(input, { ...run, config: {} })).toThrow(
      "complete"
    );
    expect(() => prepareGraphRunImport(input, { ...run, tick: 10001 })).toThrow(
      "tick"
    );
    expect(() => prepareGraphRunImport(input, { ...run, tick: 1.5 })).toThrow(
      "tick"
    );
  });

  it("does not trust a digest without the exact exported result", () => {
    const run = createXSimulation(input).exportRun();
    const imported = prepareGraphRunImport(input, {
      ...run,
      state: {
        ...run.state,
        nodes: run.state.nodes.map((n) => ({ ...n, x: n.x + 1 }))
      }
    });
    expect(() => imported.verify(imported.simulation.state())).toThrow(
      "does not reproduce"
    );
  });

  it("accepts large bounded replay metadata without synchronously executing ticks", () => {
    const worldInput = {
      nodes: Array.from({ length: 430 }, (_, i) => ({ id: String(i), y: i })),
      links: []
    };
    const run = createXSimulation(worldInput).exportRun();
    const imported = prepareGraphRunImport(worldInput, { ...run, tick: 1000 });
    expect(imported.tick).toBe(1000);
    expect(imported.simulation.state().tick).toBe(0);
    expect(() => imported.verify(imported.simulation.state())).toThrow(
      "does not reproduce"
    );
  });
});
