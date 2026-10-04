import { expect, it, vi } from "vitest";
import { createViewportCache, reconcileViewport } from "./viewport-cache";
import type {
  GraphShellViewportQuery as Q,
  GraphShellViewportResponse as R
} from "../shared/contracts";
const query = (x = 0): Q => ({
  canonIds: ["k"],
  bbox: { minX: x - 200, maxX: x + 200, minY: -200, maxY: 200 },
  scale: 1,
  viewportWidth: 100,
  viewportHeight: 100,
  includeNeighbors: false,
  artifactClasses: ["point", "segment", "region"]
});
const response = (truncated = false): R => ({
  revision: 1,
  canonicalRevision: 1,
  lodLevel: 0,
  entities: [],
  regions: [],
  edges: [],
  diagnostics: [],
  truncated,
  cache: { stale: false }
});
it("reuses padded coverage and in-flight requests but separates selection and Canon scope", async () => {
  const read = vi.fn(async () => response());
  const load = createViewportCache(read);
  await Promise.all([load(query()), load(query())]);
  expect(read).toHaveBeenCalledTimes(1);
  await load(query(50));
  expect(read).toHaveBeenCalledTimes(1);
  await load(query(180));
  expect(read).toHaveBeenCalledTimes(2);
  await load({ ...query(), selectedEntityId: "new", includeNeighbors: true });
  expect(read).toHaveBeenCalledTimes(3);
  await load({ ...query(), canonIds: ["other"] });
  expect(read).toHaveBeenCalledTimes(4);
  await load({ ...query(), canonIds: ["k", "other"] });
  await load({ ...query(), canonIds: ["other", "k"] });
  expect(read).toHaveBeenCalledTimes(6);
});
it("bounds LRU retention", async () => {
  const read = vi.fn(async () => response());
  const load = createViewportCache(read);
  await load(query());
  await load(query(500));
  expect(read).toHaveBeenCalledTimes(2);
  for (let i = 1; i <= 8; i++) await load(query(i * 1000));
  await load(query());
  expect(read).toHaveBeenCalledTimes(11);
  expect(load.inspect()).toMatchObject({
    entries: 8,
    requests: 11,
    pending: 0,
    maxEntries: 8
  });
  expect(load.inspect().bytes).toBeLessThanOrEqual(load.inspect().maxBytes);
  const inspection = load.inspect();
  inspection.entries = 1000;
  expect(load.inspect().entries).toBe(8);
});
it("retries incomplete and stale responses even at the same viewport", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(response(true))
    .mockResolvedValueOnce({ ...response(), cache: { stale: true } })
    .mockResolvedValue(response());
  const load = createViewportCache(read);
  await load(query());
  await load(query());
  await load(query());
  await load(query(1));
  expect(read).toHaveBeenCalledTimes(3);
});
it("cancels the oldest of three active reads and does not cache failure", async () => {
  const signals: AbortSignal[] = [];
  const load = createViewportCache((_q, signal) => {
    signals.push(signal);
    return new Promise<R>((_, reject) =>
      signal.addEventListener("abort", () => reject(new Error("aborted")))
    );
  });
  const a = load(query()).catch(() => null);
  const b = load(query(1000));
  const c = load(query(2000));
  void b;
  void c;
  await a;
  expect(signals[0]!.aborted).toBe(true);
  expect(signals[1]!.aborted).toBe(false);
});
it("partial updates retain existing edges, complete updates evict them", () => {
  const old = { ...response(), edges: [{ id: "edge" }] } as R;
  expect(reconcileViewport(old, response(true)).edges).toEqual(old.edges);
  expect(reconcileViewport(old, response()).edges).toEqual([]);
});
it("retains identical parsed snapshots but publishes every changed response field", () => {
  const old = {
    ...response(),
    entities: [{ id: "event", renderDensity: { opacity: 0.5 } }]
  } as unknown as R;
  for (const mode of ["snapshot", "incremental"] as const) {
    expect(reconcileViewport(old, structuredClone(old), mode)).toBe(old);
    for (const changed of [
      { ...old, revision: 2 },
      { ...old, canonicalRevision: 2 },
      { ...old, lodLevel: 1 },
      { ...old, entities: [{ id: "event", renderDensity: { opacity: 0.4 } }] },
      { ...old, diagnostics: [{ message: "changed" }] },
      { ...old, entities: [] },
      { ...old, nextSuggestedLod: 2 }
    ] as R[]) {
      expect(reconcileViewport(old, changed, mode)).toBe(changed);
    }
  }
  const partial = { ...old, truncated: true, cache: { stale: true } };
  expect(reconcileViewport(old, partial, "snapshot")).toBe(partial);
  expect(reconcileViewport(null, old, "snapshot")).toBe(old);
});
it("disposes pending reads on page exit without retaining a late response", async () => {
  let finish!: (value: R) => void;
  let signal!: AbortSignal;
  const read = vi.fn((_query: Q, abort: AbortSignal) => {
    signal = abort;
    return new Promise<R>((resolve) => {
      finish = resolve;
    });
  });
  const load = createViewportCache(read);
  const pending = load(query());
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError"
  });
  load.dispose();
  expect(signal.aborted).toBe(true);
  finish(response());
  await rejected;
  read.mockImplementation(async () => response());
  await load(query());
  expect(read).toHaveBeenCalledTimes(2);
});
it("recomputes camera-local scenes inside cached metadata coverage when requested", async () => {
  const read = vi.fn(async () => response());
  const load = createViewportCache(read, { reuseCoverage: false });
  await load(query());
  await load(query(50));
  expect(read).toHaveBeenCalledTimes(2);
  await load(query(50));
  expect(read).toHaveBeenCalledTimes(2);
});
