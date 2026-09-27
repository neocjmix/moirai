import { expect, it } from "vitest";
import { buildV5StagedIndex, publishV5StagedArtifacts } from "./v5-staging.js";
const artifacts = () =>
  buildV5StagedIndex(
    "world-1",
    31,
    Array.from({ length: 24 }, (_, i) => ({
      key: `worlds/world-1/revisions/31/v5/content/${i}.json`,
      body: JSON.stringify({ i })
    }))
  );
it("bounds in-flight uploads and writes the root only after every artifact settles", async () => {
  const built = artifacts();
  let inFlight = 0,
    peak = 0;
  const written = new Map<string, string>();
  await publishV5StagedArtifacts(
    {
      get: async (key) => ({
        status: written.has(key) ? 200 : 404,
        body: written.get(key) ?? null,
        etag: null
      }),
      put: async (key, body) => {
        if (key === built.root.key) {
          expect(inFlight).toBe(0);
          expect(written.size).toBe(
            built.documents.length + built.index.length
          );
        }
        inFlight++;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        written.set(key, body);
        inFlight--;
        return { status: 200, etag: null };
      }
    },
    built
  );
  expect(peak).toBe(8);
  expect(inFlight).toBe(0);
});
it("drains a failed batch without publishing its root or starting later batches", async () => {
  const built = artifacts();
  let inFlight = 0,
    started = 0;
  const written: string[] = [];
  await expect(
    publishV5StagedArtifacts(
      {
        get: async () => ({ status: 404, body: null, etag: null }),
        put: async (key) => {
          const attempt = ++started;
          inFlight++;
          await Promise.resolve();
          inFlight--;
          if (attempt === 2) return { status: 503, etag: null };
          written.push(key);
          return { status: 200, etag: null };
        }
      },
      built
    )
  ).rejects.toThrow("v5_immutable_write_failed");
  expect(inFlight).toBe(0);
  expect(started).toBe(8);
  expect(written).not.toContain(built.root.key);
});
