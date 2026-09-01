import {
  SYNTHETIC_FIXTURE,
  type PublicationPointer
} from "../packages/contracts/src/index.js";

interface HealthPayload {
  readonly status: string;
  readonly commit_sha: string;
}

interface StatusPayload {
  readonly application: { readonly commit_sha: string };
  readonly synthetic_world: {
    readonly world_id: string;
    readonly canon_id: string;
    readonly event_id: string;
    readonly current_revision: number;
    readonly publication_target_revision: number;
    readonly served_revision: number;
    readonly projection_status: string;
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
  const health = await fetchJson<HealthPayload>("/health");
  const status = await fetchJson<StatusPayload>("/__status");
  if (health.status !== "ok") throw new Error("health is not ok");
  if (
    health.commit_sha !== expectedSha ||
    status.application.commit_sha !== expectedSha
  ) {
    throw new Error("deployed commit does not match the expected commit");
  }
  const fixture = status.synthetic_world;
  if (
    fixture.world_id !== SYNTHETIC_FIXTURE.worldId ||
    fixture.canon_id !== SYNTHETIC_FIXTURE.canonId ||
    fixture.event_id !== SYNTHETIC_FIXTURE.eventId ||
    fixture.current_revision !== 2 ||
    fixture.publication_target_revision !== 2 ||
    fixture.served_revision !== 2 ||
    fixture.projection_status !== "ready"
  ) {
    throw new Error("synthetic Change Set has not reached the served Revision");
  }

  const eventPath = `/worlds/${fixture.world_id}/canons/${fixture.canon_id}/events/${fixture.event_id}`;
  const eventPage = await fetch(new URL(eventPath, baseUrl), {
    signal: AbortSignal.timeout(10_000)
  });
  const eventHtml = await eventPage.text();
  const readableEventHtml = eventHtml.replace(/<!--.*?-->/g, "");
  if (
    !eventPage.ok ||
    !readableEventHtml.includes(SYNTHETIC_FIXTURE.eventTitle) ||
    !readableEventHtml.includes("Revision 2") ||
    !readableEventHtml.includes(SYNTHETIC_FIXTURE.secondEventTitle)
  ) {
    throw new Error("public Event route is unavailable or mixed");
  }

  const revisionPath = `/worlds/${fixture.world_id}/revisions/2/events/${fixture.event_id}.json`;
  const revision = await fetch(new URL(revisionPath, baseUrl), {
    signal: AbortSignal.timeout(10_000)
  });
  if (!revision.ok || !revision.headers.get("etag"))
    throw new Error("immutable Event document is unavailable");
  if (!revision.headers.get("cache-control")?.includes("immutable")) {
    throw new Error("revision cache policy is not immutable");
  }
  const eventDocument = (await revision.json()) as {
    readonly served_revision: number;
    readonly event?: { readonly id?: string };
  };
  if (
    eventDocument.served_revision !== 2 ||
    eventDocument.event?.id !== fixture.event_id
  ) {
    throw new Error("revision-pinned Event document is invalid");
  }
  if (JSON.stringify(eventDocument).includes("private-synthetic")) {
    throw new Error("private fixture metadata leaked into Publication");
  }

  const relatedPath = `/worlds/${fixture.world_id}/canons/${fixture.canon_id}/events/${SYNTHETIC_FIXTURE.secondEventId}`;
  const relatedPage = await fetch(new URL(relatedPath, baseUrl), {
    signal: AbortSignal.timeout(10_000)
  });
  const relatedHtml = (await relatedPage.text()).replace(/<!--.*?-->/g, "");
  if (
    !relatedPage.ok ||
    !relatedHtml.includes("An answer in the east") ||
    !relatedHtml.includes("Second bell") ||
    !relatedHtml.includes(SYNTHETIC_FIXTURE.thirdEventTitle)
  ) {
    throw new Error(
      "public Narrative, time or Relation context is unavailable"
    );
  }

  const searchPath = `/worlds/${fixture.world_id}/revisions/2/search/en.json`;
  const search = await fetch(new URL(searchPath, baseUrl), {
    signal: AbortSignal.timeout(10_000)
  });
  const searchBody = await search.text();
  if (
    !search.ok ||
    !searchBody.includes(SYNTHETIC_FIXTURE.secondEventTitle) ||
    searchBody.includes("private-synthetic")
  ) {
    throw new Error(
      "public search document is missing or leaked private metadata"
    );
  }

  const cached = await fetch(new URL(revisionPath, baseUrl), {
    signal: AbortSignal.timeout(10_000)
  });
  const cacheState = cached.headers.get("x-cache");
  if (
    !cached.ok ||
    (cacheState !== "HIT" && cacheState !== "STALE") ||
    !cached.headers.has("age")
  ) {
    throw new Error(`revision CDN cache did not hit (x-cache=${cacheState})`);
  }
  await cached.body?.cancel();

  const pointerResponse = await fetch(
    new URL(`/worlds/${fixture.world_id}/current.json`, baseUrl),
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!pointerResponse.ok || !pointerResponse.headers.get("etag")) {
    throw new Error("served pointer is unavailable");
  }
  const pointer = (await pointerResponse.json()) as PublicationPointer;
  if (
    pointer.world_id !== fixture.world_id ||
    pointer.current_revision !== 2 ||
    pointer.publication_target_revision !== 2 ||
    pointer.served_revision !== 2 ||
    pointer.manifest_key !==
      `worlds/${fixture.world_id}/revisions/2/manifest.json`
  ) {
    throw new Error("served pointer is invalid");
  }
}

const deadline = Date.now() + 10 * 60_000;
let lastError: unknown;
while (Date.now() < deadline) {
  try {
    await verify();
    process.stdout.write("post-deploy synthetic Change Set smoke passed\n");
    process.exit(0);
  } catch (error) {
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}
throw lastError instanceof Error
  ? lastError
  : new Error("post-deploy smoke timed out");
