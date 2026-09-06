import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { describe, expect, it, vi, afterEach } from "vitest";
import { callClotho } from "./client.js";

const token = randomBytes(32).toString("base64url");
afterEach(() => vi.unstubAllGlobals());
describe("Clotho JSON client", () => {
  it("requires HTTPS outside loopback and rejects URL credentials", async () => {
    for (const baseUrl of [
      "http://example.com",
      "https://user:password@example.com",
      "https://example.com?token=hidden"
    ])
      await expect(
        callClotho({ baseUrl, token }, "world.list", {})
      ).rejects.toMatchObject({ code: "invalid_endpoint" });
  });
  it("does not follow redirects with a bearer credential", async () => {
    const destination = vi.fn((_request, response) => response.end("{}"));
    const server = createServer(destination);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    const address = server.address() as { port: number };
    const redirect = createServer((_request, response) => {
      response.writeHead(302, { location: `http://127.0.0.1:${address.port}` });
      response.end();
    });
    await new Promise<void>((resolve) =>
      redirect.listen(0, "127.0.0.1", resolve)
    );
    try {
      await expect(
        callClotho(
          {
            baseUrl: `http://127.0.0.1:${(redirect.address() as { port: number }).port}`,
            token
          },
          "world.list",
          {}
        )
      ).rejects.toMatchObject({ code: "transport_or_response_error" });
      expect(destination).not.toHaveBeenCalled();
    } finally {
      server.close();
      redirect.close();
    }
  });
  it("does not echo credentials or server diagnostics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ result: token })))
    );
    await expect(
      callClotho({ baseUrl: "https://example.com", token }, "world.list", {})
    ).rejects.toMatchObject({ code: "unsafe_response" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "failure",
                message: "secret",
                recovery: { sql: "secret" }
              }
            }),
            { status: 500 }
          )
      )
    );
    await expect(
      callClotho({ baseUrl: "https://example.com", token }, "world.list", {})
    ).rejects.toMatchObject({ code: "failure", recovery: undefined });
  });
});
