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
  const phase = (name: string) =>
    console.info(
      JSON.stringify({
        ip004_browser_phase: name,
        scale: Number(process.env.IP004_BROWSER_SCALE),
        elapsed_ms: Date.now() - start
      })
    );
  const response = await page.goto("/graph");
  await expect(
    page.getByRole("button", { name: "소스 쿼리 열기" }).first()
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Projected chart surface" })
  ).toBeVisible();
  const graphReadyMs = Date.now() - start;
  expect(graphReadyMs).toBeLessThanOrEqual(8000);
  phase("graph_ready");
  const frameSample = page.evaluate(async () => {
    const intervals: number[] = [];
    let last = performance.now();
    for (let i = 0; i < 120; i++) {
      const now = await new Promise<number>(requestAnimationFrame);
      intervals.push(now - last);
      last = now;
    }
    intervals.sort((a, b) => a - b);
    return {
      samples: intervals.length,
      frame_p95_ms: intervals[Math.ceil(intervals.length * 0.95) - 1],
      frame_max_ms: intervals.at(-1),
      dom_nodes: document.querySelectorAll("*").length
    };
  });
  await page.mouse.move(20, 450);
  await page.mouse.down();
  await page.mouse.move(60, 510, { steps: 30 });
  await page.mouse.up();
  const interaction = await frameSample;
  phase("pan_measured");
  const htmlBytes = (await response!.body()).byteLength;
  const navigation = await page.evaluate(() =>
    performance.getEntriesByType("navigation").map((entry) => entry.toJSON())
  );
  await page.getByRole("button", { name: "소스 쿼리 열기" }).first().click();
  await page.getByRole("tab", { name: "사건", exact: true }).click();
  phase("events_open");
  const cards = page.getByTestId("identity-search-results").locator("article");
  await expect(cards).toHaveCount(20);
  phase("first_page");
  const first = await cards.first().getAttribute("data-entity-id");
  await expect(
    page.getByRole("button", { name: "다음 기록", exact: true })
  ).toBeInViewport();
  await page.getByRole("button", { name: "다음 기록", exact: true }).click();
  phase("next_clicked");
  await expect(cards).toHaveCount(20);
  await expect(cards.first()).not.toHaveAttribute("data-entity-id", first!);
  phase("next_page");
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
  const openSourceNote = async () => {
    const note = drawer.getByTestId("narrative-notes").filter({
      has: page.getByText("반포라는 이름과 기록이 말하는 범위", { exact: true })
    });
    await expect(note).not.toHaveAttribute("open", "");
    await note.locator("summary").click();
  };
  await openSourceNote();
  await expect(
    drawer.getByRole("heading", { name: "반포라는 이름과 기록이 말하는 범위" })
  ).toBeVisible();
  const drawerMs = Date.now() - detailStart;
  expect(drawerMs).toBeLessThanOrEqual(5000);
  await drawer.getByRole("link", { name: "사건 상세 읽기 →" }).click();
  await openSourceNote();
  await expect(
    page.getByRole("heading", { name: "반포라는 이름과 기록이 말하는 범위" })
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "사건 패널" })).toHaveAttribute(
    "data-stage",
    "full"
  );
  await expect(
    page.getByRole("button", { name: "그래프로 축소" })
  ).toBeVisible();
  expect(errors).toEqual([]);
  const measurement = {
    scale: Number(process.env.IP004_BROWSER_SCALE),
    graphReadyMs,
    htmlBytes,
    drawerMs,
    interaction,
    navigation,
    pageErrors: errors
  };
  console.info(JSON.stringify({ ip004_browser: measurement }));
  await testInfo.attach("ip004-reader-scale.json", {
    contentType: "application/json",
    body: JSON.stringify(measurement, null, 2)
  });
});
