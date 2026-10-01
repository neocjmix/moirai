/** React StrictMode replays an effect without replacing its memoized resource.
 * Release after the microtask boundary, unless that same resource was retained
 * again. Real unmount/replacement still cancels its work and clears its cache. */
export function createDeferredEffectDisposal(dispose: () => void) {
  let leases = 0;
  let version = 0;
  return () => {
    leases++;
    version++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      leases--;
      const ticket = ++version;
      queueMicrotask(() => {
        if (leases === 0 && ticket === version) dispose();
      });
    };
  };
}
