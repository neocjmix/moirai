import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedSmokeRequest } from "./clotho-smoke-request.js";

const endpoint = "https://clotho.example.test";
const token = "synthetic-smoke-credential-never-real";
const policyPath = "/v2/clotho/authoring.policy.get";

describe("authenticated Clotho smoke diagnostics", () => {
  it("identifies bearer rejection without reading or exposing the response", async () => {
    // Authentication denial may be HTML from an upstream service.
    const response = new Response(token, { status: 401 });
    const request = vi.fn<typeof fetch>(async () => response);
    const call = createAuthenticatedSmokeRequest(endpoint, token, request);
    await expect(call(policyPath, {})).rejects.toEqual(
      new Error(
        "CI CLOTHO_TOKEN bearer credential was rejected (HTTP 401). Check its 30-day expiry and Railway CLOTHO_CREDENTIALS_JSON token hash; rotate both secret stores together. This credential is separate from ChatGPT OAuth."
      )
    );
    expect(response.bodyUsed).toBe(false);
  });

  it("distinguishes insufficient World access from failed authentication", async () => {
    const request = vi.fn<typeof fetch>(
      async () => new Response(token, { status: 403 })
    );
    await expect(
      createAuthenticatedSmokeRequest(endpoint, token, request)(policyPath, {})
    ).rejects.toEqual(
      new Error(
        "CI CLOTHO_TOKEN access was denied (HTTP 403). Check the credential's World grants and world:read/world:write scopes."
      )
    );
  });

  it("identifies workload rejection without referring to the legacy secret", async () => {
    const response = new Response(token, { status: 401 });
    const request = vi.fn<typeof fetch>(async () => response);
    await expect(
      createAuthenticatedSmokeRequest(
        endpoint,
        token,
        request,
        "github-actions-oidc"
      )(policyPath, {})
    ).rejects.toThrow(
      /^GitHub Actions OIDC smoke credential was rejected \(HTTP 401\). Check the pinned workflow identity, audience and expiry\.$/
    );
    expect(response.bodyUsed).toBe(false);
  });

  it("preserves the policy mismatch response for the existing rejection gate", async () => {
    const body = { error: { code: "authoring_policy_mismatch" } };
    const request = vi.fn<typeof fetch>(async () =>
      Response.json(body, { status: 422 })
    );
    const input = { contract_version: 5 };
    await expect(
      createAuthenticatedSmokeRequest(
        endpoint,
        token,
        request
      )("/v2/clotho/change.commit", input)
    ).resolves.toEqual({ status: 422, body });
    const [url, init] = request.mock.calls[0]!;
    expect(String(url)).toBe(`${endpoint}/v2/clotho/change.commit`);
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${token}`
    );
    expect(init?.body).toBe(JSON.stringify(input));
  });

  it("redacts transport errors that could include credentials", async () => {
    const request = vi.fn<typeof fetch>(async () => {
      throw new Error(`Authorization: Bearer ${token}`);
    });
    await expect(
      createAuthenticatedSmokeRequest(endpoint, token, request)("/mcp", {})
    ).rejects.toThrow(/^Authenticated Clotho smoke transport failed$/);
  });

  it("redacts non-JSON responses while retaining the HTTP status", async () => {
    const request = vi.fn<typeof fetch>(
      async () => new Response(token, { status: 502 })
    );
    await expect(
      createAuthenticatedSmokeRequest(endpoint, token, request)("/mcp", {})
    ).rejects.toThrow(
      /^Authenticated Clotho smoke returned invalid JSON \(HTTP 502\)$/
    );
  });
});
