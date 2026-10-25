import type { CompositePaddingProfile } from "@moirai/graph-presentation/composite-padding-profile";
import type { CompositeSplineTuning } from "./graph-shell-region-geometry";
import type { CompositeGeometryEntry } from "./composite-pan-geometry";
import type {
  GeographicView,
  GeographicSize
} from "../../../components/geographic-renderer/contract";
export type CompositeGeometryJob = {
  generation: number;
  view: GeographicView;
  viewport: GeographicSize;
  tuning: CompositeSplineTuning;
  labelHeight: number;
  labelGap: number;
  regions: {
    id: string;
    coordinates: Float64Array;
    padding: number;
    paddingProfile?: CompositePaddingProfile;
  }[];
};
export type CompositeGeometryResult = {
  generation: number;
  entries: [string, CompositeGeometryEntry][];
  timingMs: number;
  stats: unknown;
};
/** At most one in-flight job and one replacement. Obsolete queued work never
 * crosses the worker boundary; stale in-flight results resolve to null. */
export function createCompositeGeometryWorker() {
  const worker = new Worker(
    new URL("./composite-geometry-worker.ts", import.meta.url),
    { type: "module" }
  );
  type Pending = {
    job: CompositeGeometryJob;
    resolve: (value: CompositeGeometryResult | null) => void;
  };
  let running: Pending | null = null,
    next: Pending | null = null,
    disposed = false;
  const start = (pending: Pending) => {
    running = pending;
    worker.postMessage(
      pending.job,
      pending.job.regions.map((region) => region.coordinates.buffer)
    );
  };
  worker.onmessage = (
    event: MessageEvent<CompositeGeometryResult & { error?: boolean }>
  ) => {
    if (event.data.error) {
      running?.resolve(null);
      next?.resolve(null);
      running = next = null;
      disposed = true;
      worker.terminate();
      return;
    }
    const active = running;
    running = null;
    active?.resolve(event.data.error || next ? null : event.data);
    if (next) {
      const pending = next;
      next = null;
      start(pending);
    }
  };
  worker.onerror = () => {
    running?.resolve(null);
    next?.resolve(null);
    running = next = null;
    worker.terminate();
    disposed = true;
  };
  return {
    prepare(job: CompositeGeometryJob) {
      return new Promise<CompositeGeometryResult | null>((resolve) => {
        if (disposed) {
          resolve(null);
          return;
        }
        const pending = { job, resolve };
        if (running) {
          next?.resolve(null);
          next = pending;
        } else start(pending);
      });
    },
    inspect: () => ({
      running: Number(running !== null),
      pending: Number(next !== null),
      failed: disposed
    }),
    dispose() {
      disposed = true;
      worker.terminate();
      running?.resolve(null);
      next?.resolve(null);
      running = next = null;
    }
  };
}
