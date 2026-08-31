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
  await page
    .getByRole("link", { name: new RegExp(SYNTHETIC_FIXTURE.eventTitle) })
    .click();
  await expect(
    page.getByRole("heading", { name: SYNTHETIC_FIXTURE.eventTitle })
  ).toBeVisible();
  await expect(page.getByText("Revision 1")).toBeVisible();

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
      current_revision: 1,
      publication_target_revision: 1,
      served_revision: 1,
      projection_status: "ready"
    }
  });

  const document = await request.get(
    `/worlds/${SYNTHETIC_FIXTURE.worldId}/revisions/1/events/${SYNTHETIC_FIXTURE.eventId}.json`
  );
  expect(document.ok()).toBe(true);
  expect(document.headers()["cache-control"]).toContain("immutable");
  expect(await document.json()).toMatchObject({
    served_revision: 1,
    event: { id: SYNTHETIC_FIXTURE.eventId }
  });
});
