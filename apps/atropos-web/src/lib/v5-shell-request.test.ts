import { describe, expect, it, vi } from "vitest";
import {
  readV5ShellRequest,
  V5_SHELL_QUERY_MAX_BYTES,
  V5_SHELL_RESPONSE_MAX_BYTES,
  v5ShellResponse
} from "./v5-shell-request";

const cursor = (count = 100) => ({
  selection_digest: "a".repeat(64),
  spatial: {
    query_digest: "b".repeat(64),
    pending: Array.from({ length: count }, () => ({
      key: "a".repeat(256),
      level: 8,
      offset: 127,
      bounds: {
        minX: -Number.MAX_VALUE,
        maxX: Number.MAX_VALUE,
        minY: -Number.MIN_VALUE,
        maxY: Number.MIN_VALUE
      }
    }))
  }
});
const request = (query: unknown) =>
  new Request("http://localhost/graph/v5/shell", {
    method: "POST",
    body: JSON.stringify(query)
  });
const continuation = { allowViewportContinuation: true };

describe("bounded shell request envelope", () => {
  it("round-trips a server-sized viewport cursor with the schema's maximum frontier", async () => {
    const query = { kind: "viewport", cursor: cursor(2048) };
    expect(Buffer.byteLength(JSON.stringify(query))).toBeGreaterThan(
      V5_SHELL_QUERY_MAX_BYTES
    );
    expect(() => v5ShellResponse({ next_cursor: query.cursor })).not.toThrow();
    expect(await readV5ShellRequest(request(query), continuation)).toEqual(
      query
    );
  });

  it("keeps the default, search, detail and Collection query budgets at 16KiB", async () => {
    const query = { kind: "viewport", cursor: cursor() };
    await expect(readV5ShellRequest(request(query))).rejects.toThrow(
      "query_too_large"
    );
    for (const kind of ["search", "detail", "collection"])
      await expect(
        readV5ShellRequest(request({ ...query, kind }), continuation)
      ).rejects.toThrow("query_too_large");
  });

  it("does not let a valid cursor expand the noncursor query budget", async () => {
    await expect(
      readV5ShellRequest(
        request({
          kind: "viewport",
          cursor: cursor(),
          collection_ids: ["a".repeat(V5_SHELL_QUERY_MAX_BYTES)]
        }),
        continuation
      )
    ).rejects.toThrow("query_too_large");
  });

  it("requires a valid bounded cursor before allowing the extra envelope", async () => {
    for (const invalid of [
      { ...cursor(), selection_digest: "invalid" },
      cursor(2049),
      { ...cursor(), extra: "unsupported" }
    ])
      await expect(
        readV5ShellRequest(
          request({ kind: "viewport", cursor: invalid }),
          continuation
        )
      ).rejects.toThrow("query_too_large");
  });

  it("cancels oversized transport bodies before JSON materialization", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new Uint8Array(
            V5_SHELL_QUERY_MAX_BYTES + V5_SHELL_RESPONSE_MAX_BYTES + 1
          )
        );
      },
      cancel
    });
    const incoming = new Request("http://localhost/graph/v5/shell", {
      method: "POST",
      body,
      duplex: "half"
    } as RequestInit);
    await expect(readV5ShellRequest(incoming, continuation)).rejects.toThrow(
      "query_too_large"
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
});
