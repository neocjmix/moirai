import type { GeographicView } from "./contract";

/** Imperative camera channel. Publishing never schedules a React render. */
export function createLiveCamera(initial: GeographicView) {
  let view = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => view,
    publish(next: GeographicView) {
      view = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
export type LiveCamera = ReturnType<typeof createLiveCamera>;

/** Latest wins; no backlog. A settle replaces the delayed intermediate job. */
export function createSceneScheduler(publish: (generation: number) => void) {
  let generation = 0;
  let activeGeneration = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = -Infinity;
  let disposed = false;
  let discarded = 0;
  return {
    resume() {
      disposed = false;
    },
    request(settled: boolean) {
      if (disposed) return;
      generation++;
      if (timer !== undefined) {
        clearTimeout(timer);
        discarded++;
      }
      const token = generation;
      if (settled) activeGeneration = token;
      timer = setTimeout(
        () => {
          timer = undefined;
          if (disposed || token !== generation) return;
          last = performance.now();
          activeGeneration = token;
          publish(token);
        },
        settled ? 0 : Math.max(0, 120 - (performance.now() - last))
      );
    },
    accepts: (token: number) => !disposed && token === activeGeneration,
    inspect: () => ({
      generation,
      pending: Number(timer !== undefined),
      discarded
    }),
    dispose() {
      disposed = true;
      generation++;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    }
  };
}
