import { afterEach, expect, it, vi } from "vitest";
import { createViewportReadScheduler } from "./viewport-read-scheduler";
afterEach(() => vi.useRealTimers());
it("keeps reading the latest camera during continuous motion instead of resetting a debounce", async () => {
  vi.useFakeTimers();
  const scheduler = createViewportReadScheduler();
  const seen: number[] = [];
  for (let frame = 0; frame < 60; frame++) {
    const camera = frame;
    scheduler.request(async () => { seen.push(camera); }, 150);
    await vi.advanceTimersByTimeAsync(16);
  }
  expect(seen.length).toBeGreaterThanOrEqual(6);
  expect(seen[0]).toBe(0);
  expect(seen.at(-1)).toBeGreaterThan(50);
  scheduler.dispose();
});
it("finishes a slow read and drains only the newest queued camera without overlapping requests", async () => {
  vi.useFakeTimers();
  const scheduler = createViewportReadScheduler();
  const seen: number[] = [];
  let release!: () => void;
  scheduler.request(async () => { seen.push(0); await new Promise<void>(resolve => { release = resolve; }); }, 150);
  await vi.advanceTimersByTimeAsync(0);
  for (let frame = 1; frame <= 30; frame++) {
    const camera = frame;
    scheduler.request(async () => { seen.push(camera); }, 150);
    await vi.advanceTimersByTimeAsync(16);
  }
  expect(seen).toEqual([0]);
  release();
  await vi.advanceTimersByTimeAsync(1);
  expect(seen).toEqual([0, 30]);
  scheduler.dispose();
});
it("disposes old context and recovers scheduling after a rejected read", async () => {
  vi.useFakeTimers();
  const scheduler = createViewportReadScheduler();
  scheduler.request(async () => { throw Error("temporary read failure"); });
  await vi.advanceTimersByTimeAsync(1);
  const task = vi.fn(async () => {});
  scheduler.request(task);
  await vi.advanceTimersByTimeAsync(1);
  expect(task).toHaveBeenCalledTimes(1);
  scheduler.request(task, 150);
  scheduler.dispose();
  await vi.advanceTimersByTimeAsync(1000);
  expect(task).toHaveBeenCalledTimes(1);
  expect(scheduler.active).toBe(false);
});
