import { expect, test, type Page } from "@playwright/test";

async function seek(page: Page, tick: number) {
  const input = page.getByLabel("정확한 tick");
  await input.fill(String(tick));
  await input.press("Enter");
  await expect(page.getByTestId("state-tick")).toHaveText(
    `tick ${tick.toLocaleString("en-US")}`
  );
  await expect(
    page.getByRole("button", { name: "현재 tick 재현 검증", exact: true })
  ).toBeEnabled();
}
async function state(page: Page) {
  return page.locator("[data-node-id]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("data-node-id"),
      x: node.getAttribute("cx"),
      y: node.getAttribute("cy")
    }))
  );
}

test("P1 exact tick replay, fixed Y/camera and JSON reproduction stay browser-local", async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  const mutations: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method()))
      mutations.push(request.url());
  });
  await page.goto("/labs/layout-v2");
  await expect(
    page.getByRole("heading", { name: "Layout Lab v2", exact: true })
  ).toBeVisible();
  const initial = await state(page);
  const camera = await page.getByTestId("force-scene").getAttribute("viewBox");
  expect(initial.length).toBeGreaterThan(0);
  await seek(page, 100);
  const hundred = await state(page);
  const checksum = await page.getByTestId("state-checksum").textContent();
  expect(hundred.map((node) => node.y)).toEqual(initial.map((node) => node.y));
  expect(hundred.map((node) => node.x)).not.toEqual(
    initial.map((node) => node.x)
  );
  await page
    .getByRole("button", { name: "JSON 내보내기", exact: true })
    .click();
  const json = await page
    .getByLabel("입력·설정·tick·checksum JSON")
    .inputValue();
  await seek(page, 1000);
  await seek(page, 100);
  expect(await state(page)).toEqual(hundred);
  await expect(page.getByTestId("state-checksum")).toHaveText(checksum!);
  await expect(page.getByTestId("force-scene")).toHaveAttribute(
    "viewBox",
    camera!
  );
  await page
    .getByRole("button", { name: "현재 tick 재현 검증", exact: true })
    .click();
  await expect(page.getByTestId("reproduction-result")).toContainText(
    "PASS · tick 100"
  );
  await page.getByRole("button", { name: "재시작", exact: true }).click();
  await expect(page.getByTestId("state-tick")).toHaveText("tick 0");
  expect(await state(page)).toEqual(initial);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByTestId("state-tick")).not.toHaveText("tick 0");
  await page.getByRole("button", { name: "정지", exact: true }).click();
  const stopped = await page.getByTestId("state-tick").textContent();
  await page.waitForTimeout(150);
  await expect(page.getByTestId("state-tick")).toHaveText(stopped!);
  await page.getByLabel("입력·설정·tick·checksum JSON").fill(json);
  await page
    .getByRole("button", { name: "JSON 불러오기", exact: true })
    .click();
  await expect(page.getByTestId("state-checksum")).toHaveText(checksum!);
  expect(await state(page)).toEqual(hundred);
  const tampered = JSON.parse(json);
  tampered.stateDigest = "00000000";
  await page
    .getByLabel("입력·설정·tick·checksum JSON")
    .fill(JSON.stringify(tampered));
  await page
    .getByRole("button", { name: "JSON 불러오기", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "mismatch" })
  ).toContainText("mismatch");
  expect(await state(page)).toEqual(hundred);
  await page.getByLabel("전체 노드 척력", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "설정 적용 · tick 0", exact: true })
    .click();
  await expect(page.getByTestId("state-tick")).toHaveText("tick 0");
  expect(await state(page)).toEqual(initial);
  await expect(page.getByTestId("force-scene")).toHaveAttribute(
    "viewBox",
    camera!
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await seek(page, 100);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("lab-v2.png"),
    fullPage: true
  });
  expect(errors).toEqual([]);
  expect(mutations).toEqual([]);
});
