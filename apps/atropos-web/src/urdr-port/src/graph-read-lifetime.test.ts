import { expect, it, vi } from "vitest";
import { createDeferredEffectDisposal } from "../../lib/deferred-effect-disposal";
import { createGraphReadLifetime } from "./graph-read-lifetime";

it("cancels an obsolete detail and rejects its late successful completion", async () => {
  const lifetime = createGraphReadLifetime();
  const selection = new AbortController();
  let complete!: (value: string) => void;
  let requestSignal!: AbortSignal;
  const pending = lifetime.read((signal) => {
    requestSignal = signal;
    return new Promise<string>((resolve) => {
      complete = resolve;
    });
  }, selection.signal);
  selection.abort();
  expect(requestSignal.aborted).toBe(true);
  complete("obsolete detail");
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await expect(lifetime.read(async () => "new selection")).resolves.toBe(
    "new selection"
  );
});

it("stops all outstanding reads and never calls a transport after disposal", async () => {
  const lifetime = createGraphReadLifetime();
  const signals: AbortSignal[] = [];
  const pending = Array.from({ length: 2 }, () =>
    lifetime.read((signal) => {
      signals.push(signal);
      return new Promise<void>((_resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        )
      );
    })
  );
  lifetime.dispose();
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  for (const read of pending)
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
  const transport = vi.fn(async () => "unexpected");
  await expect(lifetime.read(transport)).rejects.toMatchObject({
    name: "AbortError"
  });
  expect(transport).not.toHaveBeenCalled();
});

it("keeps a read resource usable through StrictMode setup-cleanup-setup", async () => {
  const lifetime = createGraphReadLifetime();
  const retain = createDeferredEffectDisposal(() => lifetime.dispose());
  const first = retain();
  first();
  const second = retain();
  await Promise.resolve();
  await expect(lifetime.read(async () => "active")).resolves.toBe("active");
  second();
  await Promise.resolve();
  await expect(lifetime.read(async () => "disposed")).rejects.toMatchObject({
    name: "AbortError"
  });
});
