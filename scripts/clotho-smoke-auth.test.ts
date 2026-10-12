import { describe, expect, it, vi } from "vitest";
import {
  getGitHubActionsOidcToken,
  resolveClothoSmokeToken
} from "./clotho-smoke-auth.js";

const apiUrl = "https://clotho.example.test/";
const requestToken = "synthetic-github-request-credential";
const environment = {
  ACTIONS_ID_TOKEN_REQUEST_URL:
    "https://run-actions.example.actions.githubusercontent.com/idtoken?api-version=2.0&audience=old",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: requestToken
};
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
  iss: "https://token.actions.githubusercontent.com",
  aud: "https://clotho.example.test/mcp",
  exp: 1_800_000_000
})}.${Buffer.from("synthetic-signature").toString("base64url")}`;

describe("Clotho smoke workload authentication", () => {
  it("mints only after a slow readiness check finishes", async () => {
    let ready!: () => void;
    const readiness = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ value: token })
    );
    const result = resolveClothoSmokeToken(
      "github-actions-oidc",
      apiUrl,
      () => readiness,
      environment,
      request
    );
    // A deployment may still be converging after the JWT's five-minute life.
    expect(request).not.toHaveBeenCalled();
    ready();
    await expect(result).resolves.toBe(token);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not mint when deployment readiness fails", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(
      resolveClothoSmokeToken(
        "github-actions-oidc",
        apiUrl,
        async () => {
          throw Error("Clotho deployment timed out");
        },
        environment,
        request
      )
    ).rejects.toThrow(/^Clotho deployment timed out$/);
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves legacy bearer mode without requesting a workload token", async () => {
    const request = vi.fn<typeof fetch>();
    const ready = vi.fn(async () => {});
    await expect(
      resolveClothoSmokeToken(
        "bearer",
        apiUrl,
        ready,
        { CLOTHO_TOKEN: "synthetic-existing-ci-credential" },
        request
      )
    ).resolves.toBe("synthetic-existing-ci-credential");
    expect(ready).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });

  it("uses the exact MCP resource audience and protects the runner request", async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ value: token })
    );
    await getGitHubActionsOidcToken(
      `${apiUrl}ignored/base/path`,
      environment,
      request
    );
    const [url, init] = request.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.searchParams.getAll("audience")).toEqual([
      "https://clotho.example.test/mcp"
    ]);
    expect(parsed.searchParams.get("api-version")).toBe("2.0");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${requestToken}`
    );
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    { ACTIONS_ID_TOKEN_REQUEST_TOKEN: undefined },
    {
      ACTIONS_ID_TOKEN_REQUEST_URL:
        "http://run-actions.actions.githubusercontent.com/token"
    },
    {
      ACTIONS_ID_TOKEN_REQUEST_URL:
        "https://actions.githubusercontent.com.attacker.test/token"
    },
    {
      ACTIONS_ID_TOKEN_REQUEST_URL:
        "https://run-actions.actions.githubusercontent.com/token#fragment"
    },
    {
      ACTIONS_ID_TOKEN_REQUEST_URL:
        "https://user:password@run-actions.actions.githubusercontent.com/token"
    },
    { ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic\r\ninjected-header" }
  ])(
    "rejects unsafe runner configuration before sending credentials",
    async (change) => {
      const request = vi.fn<typeof fetch>();
      await expect(
        getGitHubActionsOidcToken(
          apiUrl,
          { ...environment, ...change },
          request
        )
      ).rejects.toThrow(/^GitHub Actions OIDC smoke configuration is invalid$/);
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("reports a denied request without reading its response body", async () => {
    const response = new Response(requestToken, { status: 403 });
    const request = vi.fn<typeof fetch>(async () => response);
    await expect(
      getGitHubActionsOidcToken(apiUrl, environment, request)
    ).rejects.toThrow(
      /^GitHub Actions OIDC token request failed \(HTTP 403\)$/
    );
    expect(response.bodyUsed).toBe(false);
  });

  it("redacts transport errors that include runner credentials", async () => {
    const request = vi.fn<typeof fetch>(async () => {
      throw Error(`Authorization: Bearer ${requestToken}; ${token}`);
    });
    await expect(
      getGitHubActionsOidcToken(apiUrl, environment, request)
    ).rejects.toThrow(/^GitHub Actions OIDC token request failed$/);
  });

  it.each([
    { value: "a.b.c" },
    { value: `${token}=` },
    { value: `${encode({ alg: "none" })}.${encode({})}.c2ln` },
    { value: `${encode({ alg: "RS256" })}.${encode([])}.c2ln` },
    { value: "x".repeat(8186) },
    { value: 42 },
    { token },
    null
  ])("rejects malformed token responses without echoing them", async (body) => {
    const request = vi.fn<typeof fetch>(async () => Response.json(body));
    await expect(
      getGitHubActionsOidcToken(apiUrl, environment, request)
    ).rejects.toThrow(/^GitHub Actions OIDC token response is invalid$/);
  });

  it("redacts malformed JSON responses", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(requestToken));
    await expect(
      getGitHubActionsOidcToken(apiUrl, environment, request)
    ).rejects.toThrow(/^GitHub Actions OIDC token response is invalid$/);
  });
});
