import { expect, test } from "@playwright/test";
import { SYNTHETIC_FIXTURE } from "../../packages/contracts/src/index.js";

test("mobile reader traverses relational Canon and Event at one Revision", async ({
  page
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atropos" })).toBeVisible();
  await page.getByRole("link", { name: /합성 세계 열기/ }).click();
  await expect(
    page.getByRole("heading", { name: SYNTHETIC_FIXTURE.worldTitle })
  ).toBeVisible();
  const canonPath = `/worlds/${SYNTHETIC_FIXTURE.worldId}/canons/${SYNTHETIC_FIXTURE.canonId}`;
  await page.goto(canonPath);
  await expect(
    page.getByRole("heading", { name: SYNTHETIC_FIXTURE.canonTitle })
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("시간 · REVISION 2")).toBeVisible();
  await expect(page.getByText("DERIVED SUBJECTS")).toBeVisible();
  await page
    .locator("a.event-card")
    .filter({ hasText: SYNTHETIC_FIXTURE.eventTitle })
    .click();
  await expect(
    page.getByRole("heading", { name: SYNTHETIC_FIXTURE.eventTitle })
  ).toBeVisible();
  await expect(page.getByText("Revision 2")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "같은 Revision의 공개 시간 JSON" })
  ).toBeVisible();
  await page
    .locator("a.relation-row")
    .filter({ hasText: "causes" })
    .filter({ hasText: SYNTHETIC_FIXTURE.secondEventTitle })
    .click();
  await expect(
    page.getByRole("heading", { name: SYNTHETIC_FIXTURE.secondEventTitle })
  ).toBeVisible();
  await expect(page.getByText("An answer in the east")).toBeVisible();
});

test("health and immutable relational artifacts expose allowlisted metadata", async ({
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
    versions: { contract: "2", schema: "1.0.0", publication_format: "1.0.0" },
    synthetic_world: { served_revision: 2, projection_status: "ready" }
  });

  const event = await request.get(
    `/worlds/${SYNTHETIC_FIXTURE.worldId}/revisions/2/events/${SYNTHETIC_FIXTURE.eventId}.json`
  );
  expect(event.ok()).toBe(true);
  expect(event.headers()["cache-control"]).toContain("immutable");
  const eventPayload = await event.json();
  expect(eventPayload).toMatchObject({
    served_revision: 2,
    event: { id: SYNTHETIC_FIXTURE.eventId }
  });
  expect(JSON.stringify(eventPayload)).not.toContain("temporal_placements");
  expect(JSON.stringify(eventPayload)).not.toContain("source_event_id");

  const temporal = await request.get(
    `/worlds/${SYNTHETIC_FIXTURE.worldId}/revisions/2/graph/canons/${SYNTHETIC_FIXTURE.canonId}/temporal.json`
  );
  expect(temporal.ok()).toBe(true);
  expect(temporal.headers()["cache-control"]).toContain("immutable");
  expect(await temporal.json()).toMatchObject({
    source_revision: 2,
    projection_type: "event_relational_time",
    canon_id: SYNTHETIC_FIXTURE.canonId,
    algorithm_version: "event-relational-projection/1"
  });
});
