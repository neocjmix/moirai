import { expect, test } from "@playwright/test";
import { SYNTHETIC_FIXTURE } from "../../packages/contracts/src/index.js";

test("mobile reader traverses World, Canon and Event at one served Revision", async ({
  page
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atropos" })).toBeVisible();
  await page.getByRole("link", { name: /합성 세계 열기/ }).click();
  await expect(
    page.getByRole("heading", { name: SYNTHETIC_FIXTURE.worldTitle })
  ).toBeVisible();
  await page
    .getByRole("link", { name: new RegExp(SYNTHETIC_FIXTURE.canonTitle) })
    .click();
  await expect(
    page.getByRole("heading", { name: SYNTHETIC_FIXTURE.canonTitle })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ember Count" })
  ).toBeVisible();
  await expect(page.getByText("DERIVED TIMELINE")).toBeVisible();
  await expect(page.getByText("First bell")).toBeVisible();
  await page
    .locator("a.event-card")
    .filter({ hasText: SYNTHETIC_FIXTURE.eventTitle })
    .click();
  await expect(
    page.getByRole("heading", { name: SYNTHETIC_FIXTURE.eventTitle })
  ).toBeVisible();
  await expect(page.getByText("Revision 2")).toBeVisible();

  const detailToggle = page.getByRole("button", {
    name: /사건 상세 전체 화면/
  });
  await detailToggle.click();
  await expect(page.locator(".event-sheet")).toHaveAttribute(
    "data-expanded",
    "true"
  );
  const statusToggle = page.getByRole("button", { name: /Atropos/ });
  await statusToggle.click();
  await expect(page.getByText("Immutable Snapshot")).toBeVisible();
  await statusToggle.click();
  await page
    .getByRole("link", { name: new RegExp(SYNTHETIC_FIXTURE.secondEventTitle) })
    .click();
  await expect(
    page.getByRole("heading", { name: SYNTHETIC_FIXTURE.secondEventTitle })
  ).toBeVisible();
  await expect(page.getByText("An answer in the east")).toBeVisible();
  await expect(page.getByText("Second bell")).toBeVisible();

  await page.goto(
    `/worlds/${SYNTHETIC_FIXTURE.worldId}/search?q=acknowledgement`
  );
  await expect(
    page.getByRole("link", {
      name: new RegExp(SYNTHETIC_FIXTURE.secondEventTitle)
    })
  ).toBeVisible();
});

test("health, status and immutable Event document expose allowlisted metadata", async ({
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
    synthetic_world: {
      world_id: SYNTHETIC_FIXTURE.worldId,
      current_revision: 2,
      publication_target_revision: 2,
      served_revision: 2,
      projection_status: "ready"
    }
  });

  const document = await request.get(
    `/worlds/${SYNTHETIC_FIXTURE.worldId}/revisions/2/events/${SYNTHETIC_FIXTURE.eventId}.json`
  );
  expect(document.ok()).toBe(true);
  expect(document.headers()["cache-control"]).toContain("immutable");
  const payload = await document.json();
  expect(payload).toMatchObject({
    served_revision: 2,
    event: { id: SYNTHETIC_FIXTURE.eventId }
  });
  expect(JSON.stringify(payload)).not.toContain("private-synthetic");

  const timeline = await request.get(
    `/worlds/${SYNTHETIC_FIXTURE.worldId}/revisions/2/graph/canons/${SYNTHETIC_FIXTURE.canonId}/timeline-${SYNTHETIC_FIXTURE.timeSystemId}.json`
  );
  expect(timeline.ok()).toBe(true);
  expect(timeline.headers()["cache-control"]).toContain("immutable");
  expect(await timeline.json()).toMatchObject({
    source_revision: 2,
    projection_type: "timeline",
    canon_id: SYNTHETIC_FIXTURE.canonId,
    time_system_id: SYNTHETIC_FIXTURE.timeSystemId,
    completeness: "complete"
  });
});
