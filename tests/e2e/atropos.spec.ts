import { expect, test } from "@playwright/test";

const worldId = "019f3b00-0000-7000-8000-000000000001";
const canonId = "019f3b00-0000-7000-8000-000000000002";
const firstEventId = "019f3b00-0000-7000-8000-000000000101";
const firstEventTitle = "220년에 기록된 사건";

test("mobile reader traverses the single relational temporal model", async ({
  page
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atropos" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /공개 상태 확인/ })
  ).toBeVisible();
  await page.goto(`/worlds/${worldId}/canons/${canonId}`);
  await expect(
    page.getByRole("heading", { name: "Temporal Acceptance Canon" })
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("시간 · REVISION 2")).toBeVisible();
  await expect(page.getByText("DERIVED TIMELINE")).toHaveCount(0);
  await expect(page.getByText("DERIVED PROCESSES")).toHaveCount(0);
  await page
    .locator("a.event-card")
    .filter({ hasText: firstEventTitle })
    .click();
  await expect(
    page.getByRole("heading", { name: firstEventTitle })
  ).toBeVisible();
  await expect(page.getByText("Revision 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "같은 Revision의 공개 시간 JSON" })
  ).toBeVisible();
});

test("health and immutable artifacts expose only the relational model", async ({
  request
}) => {
  const health = await request.get("/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({
    status: "ok",
    service: "atropos-web"
  });

  const status = await request.get("/__status", {
    headers: { accept: "application/json" }
  });
  expect(status.ok()).toBe(true);
  expect(await status.json()).toMatchObject({
    application: { service: "atropos-web" },
    versions: { contract: "2", schema: "1.0.0", publication_format: "1.0.0" },
    surfaces: { atropos: "ok", health: "ok", status: "ok" }
  });

  const event = await request.get(
    `/worlds/${worldId}/revisions/2/events/${firstEventId}.json`
  );
  expect(event.ok()).toBe(true);
  expect(event.headers()["cache-control"]).toContain("immutable");
  const eventPayload = await event.json();
  expect(eventPayload).toMatchObject({
    served_revision: 2,
    event: { id: firstEventId }
  });
  expect(JSON.stringify(eventPayload)).not.toContain("temporal_placements");
  expect(JSON.stringify(eventPayload)).not.toContain("process_artifact");

  const temporal = await request.get(
    `/worlds/${worldId}/revisions/2/graph/canons/${canonId}/temporal.json`
  );
  expect(temporal.ok()).toBe(true);
  expect(temporal.headers()["cache-control"]).toContain("immutable");
  expect(await temporal.json()).toMatchObject({
    source_revision: 2,
    projection_type: "event_relational_time",
    canon_id: canonId,
    algorithm_version: "event-relational-projection/1"
  });

  for (const name of [
    "states.json",
    `timeline-${canonId}.json`,
    `process-${firstEventId}.json`
  ]) {
    expect(
      (
        await request.get(
          `/worlds/${worldId}/revisions/2/graph/canons/${canonId}/${name}`
        )
      ).status()
    ).toBe(404);
  }
});
