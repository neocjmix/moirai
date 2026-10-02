import { createHash } from "node:crypto";
import type * as Publication from "@moirai/publication/v5";
import { beforeEach, describe, expect, it, vi } from "vitest";
const readRoot = vi.hoisted(() => vi.fn());
const readDocument = vi.hoisted(() => vi.fn());
const readGeneration = vi.hoisted(() => vi.fn());
const readObject = vi.hoisted(() => vi.fn());
vi.mock("@moirai/publication/v5", async (importOriginal) => ({
  ...(await importOriginal<typeof Publication>()),
  readV5ServedRoot: readRoot,
  readV5StagedDocument: readDocument,
  readV5RenderGeneration: readGeneration
}));
vi.mock("../../../../lib/publication", () => ({
  readPublicationObject: readObject
}));
import { POST } from "./route.js";

const world = "01995c2a-7b00-7000-8000-000000000101";
const prefix = `worlds/${world}/revisions/7/v5/render/t/`;
const tileKey = `${prefix}0/0/0.json`;
const tile = JSON.stringify({
  format: "render-tile/1",
  worldId: world,
  revision: 7,
  timeSystemId: "t",
  level: 0,
  x: 0,
  y: 0,
  bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  primitives: []
});
const digest = createHash("sha256").update(tile).digest("hex");
const manifest = JSON.stringify({
  format: "render-publication/1",
  worldId: world,
  revision: 7,
  timeSystemId: "t",
  tiles: [{ key: tileKey, sha256: digest }],
  geometry: []
});
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/graph/v5/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
describe("revision-pinned render read", () => {
  beforeEach(() => {
    readObject.mockReset();
    readGeneration
      .mockReset()
      .mockRejectedValue(Error("render_generation_unavailable"));
    readRoot
      .mockReset()
      .mockResolvedValue({ pointer: { served_revision: 7 }, rootBody: "root" });
    readDocument
      .mockReset()
      .mockImplementation(async (_root: string, key: string) =>
        key === `${prefix}manifest.json`
          ? manifest
          : key === tileKey
            ? tile
            : null
      );
  });
  it("reads only manifest-listed immutable tiles with revision pinning", async () => {
    const response = await post({
      kind: "assets",
      world_id: world,
      revision: 7,
      time_system_id: "t",
      assets: [{ kind: "tile", level: 0, x: 0, y: 0 }]
    });
    expect(response.status).toBe(200);
    expect((await response.json()).assets[0].body.format).toBe("render-tile/1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const timing =
      /^app;dur=\d+\.\d{2}, pubio;dur=\d+\.\d{2}, objects;desc="\d+", bytes;desc="\d+"$/;
    expect(response.headers.get("server-timing")).toMatch(timing);
    const changed = await post({
      kind: "manifest",
      world_id: world,
      revision: 6,
      time_system_id: "t"
    });
    expect(changed.status).toBe(409);
    expect(changed.headers.get("server-timing")).toMatch(timing);
    expect(await changed.json()).toEqual({ error: "revision_changed" });
  });
  it("rejects unlisted, malformed and digest-mismatched assets", async () => {
    expect(
      (
        await post({
          kind: "assets",
          world_id: world,
          revision: 7,
          time_system_id: "t",
          assets: [{ kind: "tile", level: 0, x: 1, y: 0 }]
        })
      ).status
    ).toBe(400);
    expect(
      (
        await post({
          kind: "assets",
          world_id: world,
          revision: 7,
          time_system_id: "t",
          assets: [{ kind: "tile", level: 1, x: 0, y: 0 }]
        })
      ).status
    ).toBe(404);
    readDocument.mockImplementation(async (_root: string, key: string) =>
      key === `${prefix}manifest.json` ? manifest : "modified"
    );
    expect(
      (
        await post({
          kind: "assets",
          world_id: world,
          revision: 7,
          time_system_id: "t",
          assets: [{ kind: "tile", level: 0, x: 0, y: 0 }]
        })
      ).status
    ).toBe(503);
  });
  it("reads a separately pinned Render generation and refuses its broken assets", async () => {
    const gen = "b".repeat(64);
    const key = `worlds/${world}/render-generations/${gen}/t/0/0/0.json`;
    const manifestKey = `worlds/${world}/render-generations/${gen}/t/manifest.json`;
    const body = JSON.stringify({
      ...JSON.parse(manifest),
      tiles: [{ key, sha256: digest }]
    });
    const reader = vi.fn(async (requested: string, sha256: string) => {
      if (
        requested === manifestKey &&
        sha256 === createHash("sha256").update(body).digest("hex")
      )
        return body;
      if (requested === key && sha256 === digest) return tile;
      throw Error("render_generation_asset_invalid");
    });
    readGeneration.mockResolvedValue({
      generation: gen,
      revision: 7,
      manifests: [
        {
          timeSystemId: "t",
          key: manifestKey,
          sha256: createHash("sha256").update(body).digest("hex")
        }
      ],
      read: reader
    });
    const response = await post({
      kind: "assets",
      world_id: world,
      revision: 7,
      time_system_id: "t",
      assets: [{ kind: "tile", level: 0, x: 0, y: 0 }]
    });
    expect(response.status).toBe(200);
    expect((await response.json()).assets[0].key).toBe(key);
    expect(readDocument).not.toHaveBeenCalled();
    reader.mockRejectedValue(Error("render_generation_asset_invalid"));
    expect(
      (
        await post({
          kind: "manifest",
          world_id: world,
          revision: 7,
          time_system_id: "t"
        })
      ).status
    ).toBe(503);
  });
  it("ignores an older generation after the canonical pointer advances", async () => {
    readGeneration.mockRejectedValue(Error("render_generation_source_changed"));
    const response = await post({
      kind: "manifest",
      world_id: world,
      revision: 7,
      time_system_id: "t"
    });
    expect(response.status).toBe(200);
    expect((await response.json()).tiles[0].key).toBe(tileKey);
    expect(readDocument).toHaveBeenCalled();
  });
});

describe("ADR-012 viewport resolver", () => {
  const frame = {
    format: "render-spatial-frame/1",
    originX: 0,
    originY: 0,
    baseSpanX: 4096,
    baseSpanY: 16384,
    minLevel: -8,
    maxLevel: 3
  };
  const viewport = { minX: -500, maxX: 500, minY: 0, maxY: 100 };
  const primitive = {
    id: "event:one",
    entity: { kind: "event", id: "one" },
    geometry: { kind: "point", xy: { x: 0, y: 1 } },
    bounds: { minX: 0, maxX: 0, minY: 1, maxY: 1 },
    label: "one",
    collectionIds: ["collection-a", "collection-b"],
    lod: { visible: [0, 8], groupId: "one" }
  };
  async function fixture(
    withVisibility = false,
    withOverflow = false,
    geometryBodies?: string[]
  ) {
    const actual = await vi.importActual<typeof Publication>(
      "@moirai/publication/v5"
    );
    const documents = [-1, 0, 10000].map((x) => ({
      key: `${prefix}3/${x}/0.json`,
      body: JSON.stringify({
        format: "render-tile/2",
        worldId: world,
        revision: 7,
        timeSystemId: "t",
        level: 3,
        x,
        y: 0,
        bounds: { minX: x * 512, maxX: (x + 1) * 512, minY: 0, maxY: 2048 },
        primitives: [primitive],
        ...(withVisibility
          ? {
              visibility: {
                policy: "render-visibility/1",
                candidateCount: 200,
                omittedCount: 199,
                normalBudget: 64,
                smallBudget: 32,
                bufferBudget: 32
              }
            }
          : {})
      })
    }));
    if (withOverflow)
      documents.push({
        key: `${prefix}overflow/2/0/0.json`,
        body: JSON.stringify({
          format: "render-tile/2",
          worldId: world,
          revision: 7,
          timeSystemId: "t",
          level: 2,
          x: 0,
          y: 0,
          bucketKind: "overflow",
          bounds: viewport,
          primitives: [primitive]
        })
      });
    const geometryBody = JSON.stringify({
      format: "render-geometry/1",
      worldId: world,
      revision: 7,
      timeSystemId: "t",
      geometry: { kind: "polygon", rings: [] }
    });
    const geometryHash = createHash("sha256")
      .update(geometryBody)
      .digest("hex");
    const geometryDocuments = (geometryBodies ?? [geometryBody]).map(
      (body) => ({
        key: `${prefix}geometry/${createHash("sha256").update(body).digest("hex")}.json`,
        body
      })
    );
    const sourceManifest = {
      format: "render-publication/2",
      worldId: world,
      revision: 7,
      timeSystemId: "t",
      algorithmVersion: "render-compiler/4",
      maxLevel: 3,
      bounds: viewport,
      spatialFrame: frame,
      overflowLevels: withOverflow ? [2] : [],
      tiles: documents.map((doc, i) => ({
        key: doc.key,
        sha256: createHash("sha256").update(doc.body).digest("hex"),
        level: i === 3 ? 2 : 3,
        x: i === 3 ? 0 : [-1, 0, 10000][i],
        y: 0,
        ...(i === 3 ? { bucketKind: "overflow" } : {}),
        bounds: viewport
      })),
      geometry: geometryDocuments.map((doc) => ({
        key: doc.key,
        sha256: createHash("sha256").update(doc.body).digest("hex")
      }))
    };
    const generated = actual.buildV5RenderGeneration({
      worldId: world,
      revision: 7,
      sourceRootSha256: "a".repeat(64),
      render: [
        {
          timeSystemId: "t",
          manifest: {
            key: `${prefix}manifest.json`,
            body: JSON.stringify(sourceManifest)
          },
          documents: [...documents, ...geometryDocuments]
        }
      ]
    });
    const entries = new Map(
      [...generated.documents, generated.root].map((doc) => [doc.key, doc.body])
    );
    entries.set(
      `worlds/${world}/render-current.json`,
      JSON.stringify({
        format: "render-generation-pointer/1",
        worldId: world,
        revision: 7,
        sourceRootSha256: "a".repeat(64),
        generation: generated.generation,
        rootKey: generated.root.key,
        rootSha256: createHash("sha256")
          .update(generated.root.body)
          .digest("hex")
      })
    );
    readObject.mockImplementation(async (key: string) => ({
      status: entries.has(key) ? 200 : 404,
      body: entries.get(key) ?? null,
      etag: null
    }));
    readRoot.mockResolvedValue({
      pointer: { served_revision: 7, manifest_sha256: "a".repeat(64) },
      rootBody: "root"
    });
    readGeneration.mockImplementation(actual.readV5RenderGeneration);
    return {
      generated,
      entries,
      geometryHash,
      geometryHashes: sourceManifest.geometry.map((ref) => ref.sha256)
    };
  }
  const query = {
    kind: "viewport",
    world_id: world,
    revision: 7,
    time_system_id: "t",
    viewport
  };
  beforeEach(() => {
    vi.clearAllMocks();
  });
  const geometryBodies = (count: number, padding = 0) =>
    Array.from({ length: count }, (_, ordinal) =>
      JSON.stringify({
        format: "render-geometry/1",
        worldId: world,
        revision: 7,
        timeSystemId: "t",
        geometry: { kind: "polygon", rings: [] },
        ordinal,
        ...(padding ? { padding: "x".repeat(padding) } : {})
      })
    );
  const assetQuery = (hashes: string[]) => ({
    kind: "assets",
    world_id: world,
    revision: 7,
    time_system_id: "t",
    assets: hashes.map((sha256) => ({ kind: "geometry", sha256 }))
  });
  it("overlaps at most eight cold asset reads while preserving order and deduplicating shared reads", async () => {
    const { geometryHashes } = await fixture(false, false, geometryBodies(17));
    const read = readObject.getMockImplementation()!;
    const requested = [...geometryHashes].reverse();
    requested.push(requested[0]!);
    let active = 0,
      peak = 0;
    const finished: string[] = [];
    readObject.mockImplementation(async (key: string) => {
      if (!key.includes("/geometry/")) return read(key);
      const digest = key.split("/").at(-1)!.slice(0, -5);
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) =>
        setTimeout(resolve, (8 - (requested.indexOf(digest) % 8)) * 10)
      );
      active--;
      finished.push(digest);
      return read(key);
    });
    vi.useFakeTimers();
    try {
      const pending = post(assetQuery(requested));
      await vi.advanceTimersByTimeAsync(0);
      expect(active).toBe(8);
      await vi.runAllTimersAsync();
      const response = await pending;
      expect(response.status).toBe(200);
      expect(
        (await response.json()).assets.map(
          (asset: { sha256: string }) => asset.sha256
        )
      ).toEqual(requested);
      expect(peak).toBe(8);
      expect(active).toBe(0);
      expect(finished[0]).toBe(requested[7]);
      expect(finished).toHaveLength(17);
      const keys = readObject.mock.calls.map(([key]) => key);
      expect(new Set(keys).size).toBe(keys.length);
    } finally {
      vi.useRealTimers();
    }
  });
  it("rejects a tampered asset without beginning the next eight-read batch", async () => {
    const { entries, geometryHashes } = await fixture(
      false,
      false,
      geometryBodies(17)
    );
    const key = [...entries.keys()].find((key) =>
      key.endsWith(`/geometry/${geometryHashes[0]}.json`)
    )!;
    entries.set(key, "tampered");
    const response = await post(assetQuery(geometryHashes));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "render_publication_unavailable"
    });
    const reads = readObject.mock.calls
      .map(([key]) => key as string)
      .filter((key) => key.includes("/geometry/"));
    expect(reads).toHaveLength(8);
    expect(
      reads.some((key) => key.endsWith(`/${geometryHashes[8]}.json`))
    ).toBe(false);
  });
  it("keeps an earlier missing asset error ahead of a later digest failure", async () => {
    const { entries, geometryHashes } = await fixture(
      false,
      false,
      geometryBodies(9)
    );
    const key = [...entries.keys()].find((key) =>
      key.endsWith(`/geometry/${geometryHashes[0]}.json`)
    )!;
    entries.set(key, "tampered");
    const response = await post(
      assetQuery(["0".repeat(64), ...geometryHashes])
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "render_asset_not_found" });
    expect(
      readObject.mock.calls.some(([key]) =>
        (key as string).endsWith(`/${geometryHashes[7]}.json`)
      )
    ).toBe(false);
  });
  it("enforces the four MiB response budget before starting another batch", async () => {
    const { geometryHashes } = await fixture(
      false,
      false,
      geometryBodies(9, 550_000)
    );
    const response = await post(assetQuery(geometryHashes));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "render_batch_too_large" });
    expect(
      readObject.mock.calls.filter(([key]) =>
        (key as string).includes("/geometry/")
      )
    ).toHaveLength(8);
    expect(
      readObject.mock.calls.some(([key]) =>
        (key as string).endsWith(`/${geometryHashes[8]}.json`)
      )
    ).toBe(false);
  });
  it("retains the 256 total object-read guard including Merkle metadata", async () => {
    const { geometryHashes } = await fixture(false, false, geometryBodies(256));
    const response = await post(assetQuery(geometryHashes));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "render_viewport_too_large"
    });
    expect(readObject).toHaveBeenCalledTimes(256);
    expect(
      readObject.mock.calls.filter(([key]) =>
        (key as string).includes("/geometry/")
      )
    ).toHaveLength(248);
    readObject.mockClear();
    expect(
      (await post(assetQuery([...geometryHashes, geometryHashes[0]!]))).status
    ).toBe(400);
    expect(readObject).not.toHaveBeenCalled();
  });
  it("returns one deduplicated metadata response without manifest or geometry reads", async () => {
    const { generated } = await fixture();
    const response = await post(query);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      format: "render-viewport/1",
      generation: generated.generation,
      level: 3,
      coverage: [viewport],
      algorithmVersion: "render-compiler/4",
      primitives: [primitive]
    });
    const keys = readObject.mock.calls.map(([key]) => key as string);
    expect(keys.some((key) => key.endsWith("/manifest.json"))).toBe(false);
    expect(keys.some((key) => key.includes("/geometry/"))).toBe(false);
    expect(keys.some((key) => key.endsWith("/3/10000/0.json"))).toBe(false);
    expect(readDocument).not.toHaveBeenCalled();
  });
  it("serves an authenticated overflow asset for the compatibility preview", async () => {
    const { generated } = await fixture(false, true);
    const response = await post({
      kind: "assets",
      world_id: world,
      revision: 7,
      time_system_id: "t",
      generation: generated.generation,
      assets: [{ kind: "tile", bucket_kind: "overflow", level: 2, x: 0, y: 0 }]
    });
    expect(response.status).toBe(200);
    const value = await response.json();
    expect(value.generation).toBe(generated.generation);
    expect(value.assets[0].key).toContain("/overflow/2/0/0.json");
    expect(value.assets[0].body).toMatchObject({
      format: "render-tile/2",
      bucketKind: "overflow",
      level: 2
    });
    expect(
      (
        await post({
          kind: "assets",
          world_id: world,
          revision: 7,
          time_system_id: "t",
          assets: [
            { kind: "tile", bucket_kind: "unknown", level: 2, x: 0, y: 0 }
          ]
        })
      ).status
    ).toBe(400);
  });
  it("reports publication visibility pruning without calling it missing domain data", async () => {
    await fixture(true);
    const response = await post(query);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      completeness: false,
      visibility: {
        candidateCount: 400,
        omittedCount: 398,
        counting: "tile-occurrences",
        readCoverage: "full",
        hasOmitted: true,
        budgets: { normal: 64, small: 32, buffer: 32 }
      },
      primitives: [primitive]
    });
  });
  it("uses exclusions for entering coverage and pins generation during geometry reads", async () => {
    const { generated, geometryHash } = await fixture();
    const response = await post({
      ...query,
      exclude_level: 3,
      exclude: [{ minX: -512, maxX: 0, minY: 0, maxY: 2048 }]
    });
    expect(response.status).toBe(200);
    expect(
      readObject.mock.calls.some(([key]) =>
        (key as string).endsWith("/3/-1/0.json")
      )
    ).toBe(false);
    readObject.mockClear();
    expect(
      (
        await post({
          ...query,
          exclude_level: 2,
          exclude: [{ minX: -512, maxX: 0, minY: 0, maxY: 2048 }]
        })
      ).status
    ).toBe(200);
    expect(
      readObject.mock.calls.some(([key]) =>
        (key as string).endsWith("/3/-1/0.json")
      )
    ).toBe(true);
    const assets = {
      kind: "assets",
      world_id: world,
      revision: 7,
      time_system_id: "t",
      generation: generated.generation,
      assets: [{ kind: "geometry", sha256: geometryHash }]
    };
    expect((await post(assets)).status).toBe(200);
    expect((await post({ ...assets, generation: "f".repeat(64) })).status).toBe(
      409
    );
    expect((await post({ ...assets, generation: null })).status).toBe(409);
  });
  it("rejects tampered index/assets, excessive coverage and malformed viewports", async () => {
    const { entries } = await fixture();
    const key = [...entries.keys()].find((key) => key.endsWith("/3/0/0.json"))!;
    entries.set(key, "tampered");
    expect((await post(query)).status).toBe(503);
    const { entries: fresh } = await fixture();
    const index = [...fresh.keys()].find((key) =>
      key.includes("/asset-index/")
    )!;
    fresh.set(index, "tampered");
    expect((await post(query)).status).toBe(503);
    await fixture();
    expect(
      (await post({ ...query, viewport: { ...viewport, maxX: 1e10 } })).status
    ).toBe(413);
    expect(
      (await post({ ...query, viewport: { ...viewport, maxX: -1000 } })).status
    ).toBe(400);
  });
  it("coarsens broad fixed-frame coverage without changing semantic primitives", async () => {
    await fixture();
    const broad = { minX: -5000, maxX: 5000, minY: -10000, maxY: 10000 };
    const response = await post({ ...query, viewport: broad });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.level).toBeLessThan(3);
    expect(body.minLevel).toBe(-8);
    expect(body.coverage).toEqual([broad]);
    expect(
      readObject.mock.calls.some(([key]) =>
        (key as string).endsWith("/manifest.json")
      )
    ).toBe(false);
  });
  it("resolves staged v2 sidecars from their authenticated compact summary", async () => {
    readGeneration.mockRejectedValue(Error("render_generation_unavailable"));
    const summary = {
      format: "render-publication/2",
      worldId: world,
      revision: 7,
      timeSystemId: "t",
      algorithmVersion: "render-compiler/4",
      maxLevel: 3,
      bounds: viewport,
      spatialFrame: frame
    };
    const body = JSON.stringify({
      ...JSON.parse(tile),
      format: "render-tile/2",
      level: 3,
      primitives: [primitive]
    });
    readDocument.mockImplementation(async (_root: string, key: string) =>
      key === `${prefix}viewport.json`
        ? JSON.stringify(summary)
        : key === `${prefix}3/0/0.json`
          ? body
          : null
    );
    const response = await post(query);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      generation: null,
      level: 3,
      algorithmVersion: "render-compiler/4",
      primitives: [primitive]
    });
    expect(
      readDocument.mock.calls.some(([, key]) =>
        (key as string).endsWith("/manifest.json")
      )
    ).toBe(false);
  });
  it("keeps a labeled v1 adapter without requiring a separate client manifest round trip", async () => {
    readGeneration.mockRejectedValue(Error("render_generation_unavailable"));
    const body = JSON.stringify({
      ...JSON.parse(tile),
      primitives: [primitive]
    });
    const oldManifest = JSON.stringify({
      ...JSON.parse(manifest),
      algorithmVersion: "render-compiler/3",
      maxLevel: 0,
      bounds: viewport,
      tiles: [
        {
          key: tileKey,
          level: 0,
          x: 0,
          y: 0,
          bounds: viewport,
          sha256: createHash("sha256").update(body).digest("hex")
        }
      ]
    });
    readDocument.mockImplementation(async (_root: string, key: string) =>
      key === `${prefix}manifest.json`
        ? oldManifest
        : key === tileKey
          ? body
          : null
    );
    const response = await post(query);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      compatibility: "legacy-manifest/1",
      generation: null,
      level: 0,
      primitives: [primitive]
    });
  });
});
