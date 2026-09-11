import { describe, expect, it } from "vitest";

import { POST } from "./route.js";

describe("public graph composition boundary", () => {
  it("rejects an oversized body before parsing or Publication access", async () => {
    const response = await POST(
      new Request("http://localhost/graph/query", {
        method: "POST",
        headers: { "content-length": String(65 * 1024) },
        body: "{}"
      })
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "query_too_large"
    });
  });

  it("fails closed without returning parser or storage diagnostics", async () => {
    const response = await POST(
      new Request("http://localhost/graph/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contract_version: 99 })
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "unsupported_contract"
    });
  });
});
