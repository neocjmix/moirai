import { createCompositePanGeometryCache } from "./composite-pan-geometry";
import type { CompositeGeometryJob } from "./composite-geometry-worker-client";
const cache = createCompositePanGeometryCache();
self.onmessage = (event: MessageEvent<CompositeGeometryJob>) => {
  const job = event.data;
  const started = performance.now();
  try {
    const ids = new Set<string>();
    for (const region of job.regions) {
      ids.add(region.id);
      const points = Array.from(
        { length: region.coordinates.length / 2 },
        (_, i) => ({
          x: region.coordinates[i * 2]!,
          y: region.coordinates[i * 2 + 1]!
        })
      );
      const geometry = cache.project({
        ...region,
        points,
        view: job.view,
        viewport: job.viewport,
        tuning: job.tuning,
        labelHeight: job.labelHeight,
        labelGap: job.labelGap
      });
      // Native text paths are prepared in this worker-owned bounded cache.
      void geometry.labelPathFrame;
    }
    cache.retain(ids);
    self.postMessage({
      generation: job.generation,
      entries: cache.snapshot(),
      timingMs: performance.now() - started,
      stats: cache.inspect()
    });
  } catch {
    self.postMessage({ generation: job.generation, error: true });
  }
};
