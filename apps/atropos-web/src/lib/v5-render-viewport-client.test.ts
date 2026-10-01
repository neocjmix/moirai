import { describe, expect, it, vi } from "vitest";
import {
  createV5RenderViewportClient,
  type RenderViewportMetadata
} from "./v5-render-viewport-client";
import type { RenderPrimitive } from "@moirai/graph-presentation/server";
const box = (minX = 0, maxX = 10) => ({ minX, maxX, minY: 0, maxY: 10 });
const point = (id: string, collection: string, x = 1): RenderPrimitive => ({
  id,
  entity: { kind: "event", id },
  geometry: { kind: "point", xy: { x, y: 1 } },
  bounds: box(x, x),
  label: id,
  collectionIds: [collection],
  lod: { visible: [0, 3], groupId: id }
});
const external = (id: string, collection: string, x = 1): RenderPrimitive => ({
  ...point(id, collection, x),
  geometry: { kind: "external", key: `geometry/${id}`, sha256: id }
});
const metadata = (primitives: RenderPrimitive[]): RenderViewportMetadata => ({
  format: "render-viewport/1",
  world_id: "w",
  revision: 7,
  time_system_id: "t",
  generation: "g",
  algorithmVersion: "render-compiler/3",
  level: 3,
  maxLevel: 3,
  bounds: box(),
  coverage: [box()],
  primitives
});
const geom = (id: string) => ({
  key: `geometry/${id}`,
  sha256: id,
  body: {
    format: "render-geometry/1",
    worldId: "w",
    revision: 7,
    timeSystemId: "t",
    geometry: {
      kind: "polygon",
      rings: [
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 }
        ]
      ]
    }
  }
});
const client = (fetcher: ReturnType<typeof vi.fn>, maxBytes?: number) =>
  createV5RenderViewportClient({
    worldId: "w",
    revision: 7,
    timeSystemId: "t",
    fetcher: fetcher as typeof fetch,
    ...(maxBytes ? { maxBytes } : {})
  });
describe("viewport-first render reads", () => {
  it("has two cold requests and zero warm/toggle metadata requests, selecting geometry locally", async () => {
    const fetcher = vi.fn(async (_: unknown, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      if (q.kind === "viewport")
        return Response.json(
          metadata([external("a", "one"), external("b", "two")])
        );
      expect(q.generation).toBe("g");
      return Response.json({
        revision: 7,
        generation: "g",
        assets: q.assets.map((a: { sha256: string }) => geom(a.sha256))
      });
    });
    const c = client(fetcher);
    expect((await c.load(box(), ["one"])).primitives.map((p) => p.id)).toEqual([
      "a"
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await c.load(box(), ["one"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await c.load(box(), ["one", "two"])).primitives).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await c.load(box(), ["one"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      fetcher.mock.calls.map(
        ([, i]) => JSON.parse((i as RequestInit).body as string).kind
      )
    ).toEqual(["viewport", "assets", "assets"]);
  });
  it("requests only entering pan coverage and unions metadata before Collection filtering", async () => {
    const fetcher = vi.fn(async (_: unknown, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      return Response.json(
        metadata(q.exclude ? [point("b", "two", 12)] : [point("a", "one", 8)])
      );
    });
    const c = client(fetcher);
    await c.load(box(), ["one"]);
    expect(
      (await c.load(box(5, 15), ["one", "two"])).primitives.map((p) => p.id)
    ).toEqual(["a", "b"]);
    expect(
      JSON.parse(fetcher.mock.calls[1]![1].body as string).exclude
    ).toEqual([box()]);
  });
  it("requires both relation endpoint memberships", async () => {
    const p = {
      ...point("r", "one"),
      endpointCollectionIds: [["one"], ["two"]] as const
    };
    const c = client(vi.fn(async () => Response.json(metadata([p]))));
    expect((await c.load(box(), ["one"])).primitives).toHaveLength(0);
    expect((await c.load(box(), ["one", "two"])).primitives).toHaveLength(1);
  });
  it("pins generation across metadata and geometry and rejects same-revision swaps", async () => {
    const fetcher = vi.fn(async (_: unknown, init: RequestInit) =>
      JSON.parse(init.body as string).kind === "viewport"
        ? Response.json(metadata([external("a", "one")]))
        : Response.json({ revision: 7, generation: "new", assets: [geom("a")] })
    );
    await expect(client(fetcher).load(box(), ["one"])).rejects.toThrow(
      "render_geometry_batch_invalid"
    );
  });
  it("does not populate geometry from a late cancelled response", async () => {
    let release: (value: Response) => void = () => {};
    let assetCalls = 0;
    const fetcher = vi.fn(async (_: unknown, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      if (q.kind === "viewport")
        return Response.json(metadata([external("a", "one")]));
      assetCalls++;
      if (assetCalls === 1)
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return Response.json({
        revision: 7,
        generation: "g",
        assets: [geom("a")]
      });
    });
    const c = client(fetcher);
    const abort = new AbortController();
    const loading = c.load(box(), ["one"], abort.signal);
    const rejection = expect(loading).rejects.toThrow("Superseded");
    await vi.waitFor(() => expect(assetCalls).toBe(1));
    abort.abort();
    release(
      Response.json({ revision: 7, generation: "g", assets: [geom("a")] })
    );
    await rejection;
    await c.load(box(), ["one"]);
    expect(assetCalls).toBe(2);
  });
  it("batches more than 16 geometries in one normal request", async () => {
    const all = Array.from({ length: 30 }, (_, i) => external(`e${i}`, "one"));
    const fetcher = vi.fn(async (_: unknown, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      return Response.json(
        q.kind === "viewport"
          ? metadata(all)
          : {
              revision: 7,
              generation: "g",
              assets: q.assets.map((a: { sha256: string }) => geom(a.sha256))
            }
      );
    });
    expect(
      (await client(fetcher).load(box(), ["one"])).primitives
    ).toHaveLength(30);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects an oversized active working set even when geometry was warm", async () => {
    const all = [external("a", "one"), external("b", "two")];
    const fetcher = vi.fn(async (_: unknown, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      return Response.json(
        q.kind === "viewport"
          ? metadata(all)
          : {
              revision: 7,
              generation: "g",
              assets: q.assets.map((a: { sha256: string }) => geom(a.sha256))
            }
      );
    });
    const budget =
      new TextEncoder().encode(JSON.stringify(metadata(all))).length +
      new TextEncoder().encode(JSON.stringify(geom("a").body)).length +
      30;
    const c = client(fetcher, budget);
    await c.load(box(), ["one"]);
    await expect(c.load(box(), ["one", "two"])).rejects.toThrow(
      "render_working_set_budget_exceeded"
    );
  });
});
it("keeps dormant Composite hulls off the critical path and prefetches near transition", async () => {
  const p: RenderPrimitive = {
    ...external("h", "one"),
    entity: { kind: "composite", id: "h" },
    bounds: box(),
    composite: {
      childEventIds: ["a"],
      supportComplete: true,
      worldBounds: box(),
      hullBounds: box(),
      anchor: { x: 5, y: 5 }
    }
  };
  let finish: (value: Response) => void = () => {};
  const fetcher = vi.fn(async (_: unknown, init: RequestInit) => {
    const q = JSON.parse(init.body as string);
    if (q.kind === "viewport") return Response.json(metadata([p]));
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const c = client(fetcher);
  const cold = await c.load(box(), ["one"], undefined, undefined, {
    scaleX: 1,
    scaleY: 1
  });
  expect(cold.primitives[0]!.geometry.kind).toBe("point");
  expect(fetcher).toHaveBeenCalledTimes(1);
  const near = await c.load(box(), ["one"], undefined, undefined, {
    scaleX: 2.5,
    scaleY: 2.5
  });
  expect(near.primitives[0]!.geometry.kind).toBe("point");
  expect(fetcher).toHaveBeenCalledTimes(2);
  finish(Response.json({ revision: 7, generation: "g", assets: [geom("h")] }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const active = await c.load(box(), ["one"], undefined, undefined, {
    scaleX: 4,
    scaleY: 4
  });
  expect(active.primitives[0]!.geometry.kind).toBe("polygon");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("refreshes a finer level when zoom stays inside cached coarse coverage", async () => {
  const frame = {
    originX: 0,
    originY: 0,
    baseSpanX: 4096,
    baseSpanY: 16384,
    minLevel: -8,
    maxLevel: 12
  };
  const fetcher = vi.fn(async () => {
    return Response.json({
      ...metadata([
        point(fetcher.mock.calls.length === 1 ? "coarse" : "fine", "one")
      ]),
      spatialFrame: frame,
      level: fetcher.mock.calls.length === 1 ? 3 : 12,
      visibility: { hasOmitted: true }
    });
  });
  const c = client(fetcher);
  await c.load(box(0, 1000), ["one"]);
  const zoom = await c.load(box(0, 1), ["one"]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(zoom.metadata.level).toBe(12);
  expect(zoom.primitives.some((p) => p.id === "fine")).toBe(true);
});
it("does not retain deselected polygon hulls or lines as point fade-outs", async () => {
  const polygon: RenderPrimitive = {
    ...point("h", "one"),
    entity: { kind: "composite", id: "h" },
    geometry: {
      kind: "polygon",
      rings: [
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 }
        ]
      ]
    }
  };
  const line: RenderPrimitive = {
    ...point("s", "one"),
    geometry: {
      kind: "line",
      paths: [
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 }
        ]
      ]
    }
  };
  const c = client(vi.fn(async () => Response.json(metadata([polygon, line]))));
  expect((await c.load(box(), ["one"])).primitives).toHaveLength(2);
  expect((await c.load(box(), [])).primitives).toHaveLength(0);
});
