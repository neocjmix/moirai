export type ClothoSmokeAuthMode = "bearer" | "github-actions-oidc";

function isCompactJwt(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 8192 - "Bearer ".length ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  )
    return false;
  try {
    const segments = value.split(".");
    if (
      segments.some(
        (segment) =>
          Buffer.from(segment, "base64url").toString("base64url") !== segment
      )
    )
      return false;
    const [header, payload] = segments;
    const decodedHeader = JSON.parse(
      Buffer.from(header!, "base64url").toString("utf8")
    ) as { alg?: unknown };
    const decodedPayload: unknown = JSON.parse(
      Buffer.from(payload!, "base64url").toString("utf8")
    );
    return (
      decodedHeader?.alg === "RS256" &&
      decodedPayload !== null &&
      typeof decodedPayload === "object" &&
      !Array.isArray(decodedPayload)
    );
  } catch {
    return false;
  }
}

export async function getGitHubActionsOidcToken(
  apiUrl: string,
  environment: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch
): Promise<string> {
  let url: URL;
  const requestToken = environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  try {
    const resource = new URL("/mcp", apiUrl);
    url = new URL(environment.ACTIONS_ID_TOKEN_REQUEST_URL ?? "");
    if (
      resource.protocol !== "https:" ||
      resource.username ||
      resource.password ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      !url.hostname.endsWith(".actions.githubusercontent.com") ||
      !requestToken ||
      /[\r\n]/.test(requestToken)
    )
      throw Error();
    url.searchParams.set("audience", resource.href);
  } catch {
    throw Error("GitHub Actions OIDC smoke configuration is invalid");
  }

  let response: Response;
  try {
    response = await request(url, {
      redirect: "error",
      headers: { authorization: `Bearer ${requestToken}` },
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw Error("GitHub Actions OIDC token request failed");
  }
  if (!response.ok)
    throw Error(
      `GitHub Actions OIDC token request failed (HTTP ${response.status})`
    );
  try {
    const body: unknown = await response.json();
    const token =
      body !== null && typeof body === "object" && "value" in body
        ? body.value
        : null;
    // Signature, expiry and exact workflow claims are checked by Clotho.
    if (!isCompactJwt(token)) throw Error();
    return token;
  } catch {
    throw Error("GitHub Actions OIDC token response is invalid");
  }
}

export async function resolveClothoSmokeToken(
  mode: ClothoSmokeAuthMode,
  apiUrl: string,
  waitForReady: () => Promise<void>,
  environment: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch
): Promise<string> {
  // Readiness may wait ten minutes; GitHub's JWT lasts only five minutes.
  await waitForReady();
  if (mode === "github-actions-oidc")
    return getGitHubActionsOidcToken(apiUrl, environment, request);
  if (!environment.CLOTHO_TOKEN)
    throw Error("Clotho smoke credential is missing");
  return environment.CLOTHO_TOKEN;
}
