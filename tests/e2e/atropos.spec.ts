import { expect, test } from "@playwright/test";

test("mobile observation surface exposes the deployment and fixture", async ({
  page
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Atropos" })).toBeVisible();
  await expect(page.getByText("world_m0_synthetic")).toBeVisible();
  await expect(page.getByRole("link", { name: "Health JSON" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Status" })).toBeVisible();
});

test("health and status expose allowlisted machine-readable metadata", async ({
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
    synthetic_world: {
      world_id: "world_m0_synthetic",
      current_revision: 0,
      served_revision: 0,
      projection_status: "ready"
    }
  });
});
