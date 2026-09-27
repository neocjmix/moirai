import { expect, test } from "@playwright/test";

test("a tiny composite is one tappable point and expands back to its area", async ({
  page
}, testInfo) => {
  const id = "region:early-joseon";
  await page.goto("/graph/demo?gsViewport=-27.5,-106,8000,16000");
  const compact = page.locator(`[data-composite-point-id="${id}"]`);
  await expect(compact).toBeVisible();
  await expect(page.locator(`[data-region-id="${id}"]`)).toHaveCount(0);
  await expect(
    page.locator('[data-event-point-id="event:founding"]')
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("compact-composite-mobile.png")
  });
  await compact.locator("rect").click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId("event-drawer-sheet")).toBeVisible();
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(id);
  await page.getByTestId("event-drawer-close").click();
  await page.goto("/graph/demo?gsViewport=-27.5,-106,500,800");
  await expect(compact).toHaveCount(0);
  await expect(page.locator(`path[data-region-id="${id}"]`)).toBeVisible();
  await expect(
    page.locator('[data-event-point-id="event:founding"]')
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("expanded-composite-mobile.png")
  });
});
