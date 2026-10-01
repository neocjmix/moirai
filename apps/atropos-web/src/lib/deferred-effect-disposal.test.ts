import { expect, it, vi } from "vitest";
import { createDeferredEffectDisposal } from "./deferred-effect-disposal";
it("survives StrictMode setup-cleanup-setup without destroying the memoized client", async () => {
  const dispose = vi.fn();
  const retain = createDeferredEffectDisposal(dispose);
  const first = retain();
  first();
  const second = retain();
  await Promise.resolve();
  expect(dispose).not.toHaveBeenCalled();
  second();
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();
});
it("disposes a genuinely replaced resource exactly once", async () => {
  const dispose = vi.fn();
  const retain = createDeferredEffectDisposal(dispose);
  const release = retain();
  release();
  release();
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();
});
