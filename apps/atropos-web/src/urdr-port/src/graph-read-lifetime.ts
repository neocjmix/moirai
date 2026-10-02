/** A disposed screen cannot start network work; its existing reads are aborted. */
export function createGraphReadLifetime() {
  let disposed = false;
  const pending = new Set<AbortController>();
  const assertActive = (signal?: AbortSignal) => {
    if (disposed || signal?.aborted)
      throw new DOMException("Graph read disposed", "AbortError");
  };
  return {
    assertActive,
    async read<T>(
      run: (signal: AbortSignal) => Promise<T>,
      signal?: AbortSignal
    ): Promise<T> {
      assertActive(signal);
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      pending.add(controller);
      try {
        const value = await run(controller.signal);
        assertActive(controller.signal);
        return value;
      } finally {
        signal?.removeEventListener("abort", abort);
        pending.delete(controller);
      }
    },
    dispose() {
      disposed = true;
      for (const controller of pending) controller.abort();
      pending.clear();
    }
  };
}
