import { AUTHORING_POLICY, CONTRACT_VERSION } from "@moirai/contracts";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { describe, expect, it, vi, afterEach } from "vitest";
import { callClotho, callV5Clotho } from "./client.js";

const token = randomBytes(32).toString("base64url");
afterEach(() => vi.unstubAllGlobals());
describe("Clotho JSON client", () => {
  it("passes the v5 World search envelope through the same bounded client", async () => {
    const input = {
      contract_version: 5,
      world_id: "01995c2a-7b00-7000-8000-000000000101",
      text: "Dan jong",
      limit: 5
    };
    const result = {
      source_revision: 31,
      events: [
        {
          id: "01995c2a-7b00-7000-8000-000000000102",
          title: "Dan jong",
          summary: null
        }
      ],
      next_cursor: null
    };
    const server = createServer(async (request, response) => {
      expect(request.url).toBe("/v2/clotho/event.search");
      expect(request.headers.authorization).toBe(`Bearer ${token}`);
      let body = "";
      for await (const chunk of request) body += String(chunk);
      expect(JSON.parse(body)).toEqual(input);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ contract_version: 5, result }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    try {
      expect(
        await callV5Clotho(
          {
            baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
            token
          },
          "event.search",
          input
        )
      ).toEqual({ contract_version: 5, result });
    } finally {
      server.close();
    }
  });
  it("uses the isolated v5 endpoint and rejects a wrong-version response", async () => {
    let version = 5;
    const server = createServer(async (request, response) => {
      expect(request.url).toBe("/v2/clotho/authoring.policy.get");
      expect(request.headers.authorization).toBe(`Bearer ${token}`);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          contract_version: version,
          result: { policy_version: "v5" }
        })
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    try {
      const config = {
        baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        token
      };
      expect(
        await callV5Clotho(config, "authoring.policy.get", {
          contract_version: 5
        })
      ).toMatchObject({ contract_version: 5 });
      version = 4;
      await expect(
        callV5Clotho(config, "authoring.policy.get", { contract_version: 5 })
      ).rejects.toMatchObject({ code: "invalid_response" });
    } finally {
      server.close();
    }
  });
  it("preserves the complete policy envelope through the CLI HTTP client", async () => {
    const envelope = {
      contract_version: CONTRACT_VERSION,
      result: AUTHORING_POLICY
    };
    let received = "";
    const server = createServer(async (request, response) => {
      expect(request.url).toBe("/v1/clotho/authoring.policy.get");
      expect(request.headers.authorization).toBe(`Bearer ${token}`);
      for await (const chunk of request) received += String(chunk);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(envelope));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    const input = {
      world_id: "01995c2a-7b00-7000-8000-000000000101",
      contract_version: 4
    };
    try {
      const address = server.address() as { port: number };
      expect(
        await callClotho(
          { baseUrl: `http://127.0.0.1:${address.port}`, token },
          "authoring.policy.get",
          input
        )
      ).toEqual(envelope);
      expect(JSON.parse(received)).toEqual(input);
    } finally {
      server.close();
    }
  });

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
