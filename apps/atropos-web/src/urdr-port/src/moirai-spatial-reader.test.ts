import { describe, expect, it } from "vitest";
import type {
  MoiraiGraphQueryResult,
  MoiraiGraphSource
} from "@moirai/contracts";
import {
  projectPresentationInput,
  presentationScopeKey
} from "@moirai/graph-presentation";
import { bakeSpatialArtifacts } from "@moirai/graph-presentation/server";
import { fullPublicationQuery } from "@moirai/graph-query";
import type { GraphShellChartPlaneEntity as Entity } from "../shared/contracts";
import { createMoiraiSpatialReader } from "./moirai-spatial-reader";
const source: MoiraiGraphSource = {
  world_id: "w",
  served_revision: 4,
  canon_ids: ["k"],
  time_systems: []
};
const scopeId = presentationScopeKey({
  world_id: "w",
  served_revision: 4,
  canon_id: "k"
});
const point = (id: string, y: number): Entity => ({
  id,
  eventId: id,
  canonId: scopeId,
  label: id,
  geometryKind: "point",
  position: { x: 0, y },
  contains: [],
  diagnostics: [],
  validationState: "ok",
  viewportClass: "visible"
});
const query = (minY = 0, maxY = 100) => ({
  canonIds: [scopeId],
  bbox: { minX: -100, maxX: 100, minY, maxY },
  scale: 1,
  viewportWidth: 390,
  viewportHeight: 844,
  includeNeighbors: false
});
function fixture(entities: Entity[]) {
  const q = fullPublicationQuery([
    { worldId: "w", servedRevision: 4, canon: { id: "k" }, timeSystems: [] }
  ] as unknown as Parameters<typeof fullPublicationQuery>[0]);
  const result: MoiraiGraphQueryResult = {
    contract_version: 3,
    query: q,
    revision_vector: [{ world_id: "w", served_revision: 4 }],
    compatibility: [],
    time_systems: [],
    events: [],
    relations: [],
    virtual_time_events: [],
    subjects: [],
    composites: [],
    states: [],
    narratives: [],
    evidence: [],
    diagnostics: [],
    algorithm_versions: {},
    source_artifact_digests: {},
    completeness: "complete",
    budget: {
      ...q.budget,
      returned_entities: 0,
      returned_relations: 0,
      returned_evidence: 0,
      truncated: false,
      next_scope_hint: null
    }
  };
  const scope = projectPresentationInput(result).scopes[0]!;
  // Whitespace deliberately differs from JSON.stringify: digests bind exact bytes.
  const manifest = JSON.stringify(
    { world_id: "w", served_revision: 4, completeness: "complete" },
    null,
    2
  );
  const bundle = bakeSpatialArtifacts(result, manifest, [
    {
      scope,
      chartPlane: {
        entities,
        diagnostics: [],
        timeSystemId: "display",
        compatibilityKey: "display"
      },
      diagnostics: [],
      unplaced: []
    }
  ]);
  const values = new Map([
    ...bundle.documents.map((d) => [d.key, d.body] as const),
    [bundle.manifestKey, bundle.manifestBody],
    ["worlds/w/revisions/4/manifest.json", manifest]
  ]);
  const reads: string[] = [];
  const reader = createMoiraiSpatialReader(async (key) => {
    reads.push(key);
    return {
      status: values.has(key) ? 200 : 404,
      body: values.get(key) ?? null
    };
  });
  return { reader, values, reads };
}
const cells = (
  r: Awaited<
    ReturnType<ReturnType<typeof createMoiraiSpatialReader>["viewport"]>
  >
) => [...r.viewport.entities, ...r.viewport.edges, ...r.viewport.regions];
describe("M4.6-D revision-pinned spatial reader", () => {
  it("changes bands on pan, reuses immutable cache, and binds exact manifest bytes", async () => {
    const { reader, reads } = fixture([
      point("near", 10),
      point("far", 4096 * 8)
    ]);
    const first = await reader.viewport({
      sources: [source],
      viewport: query()
    });
    expect(cells(first).map((e) => e.id)).toEqual(["near"]);
    const count = reads.length;
    await reader.viewport({ sources: [source], viewport: query() });
    expect(reads).toHaveLength(count);
    const far = await reader.viewport({
      sources: [source],
      viewport: query(4096 * 8, 4096 * 8 + 100)
    });
    expect(cells(far).map((e) => e.id)).toEqual(["far"]);
    expect(far.reads.keys).not.toEqual(first.reads.keys);
    expect(reads.some((k) => k.endsWith("/current.json"))).toBe(false);
  });
  it("retains offscreen selection, neighbors and nested parent regions", async () => {
    const child = { ...point("child", 4096 * 9), containedBy: "inner" };
    const sibling = { ...point("sibling", 4096 * 10), containedBy: "inner" };
    const region = (
      id: string,
      contains: string[],
      parent?: string
    ): Entity => ({
      ...point(id, 0),
      geometryKind: "region",
      contains,
      containedBy: parent,
      worldBounds: { minX: -10, maxX: 10, minY: 4096 * 8, maxY: 4096 * 11 }
    });
    const { reader } = fixture([
      child,
      sibling,
      region("inner", ["child", "sibling"], "outer"),
      region("outer", ["inner"])
    ]);
    const r = await reader.viewport({
      sources: [source],
      viewport: {
        ...query(),
        selectedEntityId: "child",
        includeNeighbors: true
      }
    });
    expect(
      cells(r)
        .map((e) => e.id)
        .sort()
    ).toEqual(["child", "inner", "outer"]);
    // The original closure retains child regions, not every offscreen sibling point.
    const parentSelected = await reader.viewport({
      sources: [source],
      viewport: {
        ...query(),
        selectedEntityId: "inner",
        includeNeighbors: true
      }
    });
    expect(
      cells(parentSelected)
        .map((e) => e.id)
        .sort()
    ).toEqual(["child", "inner", "outer", "sibling"]);
    expect(r.viewport.truncated).toBe(false);
  });
  it("retries a missing object without poisoning cache and isolates missing revisions", async () => {
    const { reader, values } = fixture([point("near", 10)]);
    const key = [...values.keys()].find(
      (k) => k.includes("/objects/") && k.endsWith("/point.json")
    )!;
    const body = values.get(key)!;
    values.delete(key);
    const missing = await reader.viewport({
      sources: [source],
      viewport: query()
    });
    expect(missing.viewport.truncated).toBe(true);
    expect(missing.diagnostics.map((d) => d.code)).toContain(
      "m46_spatial_partial_missing"
    );
    values.set(key, body);
    const other = { ...source, world_id: "unavailable", served_revision: 17 };
    const otherScope = presentationScopeKey({
      world_id: other.world_id,
      served_revision: 17,
      canon_id: "k"
    });
    const restored = await reader.viewport({
      sources: [source, other],
      viewport: { ...query(), canonIds: [scopeId, otherScope] }
    });
    expect(cells(restored).map((e) => e.id)).toEqual(["near"]);
    expect(restored.revision_vector).toEqual([
      { world_id: "w", served_revision: 4 },
      { world_id: "unavailable", served_revision: 17 }
    ]);
    expect(restored.diagnostics.map((d) => d.code)).toContain(
      "m46_spatial_source_missing"
    );
  });
  it("rejects a poisoned object digest before exposing geometry", async () => {
    const { reader, values } = fixture([point("near", 10)]);
    const key = [...values.keys()].find((k) => k.includes("/objects/"))!;
    values.set(key, values.get(key)!.replace('"near"', '"poisoned"'));
    const r = await reader.viewport({ sources: [source], viewport: query() });
    expect(cells(r)).toHaveLength(0);
    expect(r.viewport.truncated).toBe(true);
  });
  it("bounds a dense response before the renderer cap and prioritizes selection", async () => {
    const { reader } = fixture(
      Array.from({ length: 3000 }, (_, i) => point(`p${i}`, 10))
    );
    const r = await reader.viewport({
      sources: [source],
      viewport: { ...query(), selectedEntityId: "p2999" },
      maxEntities: 999999
    });
    expect(cells(r).length).toBeLessThanOrEqual(2500);
    expect(cells(r)[0]!.id).toBe("p2999");
    expect(r.viewport.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThanOrEqual(
      1024 * 1024
    );
  });
  it("loads bounded bands from a 100k geometry fixture and explores a distant viewport", async () => {
    const { reader, reads } = fixture(
      Array.from({ length: 100000 }, (_, i) => point(`p${i}`, i * 100))
    );
    const first = await reader.viewport({
      sources: [source],
      viewport: query()
    });
    const far = await reader.viewport({
      sources: [source],
      viewport: query(9_999_000, 10_000_000)
    });
    expect(cells(first).length).toBeLessThan(100);
    expect(cells(far).map((e) => e.id)).toContain("p99999");
    expect(first.reads.objects + far.reads.objects).toBeLessThan(12);
    expect(
      reads.some(
        (k) => k.endsWith("/index.json") || k.endsWith("/sidecar.json")
      )
    ).toBe(false);
  }, 30000);
});
