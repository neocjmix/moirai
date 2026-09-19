import { test, expect } from "@playwright/test";
const world = "019f3b00-0000-7000-8000-000000000001",
  canon = "019f3b00-0000-7000-8000-000000000002";
test("Temporal Observatory exposes lossless meaning and the same revision JSON on mobile", async ({
  page,
  request
}) => {
  const event = "019f3b00-0000-7000-8000-000000000105";
  await page.goto(`/graph/events/${world}/${event}?revision=2&canon=${canon}`);
  const drawer = page.getByTestId("event-drawer-sheet");
  await expect(drawer).toHaveAttribute("data-stage", "full");
  await drawer
    .getByText(/기록과 계산 근거|Record and calculation details/, {
      exact: true
    })
    .click();
  const observation = drawer.getByTestId("event-observation");
  await expect(observation).toContainText("2026-09-05T08:13:21.123456789012Z");
  await expect(observation).toContainText("2026-09-05T08:13:21.123456789013Z");
  const response = await request.get(
    `/worlds/${world}/revisions/2/graph/canons/${canon}/temporal.json`
  );
  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json).toMatchObject({
    source_revision: 2,
    served_revision: 2,
    world_id: world,
    canon_id: canon
  });
  expect(
    json.positions.find((p: { event_id: string }) => p.event_id.endsWith("105"))
      .upper.time_event.coordinate
  ).toBe("2026-09-05T08:13:21.123456789013Z");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
