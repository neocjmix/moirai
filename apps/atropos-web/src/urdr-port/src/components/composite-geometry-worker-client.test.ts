import { afterEach, expect, it, vi } from "vitest";
import {
  createCompositeGeometryWorker,
  type CompositeGeometryJob,
  type CompositeGeometryResult
} from "./composite-geometry-worker-client";
let instance: FakeWorker;
class FakeWorker {
  onmessage: ((event: MessageEvent<CompositeGeometryResult>) => void) | null =
    null;
  onerror: (() => void) | null = null;
  sent: CompositeGeometryJob[] = [];
  constructor() {
    instance = this;
  }
  postMessage(job: CompositeGeometryJob) {
    this.sent.push(job);
  }
  terminate() {}
  finish(generation: number) {
    this.onmessage?.(
      new MessageEvent<CompositeGeometryResult>("message", {
        data: { generation, entries: [], timingMs: 1, stats: {} }
      })
    );
  }
}
const job = (generation: number): CompositeGeometryJob => ({
  generation,
  view: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
  viewport: { width: 390, height: 844 },
  tuning: { smoothing: 0.5, cornerFloor: 0.1, balanceFloor: 0.1 },
  labelHeight: 18,
  labelGap: 4,
  regions: []
});
afterEach(() => vi.unstubAllGlobals());
it("drops superseded pending and running results, then drains only the newest camera", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const bridge = createCompositeGeometryWorker();
  const first = bridge.prepare(job(1)),
    second = bridge.prepare(job(2)),
    latest = bridge.prepare(job(3));
  expect(instance.sent.map((j) => j.generation)).toEqual([1]);
  await expect(second).resolves.toBeNull();
  instance.finish(1);
  await expect(first).resolves.toBeNull();
  expect(instance.sent.map((j) => j.generation)).toEqual([1, 3]);
  instance.finish(3);
  await expect(latest).resolves.toMatchObject({ generation: 3 });
  expect(bridge.inspect()).toEqual({ running: 0, pending: 0, failed: false });
  bridge.dispose();
});
it("worker failure releases pending work and allows main-thread fallback", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const bridge = createCompositeGeometryWorker();
  const pending = bridge.prepare(job(1));
  instance.onerror?.();
  await expect(pending).resolves.toBeNull();
  expect(bridge.inspect().failed).toBe(true);
  await expect(bridge.prepare(job(2))).resolves.toBeNull();
});
