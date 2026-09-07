interface HealthPayload {
  readonly status: string;
  readonly service: string;
  readonly commit_sha: string;
}

export {};

interface StatusPayload {
  readonly application: { readonly commit_sha: string };
  readonly surfaces: {
    readonly atropos: string;
    readonly health: string;
    readonly status: string;
  };
}

const baseUrl = process.env.PUBLIC_INTEGRATION_URL;
const expectedSha = process.env.EXPECTED_COMMIT_SHA;
if (!baseUrl || !expectedSha) {
  throw new Error(
    "PUBLIC_INTEGRATION_URL and EXPECTED_COMMIT_SHA are required"
  );
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

async function verify(): Promise<void> {
  const [health, ready, status, landing] = await Promise.all([
    fetchJson<HealthPayload>("/health/live"),
    fetchJson<HealthPayload>("/health/ready"),
    fetchJson<StatusPayload>("/status-public"),
    fetch(new URL("/", baseUrl), { signal: AbortSignal.timeout(10_000) })
  ]);
  if (
    health.status !== "ok" ||
    ready.status !== "ok" ||
    health.service !== "atropos-web" ||
    ready.service !== "atropos-web" ||
    health.commit_sha !== expectedSha ||
    ready.commit_sha !== expectedSha ||
    status.application.commit_sha !== expectedSha ||
    Object.values(status.surfaces).some((value) => value !== "ok") ||
    !landing.ok
  ) {
    throw new Error("Atropos deployment does not match the expected build");
  }
}

const deadline = Date.now() + 10 * 60_000;
let lastError: unknown;
while (Date.now() < deadline) {
  try {
    await verify();
    process.stdout.write(
      `production public readiness smoke passed; sha=${expectedSha}\n`
    );
    process.exit(0);
  } catch (error) {
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}
throw lastError instanceof Error
  ? lastError
  : new Error("post-deploy smoke timed out");
