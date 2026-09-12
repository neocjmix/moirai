import { describe, expect, it, vi } from "vitest";
import { presentationScopeKey } from "@moirai/graph-presentation";
import { spatialRequestSchema } from "./moirai-spatial";
import { POST } from "../app/graph/spatial/route";
import { createMoiraiGraphReadLoader } from "../urdr-port/src/moirai-graph-read-loader";
const source = {
  world_id: "01995c2a-7b00-7000-8000-000000000101",
  served_revision: 4,
  canon_ids: ["019f4c00-0000-7000-8000-000000000102"],
  time_systems: []
};
const viewport = {
  canonIds: [
    presentationScopeKey({
      world_id: source.world_id,
      served_revision: 4,
      canon_id: source.canon_ids[0]!
    })
  ],
  bbox: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
  scale: 1,
  viewportWidth: 390,
  viewportHeight: 844,
  includeNeighbors: true
};
const empty = {
  revision: 4,
  canonicalRevision: 4,
  lodLevel: 0,
  entities: [],
  edges: [],
  regions: [],
  diagnostics: [],
  truncated: false,
  cache: { stale: false }
};
describe("bounded public spatial boundary", () => {
  it("rejects duplicate Worlds, arbitrary paths, scope substitution and excessive budgets", () => {
    const valid = { sources: [source], viewport };
    expect(spatialRequestSchema.safeParse(valid).success).toBe(true);
    for (const bad of [
      { ...valid, sources: [source, source] },
      { ...valid, sources: [{ ...source, world_id: "../../private" }] },
      { ...valid, viewport: { ...viewport, canonIds: ["other"] } },
      { ...valid, maxEntities: 2501 },
      { ...valid, viewport: { ...viewport, scale: Infinity } }
    ])
      expect(spatialRequestSchema.safeParse(bad).success).toBe(false);
  });
  it("bounds a chunked body even without Content-Length", async () => {
    const request = new Request("http://localhost/graph/spatial", {
      method: "POST",
      body: " ".repeat(65537)
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "query_too_large" });
  });
  it("sends source revisions and viewport without a full World payload, rejecting substituted revisions", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        viewport: empty,
        revision_vector: [{ world_id: source.world_id, served_revision: 4 }]
      })
    );
    const loader = createMoiraiGraphReadLoader({
      sources: [source],
      workspace: { menuItems: [], canons: [], tabs: [], defaultTabId: "" },
      loadEventDetail: async () => {
        throw Error("unused");
      },
      fetcher
    });
    expect(
      await loader.loadViewport("en", { ...viewport, currentTimeLevel: "year" })
    ).toEqual(empty);
    const request = JSON.parse(
      (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string
    );
    expect(request.sources).toEqual([source]);
    expect(request.viewport).toEqual({ ...viewport, currentTimeLevel: "full" });
    expect(request).not.toHaveProperty("events");
    fetcher.mockImplementation(async () =>
      Response.json({
        viewport: empty,
        revision_vector: [{ world_id: source.world_id, served_revision: 5 }]
      })
    );
    await expect(loader.loadViewport("en", viewport)).rejects.toThrow(
      "moirai_spatial_revision_mismatch"
    );
  });
});
