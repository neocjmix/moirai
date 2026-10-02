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

it("uses the fetched spatial margin during pan and refills before the camera reaches its edge", async () => {
  const fetcher = vi.fn(async (_: unknown, init: RequestInit) => {
    expect(JSON.parse(init.body as string).kind).toBe("viewport");
    return Response.json(metadata([point("a", "one", 5)]));
  });
  const c = client(fetcher);
  const load = (shift: number) =>
    c.load(box(shift, 10 + shift), ["one"], undefined, undefined, {
      scaleX: 1,
      scaleY: 1,
      visibleViewport: {
        minX: 3.75 + shift,
        maxX: 6.25 + shift,
        minY: 3.75,
        maxY: 6.25
      }
    });
  const first = await load(0);
  for (let shift = 0.1; shift <= 2.4; shift += 0.1) {
    const next = await load(shift);
    expect(next.primitives[0]).toBe(first.primitives[0]);
  }
  expect(fetcher).toHaveBeenCalledTimes(1);
  await load(2.6);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string).exclude).toEqual(
    [box()]
  );
});

it("retains bounded immutable level snapshots for zoom reversals without restarting identity", async () => {
  const fetcher = vi.fn(async (_: unknown, init: RequestInit) => {
    const q = JSON.parse(init.body as string);
    return Response.json({
      ...metadata([point("same-event", "one")]),
      level: q.level
    });
  });
  const c = client(fetcher);
  const first = await c.load(box(), ["one"], undefined, 2);
  await c.load(box(), ["one"], undefined, 3);
  const back = await c.load(box(), ["one"], undefined, 2);
  expect(back.primitives[0]).toBe(first.primitives[0]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (let level = 4; level < 12; level++) {
    const scene = await c.load(box(), ["one"], undefined, level);
    expect(scene.cache.entries).toBeLessThanOrEqual(6);
  }
  await c.load(box(), ["one"], undefined, 2);
  expect(fetcher).toHaveBeenCalledTimes(11);
});

it("expires level snapshots from their original read despite repeated warm visits", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(0);
  try {
    const fetcher = vi.fn(async () =>
      Response.json(metadata([point("a", "one")]))
    );
    const c = client(fetcher);
    await c.load(box(), ["one"]);
    now.mockReturnValue(29_999);
    await c.load(box(), ["one"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now.mockReturnValue(30_000);
    await c.load(box(), ["one"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    now.mockRestore();
  }
});

it("promotes a pending hull buffer read across camera changes without abort or duplicate fetch", async () => {
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
  let bufferSignal: AbortSignal | null | undefined;
  const fetcher = vi.fn(async (_: unknown, init: RequestInit) => {
    if (JSON.parse(init.body as string).kind === "viewport")
      return Response.json(metadata([p]));
    bufferSignal = init.signal;
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const c = client(fetcher);
  const load = (scale: number) =>
    c.load(box(), ["one"], undefined, undefined, {
      scaleX: scale,
      scaleY: scale
    });
  expect((await load(2.5)).primitives[0]!.geometry.kind).toBe("point");
  expect((await load(2.8)).primitives[0]!.geometry.kind).toBe("point");
  const active = load(4);
  expect(bufferSignal?.aborted).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(2);
  finish(Response.json({ revision: 7, generation: "g", assets: [geom("h")] }));
  const ready = await active;
  expect(ready.primitives[0]!.entity.id).toBe("h");
  expect(ready.primitives[0]!.geometry.kind).toBe("polygon");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("evicts old metadata before exceeding the combined geometry and snapshot budget", async () => {
  const value = metadata([point("a", "one")]);
  const budget = new TextEncoder().encode(JSON.stringify(value)).length + 20;
  const fetcher = vi.fn(async (_: unknown, init: RequestInit) => {
    const q = JSON.parse(init.body as string);
    return Response.json({ ...value, level: q.level });
  });
  const c = client(fetcher, budget);
  for (let level = 0; level < 10; level++) {
    const result = await c.load(box(), ["one"], undefined, level);
    expect(result.cache.bytes).toBeLessThanOrEqual(budget);
    expect(result.cache.entries).toBe(1);
  }
});

const square = (min: number, max: number) => ({
  minX: min,
  maxX: max,
  minY: min,
  maxY: max
});
const fixedMetadata = (
  level: number,
  hasOmitted: boolean,
  primitives: RenderPrimitive[]
): RenderViewportMetadata => ({
  ...metadata(primitives),
  algorithmVersion: "render-compiler/4",
  level,
  maxLevel: 2,
  completeness: !hasOmitted,
  spatialFrame: {
    originX: 0,
    originY: 0,
    baseSpanX: 8,
    baseSpanY: 8,
    minLevel: 0,
    maxLevel: 2
  },
  visibility: {
    policy: "render-visibility/1",
    candidateCount: primitives.length + Number(hasOmitted),
    omittedCount: Number(hasOmitted),
    hasOmitted,
    counting: "tile-occurrences",
    readCoverage: "full",
    budgets: { normal: 64, small: 32, buffer: 32 }
  }
});

it("computes first inward zoom locally when complete metadata already has every authored alternative", async () => {
  const fetcher = vi.fn(async () =>
    Response.json(fixedMetadata(1, false, [point("shared", "one", 8)]))
  );
  const c = client(fetcher);
  const first = await c.load(square(0, 16), ["one"], undefined, undefined, {
    scaleX: 1,
    scaleY: 1,
    visibleViewport: square(6, 10)
  });
  const zoom = await c.load(square(4, 12), ["one"], undefined, undefined, {
    scaleX: 2,
    scaleY: 2,
    visibleViewport: square(7, 9)
  });
  expect(zoom.primitives[0]).toBe(first.primitives[0]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("prepares a bounded finer candidate level without blocking paint and promotes it on the first zoom", async () => {
  const shared = point("shared", "one", 8);
  let finish: (value: Response) => void = () => {};
  let bufferSignal: AbortSignal | null | undefined;
  const fetcher = vi.fn(async (_: unknown, init: RequestInit) => {
    const q = JSON.parse(init.body as string);
    if (q.level === undefined)
      return Response.json(fixedMetadata(1, true, [shared]));
    expect(q.level).toBe(2);
    expect(q.viewport).toEqual(square(4, 12));
    bufferSignal = init.signal;
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const c = client(fetcher);
  const load = (wide: boolean) =>
    c.load(
      wide ? square(0, 16) : square(4, 12),
      ["one"],
      undefined,
      undefined,
      {
        scaleX: wide ? 1 : 2,
        scaleY: wide ? 1 : 2,
        visibleViewport: wide ? square(6, 10) : square(7, 9)
      }
    );
  const wide = await load(true);
  expect(wide.primitives.map((p) => p.id)).toEqual(["shared"]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const zoom = load(false);
  expect(bufferSignal?.aborted).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(2);
  finish(
    Response.json(fixedMetadata(2, false, [shared, point("new", "one", 9)]))
  );
  expect((await zoom).primitives.map((p) => p.id)).toEqual(["new", "shared"]);
  await load(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
