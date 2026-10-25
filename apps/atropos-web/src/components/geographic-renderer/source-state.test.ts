import { expect, it } from "vitest";
import {
  acceptGeographicSource as accept,
  failGeographicSource as fail,
  type GeographicSourceState
} from "./source-state";

const initial: GeographicSourceState = {
  key: undefined,
  generation: 0,
  failed: false
};

it("preserves a newly mounted source failure even when its acceptance is replayed afterward", () => {
  const old = accept(initial, "world-a:r1");
  const next = accept(old, "world-a:r2");
  const failed = fail(next, next.generation);
  expect(accept(failed, "world-a:r2")).toBe(failed);
  expect(failed.failed).toBe(true);
  // A same-source camera/selection response never retries the failed backend.
  for (let frame = 0; frame < 600; frame++)
    expect(accept(failed, "world-a:r2")).toBe(failed);
});

it("recovers regardless of whether the old failure arrives before or after the new source", () => {
  const old = accept(initial, "world-a:r2");
  const before = accept(fail(old, old.generation), "world-b:r1");
  const after = fail(accept(old, "world-b:r1"), old.generation);
  expect(before).toEqual(after);
  expect(after).toMatchObject({ key: "world-b:r1", failed: false });
  expect(after.generation).toBe(old.generation + 1);
});

it("scopes retries to actual changes including returning layouts and the default source", () => {
  const first = accept(initial, "world-a:r2");
  const failed = fail(first, first.generation);
  const returned = accept(accept(failed, "world-b:r1"), "world-a:r2");
  expect(returned.failed).toBe(false);
  expect(returned.generation).toBe(first.generation + 2);
  expect(fail(returned, first.generation)).toBe(returned);
  const current = accept(failed, undefined);
  expect(current).toMatchObject({ key: undefined, failed: false });
  const defaultFailed = fail(initial, initial.generation);
  expect(accept(defaultFailed, undefined)).toBe(defaultFailed);
});
