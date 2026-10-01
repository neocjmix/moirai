import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import type { V5WorldLayout } from "../../../../../../../packages/graph-presentation/src/v5-world-layout.js";
import { compileV5RenderPublication } from "@moirai/graph-presentation/server";
import {
  buildV5RenderGeneration,
  publishV5RenderGeneration
} from "@moirai/publication/v5";
import { createV5RenderViewportClient } from "../../../../lib/v5-render-viewport-client.js";
const readObject = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/publication", () => ({
  readPublicationObject: readObject
}));
import { POST } from "./route.js";

const worldId = "01995c2a-7b00-7000-8000-000000000101";
const revision = 7;
const uuid = (n: number) =>
  `01995c2a-7b00-7000-8000-${String(n).padStart(12, "0")}`;
const collectionIds = Array.from({ length: 30 }, (_, i) => uuid(1_000_000 + i));
const hash = (body: string) => createHash("sha256").update(body).digest("hex");
const viewport = { minX: 0, maxX: 1024, minY: 0, maxY: 2048 };
const panned = { minX: 512, maxX: 1536, minY: 0, maxY: 2048 };

/** The canonical root is an authenticated read-boundary fixture. This benchmark
 * intentionally starts at the real render compiler, not canonical projection,
 * database replay, transport latency, or mobile paint. Everything from render
 * compilation through immutable generation publication, HTTP handler and client
 * cache is production code; only the backing object store/fetch transport is in memory. */
function source(count: number, sharedMemberships = false) {
  const events = Array.from({ length: count }, (_, i) => ({
    id: uuid(i + 1),
    world_id: worldId,
    slug: null,
    title: `Synthetic Event ${String(i).padStart(6, "0")}`,
    summary: null,
    roles: [],
    attributes: {}
  }));
  const compositeId = events[120]!.id;
  const state: CanonicalState = {
    world: {
      id: worldId,
      slug: "synthetic-render-benchmark",
      title: "Synthetic Render Benchmark",
      description: null
    },
    events,
    collections: collectionIds.map((id, i) => ({
      id,
      world_id: worldId,
      slug: `synthetic-${i}`,
      title: `Synthetic Collection ${i}`,
      description: null
    })),
    eventCollectionMemberships: events.flatMap((event, i) =>
      (sharedMemberships || i === 120
        ? collectionIds
        : [collectionIds[i % 30]!]
      ).map((collection_id) => ({ event_id: event.id, collection_id }))
    ),
    relations: Array.from({ length: 120 }, (_, i) => ({
      id: uuid(2_000_000 + i),
      world_id: worldId,
      type: "contains" as const,
      direction: "directed" as const,
      source_ref: { kind: "event" as const, event_id: compositeId },
      target_ref: { kind: "event" as const, event_id: events[i]!.id },
      attributes: {}
    })),
    narratives: [],
    timeSystems: [],
    collectionTimeSystems: []
  };
  const shapes: V5WorldLayout["shapes"] = events.map((event, i) => {
    if (i === 120)
      return {
        event_id: event.id,
        kind: "region",
        bounds: { minX: 50, maxX: 1354, minY: 100, maxY: 740 }
      };
    if (i < 120)
      return {
        event_id: event.id,
        kind: "point",
        position: {
          x: Math.floor(i / 40) * 512 + 50 + (i % 8) * 40,
          y: 100 + Math.floor((i % 40) / 8) * 160
        }
      };
    if (i === 121)
      return {
        event_id: event.id,
        kind: "point",
        position: { x: 10_000_000, y: 10_000_000 }
      };
    // Repeated distant positions exercise approved density culling. Every 1000
    // additional distant Events adds a new cell group, so index/storage grows too.
    const group = Math.floor((i - 122) / 1000);
    return {
      event_id: event.id,
      kind: "point",
      position: {
        x: 5_000_000 + (group % 10) * 2048,
        y: 5_000_000 + Math.floor(group / 10) * 8192
      }
    };
  });
  return {
    state,
    layout: {
      world_id: worldId,
      revision,
      time_system_id: "benchmark",
      algorithm_version: "v5-world-layout/1",
      temporal_digest: "synthetic",
      unplaced_event_ids: [],
      diagnostics: [],
      shapes
    } satisfies V5WorldLayout
  };
}

async function setup(
  count: number,
  sharedMemberships = false,
  transform?: (input: ReturnType<typeof source>) => ReturnType<typeof source>
) {
  const initial = source(count, sharedMemberships);
  const { state, layout } = transform ? transform(initial) : initial;
  const rootKey = `worlds/${worldId}/revisions/${revision}/v5/complete/manifest.json`;
  const rootBody = JSON.stringify({
    format_version: "v5-staging-index/1",
    world_id: worldId,
    revision,
    completeness: "complete"
  });
  const entries = new Map<string, string>([
    [rootKey, rootBody],
    [
      `worlds/${worldId}/current.json`,
      JSON.stringify({
        format_version: "v5-publication/1",
        world_id: worldId,
        served_revision: revision,
        current_revision: revision,
        publication_target_revision: revision,
        projection_status: "ready",
        manifest_key: rootKey,
        manifest_sha256: hash(rootBody),
        generated_at: "2026-10-01T00:00:00Z"
      })
    ]
  ]);
  const reads: string[] = [];
  const store = {
    get: async (key: string) => {
      reads.push(key);
      return {
        status: entries.has(key) ? 200 : 404,
        body: entries.get(key) ?? null,
        etag: entries.has(key) ? hash(entries.get(key)!) : null
      };
    },
    put: async (
      key: string,
      body: string,
      options?: { immutable?: boolean; ifMatch?: string; ifNoneMatch?: boolean }
    ) => {
      const old = entries.get(key);
      if (
        (options?.immutable && old !== undefined) ||
        (options?.ifNoneMatch && old !== undefined) ||
        (options?.ifMatch && (!old || hash(old) !== options.ifMatch))
      )
        return { status: 412, etag: old ? hash(old) : null };
      entries.set(key, body);
      return { status: 201, etag: hash(body) };
    }
  };
  const compile = (nextLayout = layout) => {
    const started = performance.now();
    const publication = compileV5RenderPublication(state, nextLayout);
    const { documents, geometryDocuments, ...manifest } = publication;
    const generation = buildV5RenderGeneration({
      worldId,
      revision,
      sourceRootSha256: hash(rootBody),
      render: [
        {
          timeSystemId: "benchmark",
          manifest: {
            key: `worlds/${worldId}/revisions/${revision}/v5/render/benchmark/manifest.json`,
            body: JSON.stringify(manifest)
          },
          documents: [...documents, ...geometryDocuments]
        }
      ]
    });
    return { generation, compileMs: Math.round(performance.now() - started) };
  };
  const { generation, compileMs } = compile();
  await publishV5RenderGeneration(store, generation);
  reads.length = 0;
  readObject.mockImplementation(store.get);
  const requests: {
    kind: string;
    status: number;
    bytes: number;
    storeReads: number;
  }[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { kind: string };
    const before = reads.length;
    const response = await POST(
      new Request("http://benchmark/graph/v5/render", init)
    );
    const text = await response.clone().text();
    requests.push({
      kind: body.kind,
      status: response.status,
      bytes: Buffer.byteLength(text),
      storeReads: reads.length - before
    });
    return response;
  };
  const client = createV5RenderViewportClient({
    worldId,
    revision,
    timeSystemId: "benchmark",
    fetcher
  });
  return {
    client,
    requests,
    reads,
    entries,
    store,
    compile,
    layout,
    compileMs,
    publicationDocuments: generation.documents.length + 1,
    publicationBytes: [...generation.documents, generation.root].reduce(
      (sum, doc) => sum + Buffer.byteLength(doc.body),
      0
    )
  };
}

type Measurement = {
  httpRequests: number;
  responseBytes: number;
  storeReads: number;
  metadataPrimitives: number;
  scenePrimitives: number;
  cacheBytes: number;
};
describe("ADR-012 compile-to-client synthetic scale benchmark", () => {
  it("keeps identical local metadata and bounded reads at 1k/10k/100k with 30 Collections", async () => {
    const measurements: {
      events: number;
      compileMs: number;
      publicationDocuments: number;
      publicationBytes: number;
      cold: Measurement;
      warm: Measurement;
      toggle: Measurement;
      pan: Measurement;
    }[] = [];
    let canonicalLocal: string | undefined;
    for (const count of [1000, 10000, 100000]) {
      const fixture = await setup(count);
      const measure = async (
        box: typeof viewport,
        selection = collectionIds
      ) => {
        const before = fixture.requests.length;
        const result = await fixture.client.load(
          box,
          selection,
          undefined,
          undefined,
          { scaleX: 1, scaleY: 1, visibleViewport: box }
        );
        const calls = fixture.requests.slice(before);
        expect(calls.every((call) => call.status === 200)).toBe(true);
        return {
          result,
          metrics: {
            httpRequests: calls.length,
            responseBytes: calls.reduce((n, call) => n + call.bytes, 0),
            storeReads: calls.reduce((n, call) => n + call.storeReads, 0),
            metadataPrimitives: result.metadata.primitives.length,
            scenePrimitives: result.primitives.filter(
              (p) => (p.renderDensity?.opacity ?? 1) > 0
            ).length,
            cacheBytes: result.cache.bytes
          }
        };
      };
      const cold = await measure(viewport);
      const local = JSON.stringify(
        cold.result.metadata.primitives.map((p) =>
          p.geometry.kind === "external"
            ? {
                ...p,
                geometry: {
                  ...p.geometry,
                  key: p.geometry.key.replace(
                    /render-generations\/[0-9a-f]{64}/,
                    "render-generations/GENERATION"
                  )
                }
              }
            : p
        )
      );
      canonicalLocal ??= local;
      expect(local).toBe(canonicalLocal);
      const warm = await measure(viewport);
      const toggle = await measure(viewport, collectionIds.slice(0, 15));
      await measure(viewport);
      const pan = await measure(panned);
      expect(cold.metrics.httpRequests).toBe(2);
      expect(cold.metrics.responseBytes).toBeLessThan(1024 * 1024);
      expect(cold.metrics.storeReads).toBeLessThanOrEqual(32);
      expect(warm.metrics.httpRequests).toBe(0);
      expect(toggle.metrics.httpRequests).toBe(0);
      expect(pan.metrics.httpRequests).toBe(1);
      expect(pan.metrics.storeReads).toBeLessThanOrEqual(24);
      expect(fixture.requests.some((call) => call.kind === "manifest")).toBe(
        false
      );
      expect(
        fixture.reads.some((key) =>
          /\/render-generations\/[^/]+\/benchmark\/manifest\.json$/.test(key)
        )
      ).toBe(false);
      measurements.push({
        events: count,
        compileMs: fixture.compileMs,
        publicationDocuments: fixture.publicationDocuments,
        publicationBytes: fixture.publicationBytes,
        cold: cold.metrics,
        warm: warm.metrics,
        toggle: toggle.metrics,
        pan: pan.metrics
      });
      fixture.client.dispose();
    }
    expect(
      new Set(measurements.map((item) => item.cold.responseBytes)).size
    ).toBe(1);
    expect(
      new Set(measurements.map((item) => item.cold.metadataPrimitives)).size
    ).toBe(1);
    expect(
      new Set(measurements.map((item) => item.pan.responseBytes)).size
    ).toBe(1);
    console.info("render_read_benchmark", JSON.stringify(measurements));
  }, 120_000);

  it("retains authored hull metadata at fine zoom through authenticated overflow buckets", async () => {
    const fixture = await setup(1000);
    const zoomed = { minX: 50, maxX: 51, minY: 100, maxY: 104 };
    const result = await fixture.client.load(
      zoomed,
      collectionIds,
      undefined,
      undefined,
      { scaleX: 1, scaleY: 1, visibleViewport: zoomed }
    );
    expect(result.metadata.level).toBe(12);
    expect(
      result.metadata.primitives.some(
        (primitive) => primitive.entity.kind === "composite"
      )
    ).toBe(true);
    expect(
      result.metadata.primitives.some(
        (primitive) => primitive.entity.id === uuid(1)
      )
    ).toBe(true);
    expect(fixture.reads.some((key) => key.includes("/overflow/"))).toBe(true);
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.reads.length).toBeLessThanOrEqual(32);
    console.info(
      "render_overflow_benchmark",
      JSON.stringify({
        level: result.metadata.level,
        metadataPrimitives: result.metadata.primitives.length,
        httpRequests: fixture.requests.length,
        responseBytes: fixture.requests.reduce(
          (sum, request) => sum + request.bytes,
          0
        ),
        storeReads: fixture.reads.length
      })
    );
    fixture.client.dispose();
  });

  it("rejects membership-heavy payloads explicitly instead of claiming an arbitrary scene fits", async () => {
    const fixture = await setup(2048, true, ({ state, layout }) => ({
      state: { ...state, relations: [] },
      layout: {
        ...layout,
        shapes: state.events.map((event, index) => {
          const cell = Math.floor(index / 128);
          return {
            event_id: event.id,
            kind: "point" as const,
            position: {
              x: (cell % 4) * 512 + 10,
              y: Math.floor(cell / 4) * 2048 + 10
            }
          };
        })
      }
    }));
    const broad = { minX: 0, maxX: 2048, minY: 0, maxY: 8192 };
    await expect(fixture.client.load(broad, collectionIds)).rejects.toThrow(
      "render_batch_too_large"
    );
    expect(fixture.requests.at(-1)?.status).toBe(413);
    expect(fixture.reads.length).toBeLessThanOrEqual(256);
    console.info(
      "render_membership_budget",
      JSON.stringify({
        events: 2048,
        membershipsPerEvent: 30,
        httpStatus: 413,
        storeReads: fixture.reads.length,
        publicationBytes: fixture.publicationBytes
      })
    );
    fixture.client.dispose();
  }, 30_000);

  it("fails closed when the render generation changes inside the same canonical revision", async () => {
    const fixture = await setup(1000);
    await fixture.client.load(viewport, collectionIds);
    const changed = {
      ...fixture.layout,
      shapes: fixture.layout.shapes.map((shape, i) =>
        i === 0 && shape.kind === "point"
          ? {
              ...shape,
              position: { ...shape.position, x: shape.position.x + 0.25 }
            }
          : shape
      )
    };
    await publishV5RenderGeneration(
      fixture.store,
      fixture.compile(changed).generation
    );
    await expect(fixture.client.load(panned, collectionIds)).rejects.toThrow(
      "render_revision_changed"
    );
    expect(fixture.requests.at(-1)?.status).toBe(409);
    fixture.client.dispose();
  });
});
