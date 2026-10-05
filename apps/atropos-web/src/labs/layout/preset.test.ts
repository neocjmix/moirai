import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeLayout,
  defaultLayoutSelection
} from "@moirai/graph-presentation/layout-engine";
import { createSyntheticLabSnapshot } from "./fixtures";
import { layoutGeometry, project } from "./geometry";
import { freezeSnapshot, parseLabPreset, type LabPreset } from "./preset";
import {
  DEFAULT_REPRESENTATION_CONFIG,
  REPRESENTATION_CONFIG_VERSION,
  evaluateRepresentationScene,
  type RepresentationNode
} from "./representation";

function savedExperiment(): LabPreset {
  const snapshot = createSyntheticLabSnapshot();
  const after = defaultLayoutSelection("legacy-force");
  const before = defaultLayoutSelection("deterministic-slots");
  return {
    formatVersion: "layout-lab-preset/2",
    ...after,
    parameters: { ...after.parameters, repulsion: 0.095, maxStep: 0.37 },
    worldId: snapshot.worldId,
    revision: snapshot.sourceRevision,
    servedRevision: snapshot.servedRevision,
    inputDigest: snapshot.inputDigest,
    representationConfigVersion: REPRESENTATION_CONFIG_VERSION,
    representation: {
      ...DEFAULT_REPRESENTATION_CONFIG,
      compactThresholdPx: 34,
      hullFadePx: 24,
      showRelations: false
    },
    before: {
      layout: {
        ...before,
        parameters: { slotSpacing: 220, collisionWindowYears: 0.25 }
      },
      representation: { ...DEFAULT_REPRESENTATION_CONFIG }
    },
    camera: { x: -17.25, y: 222_789.5, spanX: 1234.5, spanY: 333.75 },
    viewport: { width: 390, height: 430 },
    activeCollectionIds: ["lab-overlap"],
    includeUncollected: false,
    history: {
      before: {
        "inner-process": { compact: false, normal: true },
        "dense-070": { compact: true, normal: false }
      },
      after: {
        "inner-process": { compact: true, normal: true },
        "dense-070": { compact: true, normal: true },
        "dense-060": { compact: true, normal: false }
      }
    },
    snapshot
  };
}

const encode = (value: unknown) => JSON.stringify(value);

afterEach(() => vi.unstubAllGlobals());

describe("reproducible offline Layout Lab presets", () => {
  it("restores distinct A/B algorithms, geometry, camera, Collection selection and threshold history without reads", async () => {
    const network = vi.fn(() => {
      throw Error("Preset replay must stay offline");
    });
    vi.stubGlobal("fetch", network);
    const original = savedExperiment();
    const restored = await parseLabPreset(encode(original));
    expect(restored).toEqual(original);
    expect(network).not.toHaveBeenCalled();
    const after = computeLayout(original.snapshot.input, original);
    const before = computeLayout(
      original.snapshot.input,
      original.before.layout
    );
    expect(computeLayout(restored.snapshot.input, restored)).toEqual(after);
    expect(
      computeLayout(restored.snapshot.input, restored.before.layout)
    ).toEqual(before);
    expect(after.shapes).not.toEqual(before.shapes);
    const screenCoordinates = (preset: LabPreset) =>
      layoutGeometry(
        preset.snapshot,
        computeLayout(preset.snapshot.input, preset)
      ).map((geometry) => ({
        id: geometry.id,
        center: project(
          geometry.center,
          preset.camera,
          preset.viewport.width,
          preset.viewport.height
        )
      }));
    expect(screenCoordinates(restored)).toEqual(screenCoordinates(original));

    // Screen-space evidence at the two hysteresis bands; all IDs belong to the
    // embedded snapshot. Losing either retained state changes the next frame.
    const nodes: RepresentationNode[] = [
      ...Array.from({ length: 80 }, (_, index) => ({
        id: `dense-${String(index).padStart(3, "0")}`,
        kind: "event" as const,
        bounds: { minX: index, maxX: index, minY: 0, maxY: 0 }
      })),
      {
        id: "inner-process",
        kind: "composite",
        bounds: { minX: 0, maxX: 40, minY: 0, maxY: 40 }
      }
    ];
    const originalScene = evaluateRepresentationScene(
      { nodes },
      original.representation,
      original.history.after
    );
    expect(
      evaluateRepresentationScene(
        { nodes },
        restored.representation,
        restored.history.after
      )
    ).toEqual(originalScene);
    expect(originalScene.state["inner-process"]!.compact).toBe(true);
    expect(originalScene.state["dense-070"]!.normal).toBe(true);
    expect(originalScene.state["dense-060"]!.normal).toBe(false);
    expect(
      evaluateRepresentationScene({ nodes }, restored.representation)
    ).not.toEqual(originalScene);
    expect(
      evaluateRepresentationScene(
        { nodes },
        restored.before.representation,
        restored.history.before
      )
    ).toEqual(
      evaluateRepresentationScene(
        { nodes },
        original.before.representation,
        original.history.before
      )
    );
    const restoredAgain = await parseLabPreset(encode(restored));
    expect(restoredAgain).toEqual(restored);
  });

  it("preserves explicit all-off visibility and distinct per-algorithm parameter schemas", async () => {
    const original = savedExperiment();
    const restored = await parseLabPreset(
      encode({
        ...original,
        activeCollectionIds: [],
        includeUncollected: false
      })
    );
    expect(restored.activeCollectionIds).toEqual([]);
    expect(restored.includeUncollected).toBe(false);
    expect(restored.parameters).toHaveProperty("repulsion", 0.095);
    expect(restored.parameters).not.toHaveProperty("slotSpacing");
    expect(restored.before.layout.parameters).toEqual({
      slotSpacing: 220,
      collisionWindowYears: 0.25
    });
    expect(restored.before.layout.parameters).not.toHaveProperty("repulsion");
    expect(computeLayout(restored.snapshot.input, restored)).toEqual(
      computeLayout(original.snapshot.input, original)
    );
  });

  it("migrates a saved v1 experiment without changing its original camera, viewport or input", async () => {
    const original = savedExperiment();
    const legacy = { ...original, formatVersion: "layout-lab-preset/1" };
    const restored = await parseLabPreset(encode(legacy));
    expect(restored).toEqual(original);
    const mobile = { ...original, viewport: { width: 390, height: 320 } };
    expect(await parseLabPreset(encode(mobile))).toEqual(mobile);
    await expect(
      parseLabPreset(encode({ ...legacy, viewport: mobile.viewport }))
    ).rejects.toThrow("viewport");
  });

  it("rejects unknown versions, stale pins, digest changes and missing temporal provenance", async () => {
    const original = savedExperiment();
    const invalid = [
      { ...original, formatVersion: "layout-lab-preset/3" },
      { ...original, representationConfigVersion: "lab-representation/2" },
      { ...original, algorithmVersion: "2" },
      {
        ...original,
        before: {
          ...original.before,
          layout: { ...original.before.layout, algorithmVersion: "2" }
        }
      },
      { ...original, seed: 12 },
      { ...original, worldId: "another-world" },
      { ...original, revision: original.revision + 1 },
      { ...original, servedRevision: original.servedRevision + 1 },
      { ...original, inputDigest: "0".repeat(64) },
      {
        ...original,
        snapshot: {
          ...original.snapshot,
          input: { ...original.snapshot.input, temporalDigest: "changed" }
        }
      },
      {
        ...original,
        snapshot: {
          ...original.snapshot,
          events: original.snapshot.events.map((event, index) =>
            index ? event : { ...event, title: "Changed after export" }
          )
        }
      }
    ];
    for (const value of invalid)
      await expect(parseLabPreset(encode(value))).rejects.toThrow();
  });

  it("rejects invalid candidate parameter sets and ordered density ranks on either side", async () => {
    const original = savedExperiment();
    const invalid = [
      { ...original, algorithm: "unimplemented-packing" },
      { ...original, parameters: original.before.layout.parameters },
      {
        ...original,
        before: {
          ...original.before,
          layout: { ...original.before.layout, parameters: original.parameters }
        }
      },
      { ...original, parameters: { ...original.parameters, repulsion: -1 } },
      { ...original, parameters: { ...original.parameters, iterations: 2.5 } },
      {
        ...original,
        parameters: { ...original.parameters, unknownCoefficient: 1 }
      },
      {
        ...original,
        representation: {
          ...original.representation,
          normalPointCount: 100,
          smallPointCount: 96
        }
      },
      {
        ...original,
        representation: { ...original.representation, hiddenPointCount: 96 }
      },
      {
        ...original,
        representation: { ...original.representation, hiddenPointCount: 95 }
      },
      {
        ...original,
        before: {
          ...original.before,
          representation: {
            ...original.before.representation,
            hiddenPointCount: 96
          }
        }
      },
      {
        ...original,
        representation: { ...original.representation, compactThresholdPx: -1 }
      }
    ];
    for (const value of invalid)
      await expect(parseLabPreset(encode(value))).rejects.toThrow();
  });

  it("rejects malformed camera, viewport, Collection IDs and history instead of silently changing replay", async () => {
    const original = savedExperiment();
    const invalid = [
      { ...original, camera: { ...original.camera, spanX: 0 } },
      { ...original, camera: { ...original.camera, spanY: -1 } },
      { ...original, camera: { ...original.camera, x: null } },
      { ...original, viewport: undefined },
      { ...original, viewport: { width: 239, height: 430 } },
      { ...original, viewport: { width: 2001, height: 430 } },
      { ...original, viewport: { width: "390", height: 430 } },
      { ...original, viewport: { width: 390, height: 199 } },
      { ...original, viewport: { width: 390, height: 2001 } },
      { ...original, viewport: { width: 390, height: "320" } },
      {
        ...original,
        formatVersion: "layout-lab-preset/1",
        viewport: { width: 390, height: 480 }
      },
      { ...original, activeCollectionIds: ["unknown-collection"] },
      { ...original, includeUncollected: "false" },
      {
        ...original,
        history: {
          ...original.history,
          after: { missing: { compact: false, normal: true } }
        }
      },
      {
        ...original,
        history: {
          ...original.history,
          before: { shared: { compact: false, normal: "false" } }
        }
      }
    ];
    for (const value of invalid)
      await expect(parseLabPreset(encode(value))).rejects.toThrow();
    await expect(parseLabPreset("[]")).rejects.toThrow();
    await expect(parseLabPreset("{")).rejects.toThrow();
  });

  it("freezes imported input recursively before the browser reuses it", async () => {
    const imported = await parseLabPreset(encode(savedExperiment()));
    const frozen = freezeSnapshot(imported.snapshot);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.input.dataset.events[0])).toBe(true);
    expect(Object.isFrozen(frozen.events[0]!.childIds)).toBe(true);
    expect(() => {
      (frozen.input.dataset.events as unknown[]).push({ id: "mutation" });
    }).toThrow();
    const selection = defaultLayoutSelection();
    expect(computeLayout(frozen.input, selection)).toEqual(
      computeLayout(createSyntheticLabSnapshot().input, selection)
    );
  });
});
