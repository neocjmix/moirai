import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import {
  candidateExperimentPrimitives,
  createTstlExperimentClient
} from "./tstl-experiment-client";
import { createTstlGraphReadLoader } from "./tstl-experiment-loader";
import {
  TSTL_EXPERIMENT_ASSET_URL,
  TSTL_EXPERIMENT_SHA256
} from "./tstl-experiment-pin";
import type {
  TstlExperimentArtifact,
  TstlExperimentMode
} from "./tstl-experiment-types";
import type { GraphReadLoader } from "../urdr-port/src/graph-read-loader";
import type { GraphShellViewportQuery } from "../urdr-port/shared/contracts";

const body = readFileSync(
  `apps/atropos-web/public${TSTL_EXPERIMENT_ASSET_URL}`,
  "utf8"
);
const artifact = JSON.parse(body) as TstlExperimentArtifact;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const workspace = {
  menuItems: [],
  tabs: [],
  canons: [],
  defaultTabId: "r56",
  navigationScopes: [
    {
      canonId: artifact.source.worldId,
      widthHint: 1800,
      bounds: artifact.bounds,
      ready: true
    }
  ]
};
const query = (selectedEntityId?: string): GraphShellViewportQuery => {
  const b = artifact.bounds;
  const dx = b.maxX - b.minX,
    dy = b.maxY - b.minY;
  return {
    canonIds: [artifact.source.worldId],
    bbox: {
      minX: b.minX - dx * 1.5,
      maxX: b.maxX + dx * 1.5,
      minY: b.minY - dy * 1.5,
      maxY: b.maxY + dy * 1.5
    },
    scale: 390 / dx,
    viewportWidth: 390,
    viewportHeight: 844,
    includeNeighbors: false,
    ...(selectedEntityId ? { selectedEntityId } : {})
  };
};
const detail = vi.fn(async () => {
  throw Error("test_detail_delegate");
});
const detailLoader: GraphReadLoader = {
  loadWorkspace: async () => workspace,
  loadViewport: async () => {
    throw Error("test_no_semantic_viewport");
  },
  loadEventDetail: detail
};
function setup() {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(body));
  const client = createTstlExperimentClient({ fetcher });
  const loader = (
    mode: TstlExperimentMode,
    collectionIds = artifact.collections.map((c) => c.id)
  ) =>
    createTstlGraphReadLoader({
      client,
      mode,
      workspace,
      worldId: artifact.source.worldId,
      revision: artifact.source.revision,
      timeSystemId: artifact.source.timeSystemId,
      collectionIds,
      relationTypes: [],
      detailLoader
    });
  return { client, fetcher, loader };
}

it("pins the immutable asset and keeps actual B0 primitives byte-for-byte in the payload", () => {
  expect(hash(body)).toBe(TSTL_EXPERIMENT_SHA256);
  const baseline = JSON.parse(
    readFileSync("scripts/tstl-research/evidence/b0.json", "utf8")
  );
  expect(artifact.b0Primitives).toEqual(baseline.primitives);
  expect(artifact.source.sourceRootDigest).toBe(
    baseline.provenance.sourceRootDigest
  );
  expect(artifact.stats).toEqual({
    events: 539,
    composites: 109,
    candidateAreaComposites: 105,
    candidateFragments: 1207,
    multiRunBands: 518
  });
});

it("preserves single Event identities and every original Event Y and Composite time boundary", () => {
  const candidate = candidateExperimentPrimitives(artifact);
  expect(candidate.map((p) => p.id)).toEqual(
    artifact.b0Primitives.map((p) => p.id)
  );
  const eventIds = candidate
    .filter((p) => p.entity.kind !== "relation")
    .map((p) => p.entity.id);
  expect(eventIds).toHaveLength(539);
  expect(new Set(eventIds).size).toBe(539);
  for (let i = 0; i < candidate.length; i++) {
    const a = candidate[i]!,
      b = artifact.b0Primitives[i]!;
    if (b.entity.kind === "composite") {
      expect(a.composite!.worldBounds.minY).toBe(b.composite!.worldBounds.minY);
      expect(a.composite!.worldBounds.maxY).toBe(b.composite!.worldBounds.maxY);
      if (artifact.a.noAreaCompositeIds.includes(a.entity.id)) {
        expect(a.geometry.kind).toBe("point");
        expect(artifact.a.contoursByCompositeId[a.entity.id]).toEqual([]);
      } else {
        expect(a.geometry).toEqual({
          kind: "polygon",
          rings: artifact.a.contoursByCompositeId[a.entity.id]
        });
      }
    } else if (b.geometry.kind === "point" && a.geometry.kind === "point") {
      expect(a.geometry.xy.y).toBe(b.geometry.xy.y);
      expect(a.geometry.xy.x).toBe(artifact.a.xByEventId[a.entity.id]);
    } else if (b.geometry.kind === "line" && a.geometry.kind === "line") {
      expect(a.geometry.paths.map((p) => p.map((v) => v.y))).toEqual(
        b.geometry.paths.map((p) => p.map((v) => v.y))
      );
    } else throw Error("unexpected fixture geometry");
  }
});

it("fetches once across B0/A, camera reads and Collection toggles with production admission", async () => {
  const { client, fetcher, loader } = setup();
  const selected = artifact.b0Primitives.find((p) => p.entity.kind === "event")!
    .entity.id;
  const b0 = loader("B0"),
    a = loader("A");
  const first = await b0.loadViewport("ko", query(selected));
  const second = await a.loadViewport("ko", query(selected));
  for (const value of [first, second]) {
    const events = [...value.entities, ...value.regions];
    expect(events.length).toBeLessThanOrEqual(160);
    expect(events.some((event) => event.id === selected)).toBe(true);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
    expect(value.revision).toBe(56);
  }
  expect(
    first.regions.every((region) => !("preparedContourMode" in region))
  ).toBe(true);
  expect(second.regions.length).toBeGreaterThan(0);
  for (const region of second.regions) {
    const original = artifact.b0Primitives.find(
      (primitive) => primitive.entity.id === region.id
    )!.composite!;
    expect(region).toMatchObject({
      preparedContourMode: "fixed",
      preparedWorldRings: artifact.a.contoursByCompositeId[region.id],
      preparedAnchor: {
        x: artifact.a.xByEventId[region.id],
        y: (original.worldBounds.minY + original.worldBounds.maxY) / 2
      },
      validationState: "warning"
    });
  }
  const empty = await loader("A", []).loadViewport("ko", query());
  expect([...empty.entities, ...empty.regions, ...empty.edges]).toEqual([]);
  b0.dispose?.();
  await expect(b0.loadViewport("ko", query())).rejects.toMatchObject({
    name: "AbortError"
  });
  await a.loadViewport("ko", query(selected));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(client.inspect().requests).toBe(1);
  client.dispose();
});

it("checks Collection membership before admission and delegates details without changing their identity", async () => {
  const { client, loader } = setup();
  const collection = artifact.collections[0]!;
  const value = await loader("A", [collection.id]).loadViewport("ko", query());
  const expected = new Set(collection.eventIds);
  expect(
    [...value.entities, ...value.regions].every((event) =>
      expected.has(event.id)
    )
  ).toBe(true);
  const id = collection.eventIds[0]!;
  await expect(loader("A").loadEventDetail("ko", id)).rejects.toThrow(
    "test_detail_delegate"
  );
  expect(detail).toHaveBeenLastCalledWith("ko", id, expect.any(AbortSignal));
  client.dispose();
});

it("rejects tampered bytes and a rehashed different source revision", async () => {
  const tampered = createTstlExperimentClient({
    fetcher: async () => new Response(body + " ")
  });
  await expect(tampered.load()).rejects.toThrow(
    "tstl_experiment_digest_mismatch"
  );
  tampered.dispose();
  const wrong = JSON.stringify({
    ...artifact,
    source: { ...artifact.source, revision: 57 }
  });
  const other = createTstlExperimentClient({
    fetcher: async () => new Response(wrong),
    expectedSha256: hash(wrong)
  });
  await expect(other.load()).rejects.toThrow("tstl_experiment_source_mismatch");
  other.dispose();
});

it("refuses a mixed World/revision adapter before starting an asset request", () => {
  const { client, fetcher } = setup();
  expect(() =>
    createTstlGraphReadLoader({
      client,
      mode: "A",
      workspace,
      worldId: artifact.source.worldId,
      revision: 57,
      timeSystemId: artifact.source.timeSystemId,
      collectionIds: [],
      relationTypes: [],
      detailLoader
    })
  ).toThrow("tstl_experiment_scope_mismatch");
  expect(fetcher).not.toHaveBeenCalled();
  client.dispose();
});
