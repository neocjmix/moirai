import { AsyncLocalStorage } from "node:async_hooks";

interface ReadMetrics {
  queries: number;
  query_ms: number;
  history_rows: number;
  fold_ms: number;
}
const active = new AsyncLocalStorage<ReadMetrics>();

/** Numeric request-local counters only; never retain SQL, values or identities. */
export function observeQuery(milliseconds: number): void {
  const metrics = active.getStore();
  if (metrics) {
    metrics.queries++;
    metrics.query_ms += milliseconds;
  }
}

export function observeHistoryFold(rows: number, milliseconds: number): void {
  const metrics = active.getStore();
  if (metrics) {
    metrics.history_rows += rows;
    metrics.fold_ms += milliseconds;
  }
}

/** Query time is summed driver time, not wall time; parallel queries overlap. */
export async function profileCanonicalRead<T>(read: () => Promise<T>) {
  const metrics: ReadMetrics = {
    queries: 0,
    query_ms: 0,
    history_rows: 0,
    fold_ms: 0
  };
  const start = performance.now();
  const value = await active.run(metrics, read);
  return { value, metrics: { ...metrics, app_ms: performance.now() - start } };
}
