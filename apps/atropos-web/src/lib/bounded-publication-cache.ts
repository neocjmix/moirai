import { serialize } from "node:v8";

/** Rebuildable immutable values only. V8-encoded weight bounds retained data,
 * not process RSS; active reads, parsed object overhead and GC are measured
 * separately. Keys must contain every World/Revision/scope/version dependency. */
export class BoundedPublicationCache<T> {
  private readonly values = new Map<string, { value: T; bytes: number }>();
  private readonly pending = new Map<string, Promise<T>>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
    private readonly weight: (value: T) => number = (value) =>
      serialize(value).byteLength
  ) {
    if (
      !Number.isSafeInteger(maxEntries) ||
      maxEntries < 1 ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1
    )
      throw Error("invalid_cache_budget");
  }
  get(key: string): T | undefined {
    const entry = this.values.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    this.values.delete(key);
    this.values.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T): void {
    const bytes = this.weight(value) + Buffer.byteLength(key);
    const old = this.values.get(key);
    if (old) {
      this.bytes -= old.bytes;
      this.values.delete(key);
    }
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.maxBytes)
      return;
    while (
      this.values.size >= this.maxEntries ||
      this.bytes + bytes > this.maxBytes
    ) {
      const oldest = this.values.keys().next().value!;
      this.bytes -= this.values.get(oldest)!.bytes;
      this.values.delete(oldest);
      this.evictions++;
    }
    this.values.set(key, { value, bytes });
    this.bytes += bytes;
  }
  async read(key: string, build: () => Promise<T>): Promise<T> {
    const existing = this.get(key);
    if (existing !== undefined) return existing;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const promise = build();
    // Bound retained in-flight metadata as well as completed entries. A full
    // pending map falls back to an ordinary read; it never serves stale data.
    if (this.pending.size < this.maxEntries) this.pending.set(key, promise);
    try {
      const value = await promise;
      this.set(key, value);
      return value;
    } finally {
      if (this.pending.get(key) === promise) this.pending.delete(key);
    }
  }
  metrics() {
    return {
      entries: this.values.size,
      pending: this.pending.size,
      accounted_bytes: this.bytes,
      max_bytes: this.maxBytes,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions
    };
  }
}
