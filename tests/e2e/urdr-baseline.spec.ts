import { expect, test } from "@playwright/test";

// Fixed synthetic mock surface for M4.6-A. Later production-data tests must not
// compare different datasets pixel-for-pixel or delete these fixture assertions.
test("URDR baseline keeps mobile and desktop geometry, pan and selection", async ({
  page
}, testInfo) => {
  await page.goto("/graph");
  const point = page.locator('[data-event-point-id="event:founding"]');
  await expect(point).toBeVisible();
  await expect(page.getByTestId("moirai-source-island")).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("urdr-mobile-baseline.png"),
    animations: "disabled"
  });

  const before = await point.boundingBox();
  expect(before).not.toBeNull();
  // Drag empty canvas, away from floating chrome and shape hit targets.
  await page.mouse.move(25, 450);
  await page.mouse.down();
  await page.mouse.move(65, 510, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await point.boundingBox())?.x)
    .toBeGreaterThan(before!.x + 30);
  await point.click();
  await expect(page.getByTestId("event-drawer-sheet")).toBeVisible();
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(
    "조선 건국"
  );
  await page.screenshot({
    path: testInfo.outputPath("urdr-mobile-sheet.png"),
    animations: "disabled"
  });

  await page.setViewportSize({ width: 1365, height: 900 });
  await page.goto("/graph");
  await expect(point).toBeVisible();
  await expect(
    page.locator('[data-region-id="region:early-joseon"]').first()
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("urdr-desktop-baseline.png"),
    animations: "disabled"
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
