import { AsyncLocalStorage } from "node:async_hooks";

type Reads = {
  objects: number;
  bytes: number;
  io_ms: number;
  parent: Reads | undefined;
};
const active = new AsyncLocalStorage<Reads>();

/** Request-local measurement only: no identities, text, credentials or cache. */
export async function observePublicationRead<T extends { body: string | null }>(
  read: () => Promise<T>
): Promise<T> {
  const metrics = active.getStore();
  if (!metrics) return read();
  const start = performance.now();
  for (
    let current: Reads | undefined = metrics;
    current;
    current = current.parent
  )
    current.objects++;
  try {
    const result = await read();
    const bytes = result.body === null ? 0 : Buffer.byteLength(result.body);
    for (
      let current: Reads | undefined = metrics;
      current;
      current = current.parent
    )
      current.bytes += bytes;
    return result;
  } finally {
    const elapsed = performance.now() - start;
    for (
      let current: Reads | undefined = metrics;
      current;
      current = current.parent
    )
      current.io_ms += elapsed;
  }
}

export async function profilePublication<T>(read: () => Promise<T>) {
  const metrics: Reads = {
    objects: 0,
    bytes: 0,
    io_ms: 0,
    parent: active.getStore()
  };
  const start = performance.now();
  const value = await active.run(metrics, read);
  return {
    value,
    metrics: {
      objects: metrics.objects,
      bytes: metrics.bytes,
      io_ms: metrics.io_ms,
      app_ms: performance.now() - start
    }
  };
}

export function profilePublicationRoute(
  handler: (request: Request) => Promise<Response>
) {
  return async (request: Request) => {
    const { value, metrics } = await profilePublication(() => handler(request));
    // pubio is summed object time (parallel reads overlap), not wall time.
    value.headers.set(
      "server-timing",
      `app;dur=${metrics.app_ms.toFixed(2)}, pubio;dur=${metrics.io_ms.toFixed(2)}, objects;desc="${metrics.objects}", bytes;desc="${metrics.bytes}"`
    );
    return value;
  };
}
