import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const served = vi.hoisted(() => vi.fn());
vi.mock("./v5-serving.js", () => ({ readV5ServedRoot: served }));
import {
  buildV5RenderGeneration,
  publishV5RenderGeneration,
  readV5RenderGeneration
} from "./v5-render-generation.js";

const hash = (body: string) => createHash("sha256").update(body).digest("hex");
const worldId = "world-1",
  revision = 56;
const oldPrefix = `worlds/${worldId}/revisions/${revision}/v5/render/time-1/`;
const geometry = JSON.stringify({
  format: "render-geometry/1",
  worldId,
  revision,
  timeSystemId: "time-1",
  geometry: { kind: "polygon", rings: [] }
});
const geometryKey = `${oldPrefix}geometry/${hash(geometry)}.json`;
const tile = JSON.stringify({
  format: "render-tile/1",
  worldId,
  revision,
  timeSystemId: "time-1",
  level: 0,
  x: 0,
  y: 0,
  primitives: [
    {
      id: "event:e:hull",
      geometry: { kind: "external", key: geometryKey, sha256: hash(geometry) }
    }
  ]
});
const tileKey = `${oldPrefix}0/0/0.json`;
const manifest = JSON.stringify({
  format: "render-publication/1",
  worldId,
  revision,
  timeSystemId: "time-1",
  tiles: [{ key: tileKey, sha256: hash(tile) }],
  geometry: [{ key: geometryKey, sha256: hash(geometry) }]
});
const build = () =>
  buildV5RenderGeneration({
    worldId,
    revision,
    sourceRootSha256: "a".repeat(64),
    render: [
      {
        timeSystemId: "time-1",
        manifest: { key: `${oldPrefix}manifest.json`, body: manifest },
        documents: [
          { key: tileKey, body: tile },
          { key: geometryKey, body: geometry }
        ]
      }
    ]
  });

describe("independent render generation", () => {
  beforeEach(() =>
    served.mockReset().mockResolvedValue({
      pointer: {
        served_revision: revision,
        manifest_sha256: "a".repeat(64)
      },
      rootBody: "root"
    })
  );
  it("rekeys tiles and external geometry without changing the canonical root", () => {
    const generation = build();
    expect(build()).toEqual(generation);
    const prefix = `worlds/${worldId}/render-generations/${generation.generation}/`;
    expect(generation.root.key).toBe(`${prefix}index.json`);
    const newTile = JSON.parse(
      generation.documents.find((doc) => doc.key.endsWith("/0/0/0.json"))!.body
    );
    expect(newTile.primitives[0].geometry.key).toBe(
      `${prefix}time-1/geometry/${hash(geometry)}.json`
    );
    const newManifest = JSON.parse(
      generation.documents.find((doc) => doc.key.endsWith("/manifest.json"))!
        .body
    );
    expect(newManifest.tiles[0].sha256).toBe(hash(JSON.stringify(newTile)));
    expect(newManifest.geometry[0].key).toBe(
      newTile.primitives[0].geometry.key
    );
  });
  it("publishes only after immutable uploads and refuses source drift", async () => {
    const generation = build(),
      entries = new Map<string, { body: string; etag: string }>();
    let fail = true,
      number = 0;
    const store = {
      get: async (key: string) => ({
        status: entries.has(key) ? 200 : 404,
        body: entries.get(key)?.body ?? null,
        etag: entries.get(key)?.etag ?? null
      }),
      put: async (
        key: string,
        body: string,
        options?: {
          immutable?: boolean;
          ifMatch?: string;
          ifNoneMatch?: boolean;
        }
      ) => {
        if (fail && key.endsWith("/index.json"))
          return { status: 503, etag: null };
        const prior = entries.get(key);
        if (
          (options?.immutable && prior) ||
          (options?.ifNoneMatch && prior) ||
          (options?.ifMatch && options.ifMatch !== prior?.etag)
        )
          return { status: 412, etag: prior?.etag ?? null };
        const etag = `"${++number}"`;
        entries.set(key, { body, etag });
        return { status: 201, etag };
      }
    };
    await expect(publishV5RenderGeneration(store, generation)).rejects.toThrow(
      "render_generation_upload_failed"
    );
    expect(entries.has(`worlds/${worldId}/render-current.json`)).toBe(false);
    fail = false;
    await publishV5RenderGeneration(store, generation);
    await publishV5RenderGeneration(store, generation);
    const reader = await readV5RenderGeneration(store, worldId);
    expect(reader.revision).toBe(revision);
    const ref = reader.manifests[0]!;
    expect(JSON.parse(await reader.read(ref.key, ref.sha256)).format).toBe(
      "render-publication/1"
    );
    entries.set(ref.key, { body: "tampered", etag: '"bad"' });
    await expect(reader.read(ref.key, ref.sha256)).rejects.toThrow(
      "render_generation_asset_invalid"
    );
    served.mockResolvedValue({
      pointer: {
        served_revision: revision + 1,
        manifest_sha256: "b".repeat(64)
      },
      rootBody: "new"
    });
    await expect(readV5RenderGeneration(store, worldId)).rejects.toThrow(
      "render_generation_source_changed"
    );
  });
  it("rejects incomplete or altered compiler references", () => {
    expect(() =>
      buildV5RenderGeneration({
        worldId,
        revision,
        sourceRootSha256: "a".repeat(64),
        render: [
          {
            timeSystemId: "time-1",
            manifest: { key: `${oldPrefix}manifest.json`, body: manifest },
            documents: [{ key: tileKey, body: "tampered" }]
          }
        ]
      })
    ).toThrow("render_generation_refs_invalid");
  });
});
