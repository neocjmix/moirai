import { describe, expect, it } from "vitest";
import { buildPublicationArtifacts } from "@moirai/publication";
import { queryFromPublicationDocuments } from "@moirai/graph-query";
import type { CanonicalRevisionView } from "@moirai/projections";
import type { PublicRelation } from "@moirai/contracts";
import {
  buildSpatialArtifacts,
  publishSpatialArtifacts,
  type SpatialMeta
} from "./artifacts.js";
import { projectPresentationInput } from "./index.js";
import { layoutPresentationScope } from "./semantic-layout.js";

const relation = (
  id: string,
  type: PublicRelation["type"],
  a: string,
  b: string
): PublicRelation => ({
  id,
  type,
  world_id: "w",
  canon_memberships: ["k"],
  source_ref: { kind: "event", event_id: a },
  target_ref: { kind: "event", event_id: b },
  direction: "directed",
  attributes: {}
});
function fixture() {
  const relations = [
    relation("ab", "precedes", "a", "b"),
    relation("ia", "contains", "inner", "a"),
    relation("ib", "contains", "inner", "b"),
    relation("oi", "contains", "outer", "inner"),
    relation("cause", "causes", "c", "d")
  ];
  const view: CanonicalRevisionView = {
    world: { id: "w", slug: "w", title: "World", description: null },
    canons: [
      { id: "k", world_id: "w", slug: "k", title: "Canon", description: null }
    ],
    events: ["a", "b", "c", "d", "outer", "inner"].map((id) => ({
      id,
      world_id: "w",
      canon_memberships: ["k"],
      slug: null,
      kind: id === "outer" || id === "inner" ? "composite" : "atomic",
      title: id,
      summary: null,
      roles: [],
      attributes: {}
    })),
    relations,
    timeSystems: [],
    canonTimeSystems: [],
    eventCanonMemberships: ["a", "b", "c", "d", "outer", "inner"].map(
      (event_id) => ({ event_id, canon_id: "k" })
    ),
    relationCanonMemberships: relations.map((r) => ({
      relation_id: r.id,
      canon_id: "k"
    })),
    narratives: []
  };
  const artifacts = buildPublicationArtifacts(view, 4, "2026-09-12T00:00:00Z");
  const result = queryFromPublicationDocuments(
    artifacts.manifestBody,
    artifacts.documents
  )!;
  return { artifacts, result };
}
describe("M4.6-C Publication spatial producer", () => {
  it("preserves relative order, deepest-first nesting, and unplaced causal-only Events", () => {
    const { result } = fixture();
    const input = projectPresentationInput(result);
    const scope = input.scopes[0]!;
    const layout = layoutPresentationScope(input, scope);
    const instance = (id: string) =>
      scope.nodes.find(
        (n) => n.reference.kind === "event" && n.reference.event_id === id
      )!.id;
    const a = layout.chartPlane.entities.find(
      (e) => e.eventId === instance("a") && e.geometryKind === "point"
    );
    const b = layout.chartPlane.entities.find(
      (e) => e.eventId === instance("b") && e.geometryKind === "point"
    );
    expect(a?.geometryKind).toBe("point");
    expect(b?.geometryKind).toBe("point");
    if (a?.geometryKind === "point" && b?.geometryKind === "point")
      expect(a.position.y).toBeLessThan(b.position.y);
    expect(layout.unplaced).toEqual(
      expect.arrayContaining([instance("c"), instance("d")])
    );
    const inner = layout.chartPlane.entities.find(
      (e) => e.eventId === instance("inner") && e.geometryKind === "region"
    );
    const outer = layout.chartPlane.entities.find(
      (e) => e.eventId === instance("outer") && e.geometryKind === "region"
    );
    expect(inner?.geometryKind).toBe("region");
    expect(outer?.geometryKind).toBe("region");
    if (inner?.geometryKind === "region" && outer?.geometryKind === "region") {
      expect(outer.worldBounds.minY).toBeLessThanOrEqual(
        inner.worldBounds.minY
      );
      expect(outer.worldBounds.maxY).toBeGreaterThanOrEqual(
        inner.worldBounds.maxY
      );
    }
  });
  it("creates byte-stable versioned docs without mutating the Publication or lossless sidecar", () => {
    const { artifacts, result } = fixture();
    const before = JSON.stringify({ artifacts, result });
    const first = buildSpatialArtifacts(result, artifacts.manifestBody);
    expect(buildSpatialArtifacts(result, artifacts.manifestBody)).toEqual(
      first
    );
    expect(JSON.stringify({ artifacts, result })).toBe(before);
    expect(
      first.documents.every((d) =>
        d.key.includes("/revisions/4/presentation/urdr-0267c8f-moirai-v1/")
      )
    ).toBe(true);
    expect(
      JSON.parse(
        first.documents.find((d) => d.key.endsWith("/sidecar.json"))!.body
      )
    ).toEqual(result);
    const meta = JSON.parse(
      first.documents.find((d) => d.key.endsWith("/meta.json"))!.body
    ) as SpatialMeta;
    expect(meta.bandSize).toBe(4096);
    expect(meta.widthHint).toBeGreaterThanOrEqual(1800);
    expect(meta.objects.some((o) => o.artifactClass === "region")).toBe(true);
  });
  it("publishes its manifest last, replays identical objects, rejects conflicts and revision mismatch", async () => {
    const { artifacts, result } = fixture();
    const bundle = buildSpatialArtifacts(result, artifacts.manifestBody);
    const values = new Map<string, string>();
    const order: string[] = [];
    const store = {
      get: async (key: string) => ({
        status: values.has(key) ? 200 : 404,
        body: values.get(key) ?? null
      }),
      put: async (key: string, body: string) => {
        order.push(key);
        if (values.has(key)) return { status: 412 };
        values.set(key, body);
        return { status: 201 };
      }
    };
    await publishSpatialArtifacts(store, bundle);
    expect(order.at(-1)).toBe(bundle.manifestKey);
    await publishSpatialArtifacts(store, bundle);
    expect([...values.keys()].some((k) => k.endsWith("/current.json"))).toBe(
      false
    );
    values.set(bundle.documents[0]!.key, "conflicting");
    await expect(publishSpatialArtifacts(store, bundle)).rejects.toThrow(
      "spatial_immutable_conflict"
    );
    expect(() =>
      buildSpatialArtifacts(
        {
          ...result,
          revision_vector: [{ world_id: "other", served_revision: 4 }]
        },
        artifacts.manifestBody
      )
    ).toThrow("spatial_revision_mismatch");
  });
});
