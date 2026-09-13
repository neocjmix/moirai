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
});
it("never treats truncated coverage as complete and bounds LRU retention", async () => {
  const read = vi.fn(async () => response(true));
  const load = createViewportCache(read);
  await load(query());
  await load(query(1));
  expect(read).toHaveBeenCalledTimes(2);
  for (let i = 1; i <= 8; i++) await load(query(i * 1000));
  await load(query());
  expect(read).toHaveBeenCalledTimes(11);
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
