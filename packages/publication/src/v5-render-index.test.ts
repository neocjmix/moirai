import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildRenderAssetIndex,
  createRenderAssetReader,
  renderReadSummary
} from "./v5-render-index.js";
const hash = (body: string) => createHash("sha256").update(body).digest("hex");
const prefix = "worlds/world-1/render-generations/g/time-1/";
const fixture = (count: number) => {
  const assets = Array.from({ length: count }, (_, i) => ({
    key: `${prefix}3/${String(i).padStart(6, "0")}/0.json`,
    body: `body-${i}`
  }));
  const index = buildRenderAssetIndex(prefix, assets);
  const documents = new Map(
    [...assets, ...index.documents].map((doc) => [doc.key, doc.body])
  );
  const read = vi.fn(async (key: string, sha256: string) => {
    const body = documents.get(key);
    if (!body || hash(body) !== sha256) throw Error("digest_mismatch");
    return body;
  });
  return {
    assets,
    index,
    documents,
    read,
    resolve: createRenderAssetReader(prefix, index.root, read)
  };
};
describe("bounded render asset index", () => {
  it("resolves an exact address with logarithmic metadata reads at 1k/10k/100k scale", async () => {
    for (const count of [1000, 10000, 100000]) {
      const { assets, index, resolve, read } = fixture(count);
      expect(await resolve(assets[0]!.key)).toEqual({
        body: assets[0]!.body,
        sha256: hash(assets[0]!.body)
      });
      expect(read.mock.calls.length).toBeLessThanOrEqual(4);
      expect(
        index.documents.every(
          (doc) => JSON.parse(doc.body).entries.length <= 64
        )
      ).toBe(true);
      expect(await resolve(`${prefix}3/999999/0.json`)).toBeNull();
      expect(read.mock.calls.length).toBeLessThanOrEqual(4);
    }
  });
  it("memoizes shared index nodes, proves sparse absence, and rejects tampering", async () => {
    const { assets, resolve, read, documents, index } = fixture(1000);
    await Promise.all([resolve(assets[0]!.key), resolve(assets[1]!.key)]);
    const keys = read.mock.calls.map(([key]) => key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(await resolve(`${prefix}3/000000/-1.json`)).toBeNull();
    const next = createRenderAssetReader(prefix, index.root, read);
    documents.set(index.root!.key, "tampered");
    await expect(next(assets[0]!.key)).rejects.toThrow("digest_mismatch");
    await expect(next("worlds/other/private.json")).rejects.toThrow(
      "render_generation_asset_unlisted"
    );
  });
  it("supports an empty generation and restricts the compact spatial summary", async () => {
    const { resolve, read } = fixture(0);
    expect(await resolve(`${prefix}3/0/0.json`)).toBeNull();
    expect(read).not.toHaveBeenCalled();
    const summary = {
      format: "render-publication/2",
      algorithmVersion: "render-compiler/4",
      maxLevel: 3,
      bounds: null,
      spatialFrame: {
        format: "render-spatial-frame/1",
        originX: 0,
        originY: 0,
        baseSpanX: 4096,
        baseSpanY: 16384,
        minLevel: -8,
        maxLevel: 3
      }
    };
    expect(
      renderReadSummary({
        ...summary,
        tiles: ["not returned"],
        geometry: ["not returned"]
      })
    ).toEqual({ ...summary, overflowLevels: [] });
    expect(() => renderReadSummary({ ...summary, maxLevel: 5 })).toThrow(
      "render_summary_invalid"
    );
  });
});
