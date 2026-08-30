interface HealthPayload {
  readonly status: string;
  readonly commit_sha: string;
}

export {};

interface StatusPayload {
  readonly application: { readonly commit_sha: string };
  readonly synthetic_world: {
    readonly world_id: string;
    readonly current_revision: number;
    readonly served_revision: number;
    readonly projection_status: string;
  };
}

interface PublicationPointer {
  readonly world_id: string;
  readonly served_revision: number;
  readonly manifest_key: string;
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
  const page = await fetch(new URL("/", baseUrl), {
    signal: AbortSignal.timeout(10_000)
  });
  if (!page.ok || !(await page.text()).includes("Atropos")) {
    throw new Error("Atropos placeholder is unavailable");
  }

  const health = await fetchJson<HealthPayload>("/health");
  const status = await fetchJson<StatusPayload>("/__status");
  if (health.status !== "ok") throw new Error("health is not ok");
  if (
    health.commit_sha !== expectedSha ||
    status.application.commit_sha !== expectedSha
  ) {
    throw new Error("deployed commit does not match the expected commit");
  }
  if (
    status.synthetic_world.world_id !== "world_m0_synthetic" ||
    status.synthetic_world.current_revision !== 0 ||
    status.synthetic_world.served_revision !== 0 ||
    status.synthetic_world.projection_status !== "ready"
  ) {
    throw new Error("synthetic World status is invalid");
  }

  const revision = await fetch(
    new URL("/worlds/world_m0_synthetic/revisions/0/snapshot.json", baseUrl),
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!revision.ok) throw new Error(`revision returned ${revision.status}`);
  if (!revision.headers.get("etag"))
    throw new Error("revision ETag is missing");
  if (!revision.headers.get("cache-control")?.includes("immutable")) {
    throw new Error("revision cache policy is not immutable");
  }
  const snapshot = (await revision.json()) as {
    readonly world?: { readonly world_id?: string };
  };
  if (snapshot.world?.world_id !== "world_m0_synthetic") {
    throw new Error("revision-pinned snapshot is invalid");
  }

  const currentResponse = await fetch(
    new URL("/worlds/world_m0_synthetic/current.json", baseUrl),
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!currentResponse.ok) {
    throw new Error(`current pointer returned ${currentResponse.status}`);
  }
  if (!currentResponse.headers.get("etag")) {
    throw new Error("current pointer ETag is missing");
  }
  const current = (await currentResponse.json()) as PublicationPointer;
  if (
    current.world_id !== "world_m0_synthetic" ||
    current.served_revision !== 0 ||
    current.manifest_key !==
      "worlds/world_m0_synthetic/revisions/0/manifest.json"
  ) {
    throw new Error("served pointer is invalid");
  }
}

const deadline = Date.now() + 10 * 60_000;
let lastError: unknown;
while (Date.now() < deadline) {
  try {
    await verify();
    process.stdout.write("post-deploy synthetic smoke passed\n");
    process.exit(0);
  } catch (error) {
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

throw lastError instanceof Error
  ? lastError
  : new Error("post-deploy smoke timed out");
