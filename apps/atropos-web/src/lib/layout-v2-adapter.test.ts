import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { computeLayout } from "@moirai/graph-presentation/layout-engine";
import {
  compileV5RenderPublication,
  resolveRenderGeometry,
  type RenderTile
} from "@moirai/graph-presentation/server";
import { createXSimulation } from "@moirai/layout-simulation";
import {
  prepareGraphSimulation,
  projectGraphSimulation
} from "./layout-v2-adapter";
import {
  snapshotDigestPayload,
  type LayoutV2Snapshot
} from "./layout-v2-types";
import { validateLayoutV2Snapshot } from "./layout-v2-validation";

const raw = JSON.parse(
  readFileSync(
    new URL(
      "../../../../scripts/layout-research/data/history-r56.json",
      import.meta.url
    ),
    "utf8"
  )
);
delete raw.input.incidence;
const snapshot: LayoutV2Snapshot = {
  ...raw,
  formatVersion: "layout-lab-v2-snapshot/1",
  baseline: computeLayout(raw.input)
};
Object.assign(snapshot, {
  inputDigest: createHash("sha256")
    .update(snapshotDigestPayload(snapshot))
    .digest("hex")
});
const selection = {
  collectionIds: snapshot.collections.map((item) => item.id),
  relationTypes: [...new Set(snapshot.relations.map((item) => item.type))]
};
const prepared = prepareGraphSimulation(snapshot);
const initial = () => createXSimulation(prepared.input, prepared.config);

describe("actual-history GraphShell v2 adapter", () => {
  it("pins r56 identities and exact original Y/X before the first tick", () => {
    expect(validateLayoutV2Snapshot(snapshot)).toBe(snapshot);
    expect(snapshot.events).toHaveLength(539);
    expect(prepared.input.nodes).toHaveLength(430);
    expect(prepared.input.source).toEqual({
      worldId: snapshot.worldId,
      revision: 56,
      digest: snapshot.inputDigest
    });
    const viewport = projectGraphSimulation(
      snapshot,
      initial().state(),
      selection
    );
    expect(viewport.entities).toHaveLength(430);
    expect(viewport.regions).toHaveLength(109);
    expect(
      new Set(
        [...viewport.entities, ...viewport.regions].map((item) => item.id)
      ).size
    ).toBe(539);
    for (const entity of viewport.entities) {
      const shape = snapshot.baseline.shapes.find(
        (item) => item.event_id === entity.id
      )!;
      if (entity.geometryKind === "point" && shape.kind === "point")
        expect(entity.position).toEqual(shape.position);
      else if (entity.geometryKind === "segment" && shape.kind === "segment") {
        expect(entity.start).toEqual(shape.start);
        expect(entity.end).toEqual(shape.end);
      } else throw Error("baseline shape mismatch");
    }
  });

  it("reuses exact production Y-sweep hull, depth, padding and world bounds at tick0", () => {
    const state = {
      world: { id: snapshot.worldId },
      events: snapshot.events,
      relations: snapshot.relations.map((r) => ({
        id: r.id,
        type: r.type,
        source_ref: { kind: "event", event_id: r.sourceId },
        target_ref: { kind: "event", event_id: r.targetId }
      })),
      eventCollectionMemberships: snapshot.events.flatMap((event) =>
        event.collectionIds.map((collection_id) => ({
          event_id: event.id,
          collection_id
        }))
      )
    } as unknown as CanonicalState;
    const publication = compileV5RenderPublication(state, snapshot.baseline);
    const primitives = new Map(
      publication.documents
        .flatMap((doc) => (JSON.parse(doc.body) as RenderTile).primitives)
        .map((p) => [p.id, p])
    );
    const viewport = projectGraphSimulation(
      snapshot,
      initial().state(),
      selection
    );
    for (const region of viewport.regions) {
      if (region.geometryKind !== "region") throw Error("expected region");
      const primitive = primitives.get(`event:${region.id}:hull`)!;
      expect(primitive).toBeDefined();
      const geometry =
        primitive.geometry.kind === "external"
          ? resolveRenderGeometry(
              publication,
              primitive,
              publication.geometryDocuments.find(
                (doc) => doc.key === (primitive.geometry as { key: string }).key
              )!.body
            )
          : primitive.geometry;
      expect(geometry.kind).toBe("polygon");
      if (geometry.kind !== "polygon") throw Error("expected polygon");
      // Published geometry crosses JSON (which canonicalizes -0 to 0);
      // compare those same public bytes rather than structured-clone signs.
      expect(JSON.stringify(region.preparedWorldHull)).toBe(
        JSON.stringify(geometry.rings[0])
      );
      expect(region.preparedPaddingProfile).toEqual(
        primitive.composite?.paddingProfile
      );
      expect(region.preparedDepth).toBe(primitive.composite?.depth);
      expect(region.worldBounds).toEqual(primitive.composite?.worldBounds);
      expect(region.childrenComplete).toBe(
        primitive.composite?.supportComplete
      );
    }
    for (const edge of viewport.edges) {
      if (edge.geometryKind !== "segment") throw Error("expected edge");
      const primitive = primitives.get(`relation:${edge.id}`)!;
      const geometry =
        primitive.geometry.kind === "external"
          ? resolveRenderGeometry(
              publication,
              primitive,
              publication.geometryDocuments.find(
                (doc) => doc.key === (primitive.geometry as { key: string }).key
              )!.body
            )
          : primitive.geometry;
      if (geometry.kind !== "line") throw Error("expected line");
      expect([edge.start, edge.end]).toEqual(geometry.paths[0]);
    }
  }, 30000);

  it("rejects malformed or incomplete baseline geometry before simulation", () => {
    for (const mutate of [
      (value: LayoutV2Snapshot) => {
        (value.baseline.shapes as unknown[])[0] = null;
      },
      (value: LayoutV2Snapshot) => {
        (value.baseline.shapes as unknown[]).pop();
      },
      (value: LayoutV2Snapshot) => {
        const region = value.baseline.shapes.find(
          (shape) => shape.kind === "region"
        )!;
        if (region.kind === "region")
          Object.assign(region.bounds, { minX: region.bounds.maxX + 1 });
      }
    ]) {
      const changed = structuredClone(snapshot);
      mutate(changed);
      expect(() => validateLayoutV2Snapshot(changed)).toThrow(
        /lab_snapshot_(schema|semantics)_invalid/
      );
    }
  });

  it("changes only X, preserves source and replays the exact prefix with shared IDs deduplicated", () => {
    const before = JSON.stringify(snapshot),
      a = initial(),
      b = initial();
    a.tick(20);
    b.tick(200);
    b.seek(20);
    expect(JSON.stringify(a.state())).toBe(JSON.stringify(b.state()));
    const viewport = projectGraphSimulation(snapshot, a.state(), selection);
    const initialViewport = projectGraphSimulation(
      snapshot,
      initial().state(),
      selection
    );
    expect(JSON.stringify(viewport)).not.toBe(JSON.stringify(initialViewport));
    for (const entity of viewport.entities) {
      const original = initialViewport.entities.find(
        (item) => item.id === entity.id
      )!;
      if (entity.geometryKind === "point" && original.geometryKind === "point")
        expect(entity.position.y).toBe(original.position.y);
      if (
        entity.geometryKind === "segment" &&
        original.geometryKind === "segment"
      )
        expect([entity.start.y, entity.end.y]).toEqual([
          original.start.y,
          original.end.y
        ]);
    }
    for (const region of viewport.regions)
      if (region.geometryKind === "region") {
        const original = snapshot.baseline.shapes.find(
          (shape) => shape.event_id === region.id
        )!;
        if (original.kind === "region")
          expect([region.worldBounds.minY, region.worldBounds.maxY]).toEqual([
            original.bounds.minY,
            original.bounds.maxY
          ]);
      }
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(
      projectGraphSimulation(snapshot, a.state(), {
        ...selection,
        collectionIds: []
      }).entities
    ).toHaveLength(0);
    expect(
      projectGraphSimulation(snapshot, a.state(), {
        ...selection,
        collectionIds: []
      }).regions
    ).toHaveLength(0);
    const tampered = a.state();
    tampered.nodes[0]!.y += 1;
    expect(() => projectGraphSimulation(snapshot, tampered, selection)).toThrow(
      "temporal_mismatch"
    );
  });
});
