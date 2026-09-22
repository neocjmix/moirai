import { describe, expect, it } from "vitest";
import {
  observeHistoryFold,
  observeQuery,
  profileCanonicalRead
} from "./read-profile.js";

describe("canonical read measurements", () => {
  it("isolates overlapping requests and collects numeric counters only", async () => {
    const [first, second] = await Promise.all(
      [1, 2].map((n) =>
        profileCanonicalRead(async () => {
          observeQuery(n);
          await new Promise<void>((resolve) => setImmediate(resolve));
          observeHistoryFold(n * 10, n * 2);
          return n;
        })
      )
    );
    for (const result of [first!, second!]) {
      expect(result.metrics).toEqual({
        queries: 1,
        query_ms: result.value,
        history_rows: result.value * 10,
        fold_ms: result.value * 2,
        app_ms: expect.any(Number)
      });
    }
    observeQuery(999);
    expect((await profileCanonicalRead(async () => null)).metrics.queries).toBe(
      0
    );
  });
});
