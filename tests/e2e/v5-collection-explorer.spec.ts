import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";
const battle = "019f3b00-0000-7000-8000-000000000a12";
const war = "019f3b00-0000-7000-8000-000000000a11";
const graph = `/graph/v5?world=${world}`;
const node = (page: Page) => page.locator(`[data-event-point-id="${battle}"]`);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("urdr:app-language-override", "ko")
  );
});

async function sources(page: Page) {
  await page.getByRole("button", { name: "소스 쿼리 열기" }).first().click();
  await page.getByText("탐색 범위와 시간 기준", { exact: true }).click();
}

test("v5 uses the original URDR shell, pan, one shared node and all-off selection", async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(graph);
  await expect(page.getByTestId("graph-stage")).toBeVisible();
  await expect(page.getByTestId("moirai-source-island")).toHaveCount(1);
  await expect(node(page)).toBeVisible();
  await expect(node(page)).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("v5-restored-mobile.png"),
    animations: "disabled"
  });
  const before = await node(page).boundingBox();
  await page.mouse.move(25, 450);
  await page.mouse.down();
  await page.mouse.move(65, 510, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await node(page).boundingBox())?.x)
    .toBeGreaterThan(before!.x + 25);
  await sources(page);
  await page.getByRole("checkbox", { name: "조선사", exact: true }).uncheck();
  await expect(node(page)).toHaveCount(1);
  await page.getByRole("checkbox", { name: "일본사", exact: true }).uncheck();
  await expect(node(page)).toHaveCount(0);
  await page.getByRole("checkbox", { name: "조선사", exact: true }).check();
  await expect(node(page)).toHaveCount(1);
  await page.getByRole("button", { name: "소스 쿼리 접기" }).click();
  await node(page).click();
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(
    "공유된 전투 서사"
  );
  await page.getByTestId("event-drawer-stage-toggle").click();
  await expect(page.getByTestId("event-drawer-sheet")).toHaveAttribute(
    "data-stage",
    "full"
  );
  await page.screenshot({
    path: testInfo.outputPath("v5-restored-drawer.png"),
    animations: "disabled"
  });
  expect(errors).toEqual([]);
});

test("original drawer reads Collection, unplaced Event and Composite children", async ({
  page
}) => {
  await page.goto(graph);
  await sources(page);
  await page.getByRole("button", { name: "일본사 설명", exact: true }).click();
  const drawer = page.getByTestId("event-drawer-sheet");
  await expect(drawer).toContainText("일본사 컬렉션 서사");
  await page.getByTestId("event-drawer-stage-toggle").click();
  await drawer
    .getByRole("link", { name: "연대 미상 사건", exact: true })
    .click();
  await expect(drawer).toContainText("연대 미상 사건 서사");
  await page.goto(`${graph}&event=${war}`);
  await expect(drawer).toContainText("임진왜란 서사");
  await page.getByTestId("event-drawer-stage-toggle").click();
  await drawer.getByRole("link", { name: "공유된 전투", exact: true }).click();
  await expect(drawer).toContainText("공유된 전투 서사");
  await expect(page).toHaveURL(new RegExp(`event=${battle}`));
});
