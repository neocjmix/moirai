import type {
  GraphShellViewportQuery as Query,
  GraphShellViewportResponse as Response
} from "../shared/contracts";

type Entry = { query: Query; key: string; value: Response; bytes: number };
const MAX_BYTES = 8 * 1024 * 1024;
const keyFor = (q: Query) =>
  JSON.stringify({
    ...q,
    bbox: undefined,
    canonIds: q.canonIds,
    artifactClasses: [...(q.artifactClasses ?? [])].sort()
  });
function covers(outer: Query["bbox"], inner: Query["bbox"]) {
  return (
    outer.minX <= inner.minX &&
    outer.maxX >= inner.maxX &&
    outer.minY <= inner.minY &&
    outer.maxY >= inner.maxY
  );
}
/** Queries already contain the URDR 1.5-screen padding; reuse until the visible view approaches its edge. */
function requiredCoverage(q: Query): Query["bbox"] {
  const b = q.bbox,
    x = (b.minX + b.maxX) / 2,
    y = (b.minY + b.maxY) / 2;
  return {
    minX: x - (b.maxX - b.minX) * 0.1875,
    maxX: x + (b.maxX - b.minX) * 0.1875,
    minY: y - (b.maxY - b.minY) * 0.1875,
    maxY: y + (b.maxY - b.minY) * 0.1875
  };
}
export function createViewportCache(
  read: (query: Query, signal: AbortSignal) => Promise<Response>
) {
  const entries: Entry[] = [];
  const pending = new Map<
    string,
    { controller: AbortController; promise: Promise<Response> }
  >();
  let bytes = 0;
  return async (query: Query): Promise<Response> => {
    const key = keyFor(query);
    const exact = key + JSON.stringify(query.bbox);
    const found = entries.findIndex(
      (e) =>
        e.key === key &&
        (JSON.stringify(e.query.bbox) === JSON.stringify(query.bbox) ||
          (!e.value.truncated &&
            !e.value.cache.stale &&
            covers(e.query.bbox, requiredCoverage(query))))
    );
    if (found >= 0) {
      const [entry] = entries.splice(found, 1);
      entries.push(entry!);
      return entry!.value;
    }
    const existing = pending.get(exact);
    if (existing) return existing.promise;
    // At most two active reads per query context. Superseded fetches cannot refill the cache.
    if (pending.size >= 2) {
      const [oldKey, old] = pending.entries().next().value!;
      pending.delete(oldKey);
      old.controller.abort();
    }
    const controller = new AbortController();
    const promise = read(query, controller.signal)
      .then((value) => {
        if (controller.signal.aborted)
          throw new DOMException("Superseded viewport", "AbortError");
        const size = new TextEncoder().encode(JSON.stringify(value)).byteLength;
        if (!value.truncated && !value.cache.stale && size <= MAX_BYTES) {
          entries.push({ key, query, value, bytes: size });
          bytes += size;
          while (entries.length > 8 || bytes > MAX_BYTES)
            bytes -= entries.shift()!.bytes;
        }
        return value;
      })
      .finally(() => {
        if (pending.get(exact)?.controller === controller)
          pending.delete(exact);
      });
    pending.set(exact, { controller, promise });
    return promise;
  };
}

/** Only a complete response can evict the old viewport. Partial reads retain identity and edges. */
export function reconcileViewport(
  previous: Response | null,
  incoming: Response
): Response {
  if (!previous || (!incoming.truncated && !incoming.cache.stale))
    return incoming;
  let remaining = 2500;
  const merge = (a: Response["entities"], b: Response["entities"]) => {
    const values = [
      ...new Map(
        [...b, ...a.filter((e) => !b.some((n) => n.id === e.id))].map((e) => [
          e.id,
          e
        ])
      ).values()
    ].slice(0, remaining);
    remaining -= values.length;
    return values;
  };
  return {
    ...incoming,
    entities: merge(previous.entities, incoming.entities),
    regions: merge(previous.regions, incoming.regions),
    edges: merge(previous.edges, incoming.edges)
  };
}
