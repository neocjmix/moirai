import { expect, test } from "@playwright/test";
test("viewport keeps successful geometry during a delayed or failed refresh", async ({
  page
}) => {
  await page.goto("/graph");
  const points = page.locator('[data-event-point-id^="m_event_"]');
  await expect.poll(() => points.count()).toBeGreaterThan(0);
  let intercepted = false;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/graph/spatial", async (route) => {
    intercepted = true;
    await gate;
    await route.abort();
  });
  // Changing the viewport dimensions also changes the coverage key, ensuring a refresh.
  await page.setViewportSize({ width: 400, height: 844 });
  await expect.poll(() => intercepted).toBe(true);
  await expect.poll(() => points.count()).toBeGreaterThan(0);
  release!();
  await expect(page.getByTestId("graph-stage")).toContainText(
    /moirai_spatial_read_failed|fetch|Load failed/i
  );
  await expect.poll(() => points.count()).toBeGreaterThan(0);
});
