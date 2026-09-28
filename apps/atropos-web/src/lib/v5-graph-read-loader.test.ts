import { afterEach, expect, it, vi } from "vitest";
import { createV5GraphReadLoader } from "./v5-graph-read-loader";
import { graphReadLoader } from "../urdr-port/src/graph-read-loader";
import { reconcileViewport } from "../urdr-port/src/viewport-cache";
import type {
  GraphShellViewportQuery as Query,
  GraphShellViewportResponse as Viewport
} from "../urdr-port/shared/contracts";

const query = (x = 0): Query => ({
  canonIds: ["collection"],
  bbox: { minX: x - 200, maxX: x + 200, minY: -200, maxY: 200 },
  scale: 1,
  viewportWidth: 100,
  viewportHeight: 100,
  includeNeighbors: false,
  artifactClasses: ["point", "segment", "region"]
});
async function setup(fetcher: typeof fetch, revision = 1) {
  return createV5GraphReadLoader({
    worldId: "world",
    revision,
    timeSystemId: "time",
    collectionIds: ["collection"],
    relationTypes: ["CAUSES"],
    workspace: await graphReadLoader.loadWorkspace("ko"),
    fetcher
  });
}
async function snapshot(x = 0, truncated = true): Promise<Viewport> {
  const value = await graphReadLoader.loadViewport("ko", query());
  return {
    ...value,
    truncated,
    entities: Array.from({ length: 100 }, (_, i) => ({
      ...value.entities[0]!,
      id: `point:${x}:${i}`,
      eventId: `point:${x}:${i}`,
      position: { x: x + i, y: 0 }
    })),
    regions: [{ ...value.regions[0]!, id: `region:${x}` }],
    edges: [{ ...value.edges[0]!, id: `edge:${x}` }]
  };
}
afterEach(() => vi.useRealTimers());

const continuation = (offset: number) => ({
  selection_digest: "a".repeat(64),
  spatial: {
    query_digest: "b".repeat(64),
    pending: [
      {
        key: "node",
        level: 0,
        offset,
        bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }
      }
    ]
  }
});

it("continues past empty filtered batches and unions late historical events without duplicates", async () => {
  const first = await snapshot();
  const last = await snapshot(1000, false);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        ...first,
        entities: [],
        regions: [],
        edges: [],
        next_cursor: continuation(1)
      })
    )
    .mockResolvedValueOnce(
      Response.json({ ...first, next_cursor: continuation(2) })
    )
    .mockResolvedValueOnce(
      Response.json({
        ...last,
        entities: [first.entities[0], ...last.entities],
        next_cursor: null
      })
    );
  const loader = await setup(fetcher);
  const value = await loader.loadViewport("ko", query());
  expect(value.entities).toHaveLength(200);
  expect(value.entities.some((e) => e.id === "point:1000:99")).toBe(true);
  expect(value.completeness).toMatchObject({
    entities: true,
    regions: true,
    edges: false
  });
  expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body)).cursor).toEqual(
    continuation(1)
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
  loader.dispose?.();
});

it("rejects a stalled continuation instead of caching incomplete success", async () => {
  const value = { ...(await snapshot()), next_cursor: continuation(1) };
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(value));
  const loader = await setup(fetcher);
  await expect(loader.loadViewport("ko", query())).rejects.toThrow(
    "v5_shell_cursor_stalled"
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  loader.dispose?.();
});

it("cancels an in-flight continuation on selection disposal", async () => {
  const value = await snapshot();
  let finish!: (response: Response) => void;
  let continuationSignal!: AbortSignal;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ ...value, next_cursor: continuation(1) })
    )
    .mockImplementationOnce((_url, init) => {
      continuationSignal = init!.signal!;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
  const loader = await setup(fetcher);
  const loading = loader.loadViewport("ko", query());
  const rejected = expect(loading).rejects.toMatchObject({
    name: "AbortError"
  });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  loader.dispose?.();
  expect(continuationSignal.aborted).toBe(true);
  finish(Response.json({ ...value, next_cursor: null }));
  await rejected;
});

it("returning to cached A cancels pending B before parsing its late body", async () => {
  const first = await snapshot();
  let finish!: (response: Response) => void;
  let pendingSignal!: AbortSignal;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(first))
    .mockImplementationOnce((_url, init) => {
      pendingSignal = init!.signal!;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
  const loader = await setup(fetcher);
  const home = await loader.loadViewport("ko", query());
  const away = loader.loadViewport("ko", query(1000));
  const rejected = expect(away).rejects.toMatchObject({ name: "AbortError" });
  expect(await loader.loadViewport("ko", query())).toBe(home);
  expect(pendingSignal.aborted).toBe(true);
  expect(loader.inspectViewport?.()).toMatchObject({
    pending: 0,
    aborted: 1,
    hits: 1
  });
  const late = Response.json(await snapshot(1000));
  const parse = vi.spyOn(late, "json");
  finish(late);
  await rejected;
  expect(parse).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(2);
  loader.dispose?.();
});

it("30 distinct visits and a return keep only the current snapshot, including its regions and edges", async () => {
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return Response.json(await snapshot(body.viewport.bbox.minX + 200));
  });
  const loader = await setup(fetcher);
  let active: Viewport | null = null;
  for (const x of [...Array.from({ length: 30 }, (_, i) => i * 1000), 0]) {
    const received = await loader.loadViewport("ko", query(x));
    active = reconcileViewport(active, received, loader.viewportMode);
    expect(active.entities).toHaveLength(100);
    expect(active.regions.map((e) => e.id)).toEqual([`region:${x}`]);
    expect(active.edges.map((e) => e.id)).toEqual([`edge:${x}`]);
    expect(active.truncated).toBe(true);
  }
  expect(active!.entities[0]!.id).toBe("point:0:0");
  expect(fetcher).toHaveBeenCalledTimes(31); // first visit was evicted
  await loader.loadViewport("ko", query());
  expect(fetcher).toHaveBeenCalledTimes(31);
  loader.dispose?.();
});

it("coalesces exact partial reads, never uses partial coverage, and revalidates after 30 seconds", async () => {
  vi.useFakeTimers();
  const value = await snapshot();
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(value));
  const loader = await setup(fetcher);
  const [a, b] = await Promise.all([
    loader.loadViewport("ko", query()),
    loader.loadViewport("ko", query())
  ]);
  expect(a).toBe(b);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await loader.loadViewport("ko", query(1));
  expect(fetcher).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(29_999);
  await loader.loadViewport("ko", query());
  expect(fetcher).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(1);
  fetcher.mockResolvedValueOnce(
    Response.json({ error: "revision_changed" }, { status: 409 })
  );
  await expect(loader.loadViewport("ko", query())).rejects.toThrow(
    "v5_shell_unavailable"
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
  loader.dispose?.();
});

it("reuses complete padded coverage but separates scale, filters and revision instances", async () => {
  const value = await snapshot(0, false);
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(value));
  const loader = await setup(fetcher);
  await loader.loadViewport("ko", query());
  await loader.loadViewport("ko", query(50));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await loader.loadViewport("ko", { ...query(), scale: 2 });
  await loader.loadViewport("ko", { ...query(), canonIds: ["other"] });
  expect(fetcher).toHaveBeenCalledTimes(3);
  const next = await setup(fetcher, 2);
  await expect(next.loadViewport("ko", query())).rejects.toThrow(
    "v5_shell_revision_mismatch"
  );
  expect(fetcher).toHaveBeenCalledTimes(4);
  loader.dispose?.();
  next.dispose?.();
});

it("aborts a superseded request and page exit, and ignores late transport results", async () => {
  const pending: { signal: AbortSignal; resolve: (r: Response) => void }[] = [];
  const fetcher = vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise((resolve) => {
        pending.push({ signal: init!.signal!, resolve });
      })
  );
  const loader = await setup(fetcher);
  const first = loader.loadViewport("ko", query());
  const rejectedFirst = expect(first).rejects.toMatchObject({
    name: "AbortError"
  });
  const second = loader.loadViewport("ko", query(1000));
  const rejectedSecond = expect(second).rejects.toMatchObject({
    name: "AbortError"
  });
  expect(pending[0]!.signal.aborted).toBe(true);
  expect(pending[1]!.signal.aborted).toBe(false);
  loader.dispose?.();
  expect(pending[1]!.signal.aborted).toBe(true);
  const value = await snapshot();
  pending.forEach((p) => p.resolve(Response.json(value)));
  await Promise.all([rejectedFirst, rejectedSecond]);
  fetcher.mockImplementation(async () => Response.json(value));
  await loader.loadViewport("ko", query());
  expect(fetcher).toHaveBeenCalledTimes(3);
  loader.dispose?.();
});
