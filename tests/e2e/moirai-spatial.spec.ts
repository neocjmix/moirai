import { expect, test } from "@playwright/test";

test("Moirai Publication uses the copied viewport, bounded reads and same-revision stable detail", async ({
  page,
  request
}, testInfo) => {
  const responses: { bytes: number; vector: unknown; count: number }[] = [];
  page.on("response", async (response) => {
    if (response.url().endsWith("/graph/spatial") && response.ok()) {
      try {
        const body = await response.text();
        const data = JSON.parse(body);
        responses.push({
          bytes: Buffer.byteLength(body),
          vector: data.revision_vector,
          count:
            data.viewport.entities.length +
            data.viewport.edges.length +
            data.viewport.regions.length
        });
      } catch {
        /* Navigation can cancel an obsolete response. */
      }
    }
  });
  await page.goto("/graph");
  await expect(page.getByTestId("graph-stage")).toBeVisible();
  await expect(
    page.locator('[data-event-point-id="event:founding"]')
  ).toHaveCount(0);
  await expect.poll(() => responses.length).toBeGreaterThan(0);
  await expect
    .poll(() => page.locator('[data-event-point-id^="m_event_"]').count())
    .toBeGreaterThan(0);
  await expect(
    page.locator('[class*="canvasProbeAxisTickLabel"]').first()
  ).toBeVisible();
  expect(
    responses.every((r) => r.bytes <= 1024 * 1024 && r.count <= 2500)
  ).toBe(true);
  // Choose a real point inside the viewport rather than assuming a particular layout coordinate.
  const targets = page.locator('[data-event-point-id^="m_event_"]');
  const count = await targets.count();
  let selected = -1;
  for (let i = 0; i < count; i++) {
    const box = await targets.nth(i).boundingBox();
    if (
      box &&
      box.x > 30 &&
      box.x + box.width < 360 &&
      box.y > 160 &&
      box.y + box.height < 690
    ) {
      selected = i;
      break;
    }
  }
  if (selected < 0) {
    // Zoom out through the preserved wheel input until the existing geometry is reachable.
    await page.mouse.move(195, 400);
    await page.mouse.wheel(0, 500);
    await expect
      .poll(async () => {
        for (let i = 0; i < (await targets.count()); i++) {
          const b = await targets.nth(i).boundingBox();
          if (
            b &&
            b.x > 25 &&
            b.x + b.width < 365 &&
            b.y > 150 &&
            b.y + b.height < 700
          ) {
            selected = i;
            return true;
          }
        }
        return false;
      })
      .toBe(true);
  }
  const target = targets.nth(selected);
  const id = await target.getAttribute("data-event-point-id");
  expect(id).toMatch(/^m_event_/);
  await target.click();
  const sheet = page.getByTestId("event-drawer-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Revision: 2");
  await expect(sheet).toContainText("canon_memberships");
  await page.screenshot({
    path: testInfo.outputPath("moirai-spatial-mobile-sheet.png"),
    animations: "disabled"
  });
  const link = sheet.getByRole("link", { name: "Open stable Event" });
  await expect(link).toHaveAttribute("href", /revision=2&mq=/);
  const shared = page.url();
  const mq = new URL(shared).searchParams.get("mq")!;
  const state = JSON.parse(mq);
  expect(state.focus.kind).toBe("event");
  await link.click();
  await expect(page.getByTestId("return-to-graph")).toBeVisible();
  await expect(page.locator("main")).toContainText("2");
  await page.getByTestId("return-to-graph").click();
  await expect(page.getByTestId("event-drawer-sheet")).toBeVisible();
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(
    state.focus.event_ref.event_id
  );
  const html = await request.get(`/graph?mq=${encodeURIComponent(mq)}`);
  expect(await html.text()).toContain(state.focus.event_ref.event_id);
  expect(await html.text()).toContain("Revision vector:");
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.goto(shared);
  await expect(page.getByTestId("event-drawer-sheet")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("moirai-spatial-desktop.png"),
    animations: "disabled"
  });
});
