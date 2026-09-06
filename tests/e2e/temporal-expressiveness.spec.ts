import { test, expect } from "@playwright/test";
const world = "019f3b00-0000-7000-8000-000000000001",
  canon = "019f3b00-0000-7000-8000-000000000002";
test("Temporal Observatory exposes lossless meaning and the same revision JSON on mobile", async ({
  page,
  request
}) => {
  await page.goto(`/worlds/${world}/canons/${canon}`);
  await expect(page.getByText("220년 범위", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1969년 7월 범위", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("1969년 7월 20일 범위", { exact: true })
  ).toBeVisible();
  const ps = page.locator(
    '[data-event-id="019f3b00-0000-7000-8000-000000000105"]'
  );
  await ps.getByText("알려진 범위의 원문 좌표", { exact: true }).click();
  await expect(
    ps.getByText("2026-09-05T08:13:21.123456789012Z", { exact: true })
  ).toBeVisible();
  await expect(
    ps.getByText("2026-09-05T08:13:21.123456789013Z", { exact: true })
  ).toBeVisible();
  const composite = page.locator(
    '[data-event-id="019f3b00-0000-7000-8000-000000000107"]'
  );
  await expect(composite.getByText(/2 seconds · 명시적 경계/)).toBeVisible();
  await expect(
    page.locator(
      '[data-event-id="019f3b00-0000-7000-8000-000000000108"] .temporal-component'
    )
  ).toBeVisible();
  const during = page.locator(
    '[data-event-id="019f3b00-0000-7000-8000-000000000109"]'
  );
  await expect(during.locator(".temporal-during")).toBeVisible();
  await expect(during.locator(".temporal-component")).toHaveCount(0);
  const relative = page.locator(
    '[data-event-id="019f3b00-0000-7000-8000-00000000010a"]'
  );
  await expect(relative).toContainText("상대 순서만 알려짐");
  await expect(relative).toContainText("before");
  await expect(relative).not.toContainText(/\d{4}-\d{2}-\d{2}T/);
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
