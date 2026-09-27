import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { GraphShellViewportResponse } from "../../apps/atropos-web/src/urdr-port/shared/contracts";

const world = "019f3b00-0000-7000-8000-000000000a01";
const battle = "019f3b00-0000-7000-8000-000000000a12";
const war = "019f3b00-0000-7000-8000-000000000a11";
const graph = `/graph/v5?world=${world}`;
const node = (page: Page) => page.locator(`[data-event-point-id="${battle}"]`);

test("partial v5 refreshes replace active geometry across 30 queries and a return", async ({
  page
}) => {
  test.setTimeout(90_000);
  let visit = 0;
  let template: GraphShellViewportResponse | undefined;
  let fail = false;
  await page.route("**/graph/v5/shell", async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind !== "viewport") return route.continue();
    if (fail) return route.fulfill({ status: 503, body: "{}" });
    if (!template) template = await (await route.fetch()).json();
    const bbox = request.viewport.bbox;
    const point = template!.entities.find(
      (e: { geometryKind: string }) => e.geometryKind === "point"
    );
    expect(point).toBeTruthy();
    await route.fulfill({
      json: {
        ...template,
        truncated: true,
        entities: [
          {
            ...point,
            id: `a4-visit-${visit}`,
            eventId: `a4-visit-${visit}`,
            containedBy: undefined,
            contains: [],
            position: {
              x: (bbox.minX + bbox.maxX) / 2,
              y: (bbox.minY + bbox.maxY) / 2
            }
          }
        ],
        regions: [],
        edges: []
      }
    });
  });
  await page.goto(graph);
  const points = page.locator('[data-event-point-id^="a4-visit-"]');
  await expect(points).toHaveCount(1);
  for (visit = 1; visit <= 30; visit++) {
    // Distinct dimensions force distinct requests without changing product data.
    await page.setViewportSize({ width: 390 + visit, height: 844 });
    await expect(
      page.locator(`[data-event-point-id="a4-visit-${visit}"]`)
    ).toHaveCount(1);
    await expect(points).toHaveCount(1);
  }
  visit = 0;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-event-point-id="a4-visit-0"]')).toHaveCount(
    1
  );
  await expect(points).toHaveCount(1);
  fail = true;
  await page.setViewportSize({ width: 430, height: 844 });
  await expect(page.getByTestId("graph-stage")).toContainText(
    "뷰포트 데이터를 불러오지 못했습니다."
  );
  await expect(points).toHaveCount(1);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("urdr:app-language-override", "ko")
  );
});

async function sources(page: Page) {
  await page.getByRole("button", { name: "소스 쿼리 열기" }).first().click();
  await page.getByText("탐색 범위와 시간 기준", { exact: true }).click();
}

test("v5 preserves pan, compact Composite identity, shared Event and all-off selection", async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(graph);
  await expect(page.getByTestId("graph-stage")).toBeVisible();
  await expect(page.getByTestId("moirai-source-island")).toHaveCount(1);
  const composite = page.locator(`[data-composite-point-id="${war}"]`);
  await expect(composite).toBeVisible();
  await expect(composite).toHaveCount(1);
  // The one-child Composite used to leave an invisible Event hit target.
  // Its visible compact point now opens the same Composite drawer.
  await composite.locator("rect").click();
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(
    "임진왜란 서사"
  );
  await page.getByTestId("event-drawer-close").click();
  await page.getByTestId("event-drawer-sheet").waitFor({ state: "detached" });
  await page.screenshot({
    path: testInfo.outputPath("v5-restored-mobile.png"),
    animations: "disabled"
  });
  const before = await composite.boundingBox();
  await page.mouse.move(25, 450);
  await page.mouse.down();
  await page.mouse.move(65, 510, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await composite.boundingBox())?.x)
    .toBeGreaterThan(before!.x + 25);
  await sources(page);
  await page.getByRole("checkbox", { name: "조선사", exact: true }).uncheck();
  await expect(node(page)).toHaveCount(1);
  await page.getByRole("checkbox", { name: "일본사", exact: true }).uncheck();
  await expect(node(page)).toHaveCount(0);
  await expect(composite).toHaveCount(0);
  await page.getByRole("checkbox", { name: "일본사", exact: true }).check();
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
    .getByRole("link", { name: "연대 미상 기록", exact: true })
    .click();
  await expect(drawer).toContainText("연대 미상 사건 서사");
  await page.goto(`${graph}&event=${war}`);
  await expect(drawer).toContainText("임진왜란 서사");
  await page.getByTestId("event-drawer-stage-toggle").click();
  await drawer.getByRole("link", { name: "공유된 전투", exact: true }).click();
  await expect(drawer).toContainText("공유된 전투 서사");
  await expect(page).toHaveURL(new RegExp(`event=${battle}`));
});
