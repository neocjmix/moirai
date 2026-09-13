import { expect, test } from "@playwright/test";

test.skip(
  !process.env.IP004_BROWSER_SCALE,
  "Explicit synthetic scale workflow only"
);
test("large World keeps reader paging, Narrative search and both Event surfaces usable", async ({
  page
}, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const start = Date.now();
  const response = await page.goto("/graph");
  await expect(
    page.getByRole("button", { name: "소스 쿼리 열기" }).first()
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Projected chart surface" })
  ).toBeVisible();
  const graphReadyMs = Date.now() - start;
  const htmlBytes = (await response!.body()).byteLength;
  const navigation = await page.evaluate(() =>
    performance.getEntriesByType("navigation").map((entry) => entry.toJSON())
  );
  await page.getByRole("button", { name: "소스 쿼리 열기" }).first().click();
  await page.getByRole("tab", { name: "사건", exact: true }).click();
  const cards = page.getByTestId("identity-search-results").locator("article");
  await expect(cards).toHaveCount(20);
  const first = await cards.first().getAttribute("data-entity-id");
  await page.getByRole("button", { name: "다음 기록", exact: true }).click();
  await expect(cards).toHaveCount(20);
  await expect(cards.first()).not.toHaveAttribute("data-entity-id", first!);
  await page.getByRole("tab", { name: "찾기", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "사건이나 이야기 찾기" })
    .fill("사료비판");
  const match = page
    .getByRole("button", { name: /그래프에서 보기: Synthetic .*훈민정음 반포/ })
    .first();
  await expect(match).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(20);
  const detailStart = Date.now();
  await match.click();
  const drawer = page.getByRole("dialog", { name: "사건 패널" });
  await expect(
    drawer.getByRole("heading", { name: "반포라는 이름과 기록이 말하는 범위" })
  ).toBeVisible();
  const drawerMs = Date.now() - detailStart;
  await drawer.getByRole("link", { name: "사건 상세 읽기 →" }).click();
  await expect(
    page.getByRole("heading", { name: "반포라는 이름과 기록이 말하는 범위" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "그래프로 돌아가기 / Return to graph" })
  ).toBeVisible();
  expect(errors).toEqual([]);
  const measurement = {
    scale: Number(process.env.IP004_BROWSER_SCALE),
    graphReadyMs,
    htmlBytes,
    drawerMs,
    navigation,
    pageErrors: errors
  };
  console.info(JSON.stringify({ ip004_browser: measurement }));
  await testInfo.attach("ip004-reader-scale.json", {
    contentType: "application/json",
    body: JSON.stringify(measurement, null, 2)
  });
});
