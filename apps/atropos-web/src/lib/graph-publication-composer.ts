export * from "@moirai/graph-query";
import { composeGraphPublicationQuery } from "@moirai/graph-query";
import { BoundedPublicationCache } from "./bounded-publication-cache";

const readerCache = new BoundedPublicationCache<
  ReturnType<typeof composeGraphPublicationQuery>
>(16, 32 * 1024 * 1024);
const snapshotIdentities = new WeakMap<object, number>();
let nextSnapshotIdentity = 0;
export const graphReaderCompositionCacheMetrics = () => readerCache.metrics();

/** Server reader reuse for already validated immutable snapshots. A reloaded
 * snapshot deliberately misses, even at the same Revision. Failed sources are
 * never cached; retry observes their actual availability. */
export function composeCachedGraphPublicationQuery(
  ...args: Parameters<typeof composeGraphPublicationQuery>
) {
  const [query, snapshots, failures = []] = args;
  if (failures.length) return composeGraphPublicationQuery(...args);
  const inputs = snapshots.map((snapshot) => {
    let identity = snapshotIdentities.get(snapshot);
    if (identity === undefined) {
      identity = ++nextSnapshotIdentity;
      snapshotIdentities.set(snapshot, identity);
    }
    return [
      snapshot.worldId,
      snapshot.servedRevision,
      snapshot.canon.id,
      identity
    ];
  });
  const key = JSON.stringify(["reader-composition/1", query, inputs]);
  const existing = readerCache.get(key);
  if (existing) return existing;
  const result = composeGraphPublicationQuery(...args);
  readerCache.set(key, result);
  return result;
}
