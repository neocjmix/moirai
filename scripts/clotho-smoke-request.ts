import type { ClothoSmokeAuthMode } from "./clotho-smoke-auth.js";

export function createAuthenticatedSmokeRequest(
  apiUrl: string,
  token: string,
  request: typeof fetch = fetch,
  authMode: ClothoSmokeAuthMode = "bearer"
) {
  return async function authenticated<T>(
    path: string,
    body: unknown,
    accept = "application/json"
  ): Promise<{ status: number; body: T }> {
    let response: Response;
    try {
      response = await request(new URL(path, apiUrl), {
        method: "POST",
        redirect: "error",
        headers: {
          "content-type": "application/json",
          accept,
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000)
      });
    } catch {
      // Provider errors can contain request headers or response bodies.
      throw new Error("Authenticated Clotho smoke transport failed");
    }
    if (response.status === 401)
      throw new Error(
        authMode === "github-actions-oidc"
          ? "GitHub Actions OIDC smoke credential was rejected (HTTP 401). Check the pinned workflow identity, audience and expiry."
          : "CI CLOTHO_TOKEN bearer credential was rejected (HTTP 401). Check its 30-day expiry and Railway CLOTHO_CREDENTIALS_JSON token hash; rotate both secret stores together. This credential is separate from ChatGPT OAuth."
      );
    if (response.status === 403)
      throw new Error(
        authMode === "github-actions-oidc"
          ? "GitHub Actions OIDC smoke access was denied (HTTP 403). Check the synthetic World grant and world:read/world:write scopes."
          : "CI CLOTHO_TOKEN access was denied (HTTP 403). Check the credential's World grants and world:read/world:write scopes."
      );
    try {
      return { status: response.status, body: (await response.json()) as T };
    } catch {
      throw new Error(
        `Authenticated Clotho smoke returned invalid JSON (HTTP ${response.status})`
      );
    }
  };
}
