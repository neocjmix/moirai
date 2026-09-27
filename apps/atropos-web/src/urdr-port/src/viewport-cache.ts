import type {
  GraphShellViewportQuery as Query,
  GraphShellViewportResponse as Response
} from "../shared/contracts";

type Entry = {
  query: Query;
  key: string;
  value: Response;
  bytes: number;
  createdAt: number;
};
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
  read: (query: Query, signal: AbortSignal) => Promise<Response>,
  options: {
    cachePartial?: boolean;
    maxAgeMs?: number;
    maxPending?: number;
  } = {}
) {
  const entries: Entry[] = [];
  const pending = new Map<
    string,
    { controller: AbortController; promise: Promise<Response> }
  >();
  let bytes = 0;
  let requests = 0,
    hits = 0,
    coalesced = 0,
    aborted = 0;
  const load = async (query: Query): Promise<Response> => {
    // Expiry is measured from the read, not extended by cache hits. A bounded
    // lifetime lets revision-pinned v5 reads recheck the current publication.
    const now = Date.now();
    for (let i = entries.length - 1; i >= 0; i--) {
      if (now - entries[i]!.createdAt >= (options.maxAgeMs ?? Infinity)) {
        bytes -= entries[i]!.bytes;
        entries.splice(i, 1);
      }
    }
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
      hits++;
      const [entry] = entries.splice(found, 1);
      entries.push(entry!);
      return entry!.value;
    }
    const existing = pending.get(exact);
    if (existing) {
      coalesced++;
      return existing.promise;
    }
    // Bound active reads per context. Superseded fetches cannot refill the cache.
    if (pending.size >= (options.maxPending ?? 2)) {
      const [oldKey, old] = pending.entries().next().value!;
      pending.delete(oldKey);
      old.controller.abort();
      aborted++;
    }
    requests++;
    const controller = new AbortController();
    const promise = read(query, controller.signal)
      .then((value) => {
        if (controller.signal.aborted)
          throw new DOMException("Superseded viewport", "AbortError");
        const size = new TextEncoder().encode(JSON.stringify(value)).byteLength;
        if (
          (!value.truncated || options.cachePartial) &&
          !value.cache.stale &&
          size <= MAX_BYTES
        ) {
          entries.push({
            key,
            query,
            value,
            bytes: size,
            createdAt: Date.now()
          });
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
  return Object.assign(load, {
    inspect() {
      return {
        entries: entries.length,
        bytes,
        pending: pending.size,
        requests,
        hits,
        coalesced,
        aborted,
        maxEntries: 8,
        maxBytes: MAX_BYTES,
        maxPending: options.maxPending ?? 2
      };
    },
    dispose() {
      for (const { controller } of pending.values()) {
        controller.abort();
        aborted++;
      }
      pending.clear();
      entries.length = 0;
      bytes = 0;
    }
  });
}

/** Legacy incremental reads retain partial identity; snapshots replace the active view. */
export function reconcileViewport(
  previous: Response | null,
  incoming: Response,
  mode: "incremental" | "snapshot" = "incremental"
): Response {
  // v5 returns a bounded snapshot, never a delta. A partial snapshot remains
  // partial; unrelated historical entities must not fill its missing slots.
  if (mode === "snapshot") return incoming;
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
