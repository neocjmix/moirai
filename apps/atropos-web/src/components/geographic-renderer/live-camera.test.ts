import { afterEach, expect, it, vi } from "vitest";
import { createLiveCamera, createSceneScheduler } from "./live-camera";
import {
  geographicMeshFrame,
  geographicPaintTransform
} from "../geographic-mesh-reuse";
afterEach(() => vi.useRealTimers());
it("camera publication is synchronous and uses independent axes plus viewport origin", () => {
  const scene = { x: 19, y: -27, scaleX: 2, scaleY: 5 };
  const live = { x: -61, y: 32, scaleX: 7, scaleY: 3 };
  const camera = createLiveCamera(scene);
  let observed = scene;
  const stop = camera.subscribe(() => (observed = camera.get()));
  camera.publish(live);
  expect(observed).toBe(live);
  const size = { width: 390, height: 844 };
  const [sx, sy, tx, ty] = geographicPaintTransform(
    geographicMeshFrame(scene, size)!,
    live,
    size
  )!;
  const world = { x: 17, y: -63 };
  expect(
    (size.width / 2 + scene.x + world.x * scene.scaleX) * sx + tx
  ).toBeCloseTo(size.width / 2 + live.x + world.x * live.scaleX);
  expect(
    (size.height / 2 + scene.y + world.y * scene.scaleY) * sy + ty
  ).toBeCloseTo(size.height / 2 + live.y + world.y * live.scaleY);
  stop();
  camera.publish(scene);
  expect(observed).toBe(live);
});
it("coalesces intermediate cameras, immediately schedules settle and disposes pending work", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const publish = vi.fn();
  const jobs = createSceneScheduler(publish);
  jobs.request(false);
  vi.advanceTimersByTime(0);
  expect(publish).toHaveBeenLastCalledWith(1);
  for (let i = 0; i < 10; i++) {
    jobs.request(false);
    vi.advanceTimersByTime(5);
  }
  expect(jobs.inspect().pending).toBe(1);
  expect(publish).toHaveBeenCalledTimes(1);
  jobs.request(true);
  expect(publish).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(0);
  expect(publish).toHaveBeenLastCalledWith(12);
  jobs.request(false);
  jobs.dispose();
  vi.advanceTimersByTime(200);
  expect(publish).toHaveBeenCalledTimes(2);
});

it("allows the current intermediate scene until the next job starts, and invalidates it immediately on settle", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const jobs = createSceneScheduler(() => {});
  jobs.request(false);
  vi.advanceTimersByTime(0);
  expect(jobs.accepts(1)).toBe(true);
  jobs.request(false);
  vi.advanceTimersByTime(30);
  expect(jobs.accepts(1)).toBe(true);
  vi.advanceTimersByTime(90);
  expect(jobs.accepts(1)).toBe(false);
  expect(jobs.accepts(2)).toBe(true);
  jobs.request(true);
  expect(jobs.accepts(2)).toBe(false);
  jobs.dispose();
});
