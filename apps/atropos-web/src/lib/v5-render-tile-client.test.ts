import { describe, expect, it, vi } from "vitest";
import { createV5RenderTileClient } from "./v5-render-tile-client.js";

const world = "w",
  revision = 7,
  timeSystemId = "t";
const prefix = `worlds/${world}/revisions/${revision}/v5/render/${timeSystemId}/`;
const primitive = (id: string, x: number, collection: string) => ({
  id,
  entity: { kind: "event", id },
  geometry: { kind: "point", xy: { x, y: 0 } },
  bounds: { minX: x, maxX: x, minY: 0, maxY: 0 },
  label: id,
  collectionIds: [collection],
  lod: { visible: [0, 2], groupId: id }
});
const refs = [
  { level: 0, x: 0, y: 0, bounds: { minX: 0, maxX: 4, minY: 0, maxY: 2 } },
  { level: 1, x: 0, y: 0, bounds: { minX: 0, maxX: 2, minY: 0, maxY: 1 } },
  { level: 1, x: 1, y: 0, bounds: { minX: 2, maxX: 4, minY: 0, maxY: 1 } }
].map((ref) => ({
  ...ref,
  key: `${prefix}${ref.level}/${ref.x}/${ref.y}.json`,
  sha256: "digest"
}));
const manifest = {
  format: "render-publication/1",
  worldId: world,
  revision,
  timeSystemId,
  maxLevel: 1,
  bounds: { minX: 0, maxX: 4, minY: 0, maxY: 2 },
  tiles: refs,
  geometry: []
};
const tiles = refs.map((ref) => ({
  format: "render-tile/1",
  worldId: world,
  revision,
  timeSystemId,
  level: ref.level,
  x: ref.x,
  y: ref.y,
  bounds: ref.bounds,
  primitives:
    ref.level === 0
      ? [primitive("a", 0.5, "one"), primitive("b", 2.5, "two")]
      : [
          primitive(
            ref.x === 0 ? "a" : "b",
            ref.x === 0 ? 0.5 : 2.5,
            ref.x === 0 ? "one" : "two"
          )
        ]
}));
const viewport = (minX: number, maxX: number) => ({
  minX,
  maxX,
  minY: 0,
  maxY: 0.25
});

describe("render tile working set", () => {
  it("requires both relation endpoint memberships for Collection selection", async () => {
    const linked = {
      ...primitive("link", 0.5, "one"),
      entity: { kind: "relation", id: "link" },
      endpointIds: ["a", "b"],
      endpointCollectionIds: [["one"], ["two"]]
    };
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(init.body as string) as {
        kind: string;
        assets?: { level: number; x: number; y: number }[];
      };
      if (request.kind === "manifest") return Response.json(manifest);
      return Response.json({
        revision,
        assets: (request.assets ?? []).map((ref) => {
          const key = `${prefix}${ref.level}/${ref.x}/${ref.y}.json`;
          const tile = tiles[refs.findIndex((item) => item.key === key)]!;
          return {
            key,
            sha256: "digest",
            body: { ...tile, primitives: [linked] }
          };
        })
      });
    });
    const client = createV5RenderTileClient({
      worldId: world,
      revision,
      timeSystemId,
      fetcher: fetcher as typeof fetch
    });
    expect(
      (await client.load(viewport(0, 0.5), 1, ["one"])).primitives
    ).toEqual([]);
    expect(
      (await client.load(viewport(0, 0.5), 1, ["one", "two"])).primitives.map(
        (p) => p.id
      )
    ).toEqual(["link"]);
  });
  it("fetches newly entered tiles and filters Collection selection without refetch", async () => {
    const fetched: string[][] = [];
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as {
        kind: string;
        assets?: { level: number; x: number; y: number }[];
      };
      if (body.kind === "manifest") return Response.json(manifest);
      const keys = (body.assets ?? []).map(
        (asset) => `${prefix}${asset.level}/${asset.x}/${asset.y}.json`
      );
      fetched.push(keys);
      return Response.json({
        revision,
        assets: keys.map((key) => ({
          key,
          sha256: "digest",
          body: tiles[refs.findIndex((ref) => ref.key === key)]
        }))
      });
    });
    const client = createV5RenderTileClient({
      worldId: world,
      revision,
      timeSystemId,
      fetcher: fetcher as typeof fetch
    });
    expect(
      (await client.load(viewport(0, 0.5), 1, ["one"])).primitives.map(
        (p) => p.id
      )
    ).toEqual(["a"]);
    const calls = fetched.length;
    expect(
      (await client.load(viewport(0, 0.5), 1, ["two"])).primitives
    ).toEqual([]);
    expect(fetched).toHaveLength(calls);
    expect(
      (await client.load(viewport(2.5, 3), 1, ["two"])).primitives.map(
        (p) => p.id
      )
    ).toEqual(["b"]);
    expect(fetched.flat()).toContain(refs[2]!.key);
    const later = fetched.length;
    expect(
      (await client.load(viewport(0, 0.5), 1, ["one"])).primitives.map(
        (p) => p.id
      )
    ).toEqual(["a"]);
    expect(fetched).toHaveLength(later);
    const frame = await client.loadFrame({
      viewport: viewport(0, 0.5),
      scaleX: 200,
      scaleY: 100,
      width: 400,
      height: 200,
      collectionIds: ["one"]
    });
    expect(frame.level).toBeCloseTo(0.5);
    expect(frame.cache?.entries).toBeGreaterThan(0);
    expect(
      frame.representations.find((item) => item.primitive.id === "a")?.opacity
    ).toBeCloseTo(1);
    client.dispose();
    await expect(client.load(viewport(0, 0.5), 1, ["one"])).rejects.toThrow(
      "render_client_disposed"
    );
  });

  it("fails on revision change before caching a tile", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { kind: string };
      return body.kind === "manifest"
        ? Response.json(manifest)
        : Response.json({ error: "revision_changed" }, { status: 409 });
    });
    const client = createV5RenderTileClient({
      worldId: world,
      revision,
      timeSystemId,
      fetcher: fetcher as typeof fetch
    });
    await expect(client.load(viewport(0, 0.5), 1, ["one"])).rejects.toThrow(
      "render_revision_changed"
    );
  });

  it("loads shared external polygon geometry once and enforces the working-set budget", async () => {
    const key = `${prefix}geometry/${"a".repeat(64)}.json`;
    const geom = {
      format: "render-geometry/1",
      worldId: world,
      revision,
      timeSystemId,
      geometry: {
        kind: "polygon",
        rings: [
          [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 }
          ]
        ]
      }
    };
    const region = {
      ...primitive("region", 0.5, "one"),
      entity: { kind: "composite", id: "region" },
      geometry: { kind: "external", key, sha256: "a".repeat(64) }
    };
    const root = {
      ...manifest,
      geometry: [{ key, sha256: "a".repeat(64), bounds: region.bounds }]
    };
    const calls: string[] = [];
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as {
        kind: string;
        assets?: {
          kind: string;
          level?: number;
          x?: number;
          y?: number;
          sha256?: string;
        }[];
      };
      if (body.kind === "manifest") return Response.json(root);
      return Response.json({
        revision,
        assets: (body.assets ?? []).map((asset) => {
          const itemKey =
            asset.kind === "geometry"
              ? key
              : `${prefix}${asset.level}/${asset.x}/${asset.y}.json`;
          calls.push(itemKey);
          const original = tiles[refs.findIndex((ref) => ref.key === itemKey)];
          return {
            key: itemKey,
            sha256: asset.kind === "geometry" ? "a".repeat(64) : "digest",
            body:
              asset.kind === "geometry"
                ? geom
                : {
                    ...original,
                    primitives:
                      asset.level === 1 && asset.x === 0 ? [region] : []
                  }
          };
        })
      });
    });
    const client = createV5RenderTileClient({
      worldId: world,
      revision,
      timeSystemId,
      fetcher: fetcher as typeof fetch
    });
    expect(
      (await client.load(viewport(0, 0.5), 1, ["one"])).primitives[0]?.geometry
        .kind
    ).toBe("polygon");
    await client.load(viewport(0, 0.5), 1, ["one"]);
    expect(calls.filter((item) => item === key)).toHaveLength(1);
    const tiny = createV5RenderTileClient({
      worldId: world,
      revision,
      timeSystemId,
      fetcher: fetcher as typeof fetch,
      maxBytes: 1
    });
    await expect(tiny.load(viewport(0, 0.5), 1, ["one"])).rejects.toThrow(
      "render_working_set_budget_exceeded"
    );
  });
});
