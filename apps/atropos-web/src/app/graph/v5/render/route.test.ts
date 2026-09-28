import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const readRoot = vi.hoisted(() => vi.fn());
const readDocument = vi.hoisted(() => vi.fn());
const readGeneration = vi.hoisted(() => vi.fn());
vi.mock("@moirai/publication/v5", () => ({
  readV5ServedRoot: readRoot,
  readV5StagedDocument: readDocument,
  readV5RenderGeneration: readGeneration
}));
vi.mock("../../../../lib/publication", () => ({
  readPublicationObject: vi.fn()
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
    const changed = await post({
      kind: "manifest",
      world_id: world,
      revision: 6,
      time_system_id: "t"
    });
    expect(changed.status).toBe(409);
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
});
