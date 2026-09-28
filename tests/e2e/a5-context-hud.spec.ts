import { expect, test } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";
const graph = `/graph/v5?world=${world}`;
const war = "019f3b00-0000-7000-8000-000000000a11";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("urdr:app-language-override", "ko")
  );
});

test("A5 mobile escape, shared detail, all-off, camera restore and legacy flag", async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(graph);
  await expect(page.getByTestId("graph-context-hud")).toBeVisible();
  await expect(page.getByTestId("moirai-source-island")).toHaveCount(0);
  await expect(
    page.locator(`[data-composite-point-id="${war}"]`)
  ).toBeVisible();
  const trigger = page.getByRole("button", { name: /^컬렉션/ });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("searchbox", { name: "컬렉션 검색" }).fill("일본");
  await expect(
    page.getByRole("checkbox", { name: "조선사", exact: true })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "일본사 설명", exact: true }).click();
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(
    "일본사 컬렉션 서사"
  );
  await page.getByTestId("event-drawer-close").click();
  await page.getByTestId("event-drawer-sheet").waitFor({ state: "detached" });
  await trigger.click();
  await page.getByRole("button", { name: "모두 끄기", exact: true }).click();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.locator("[data-event-point-id]")).toHaveCount(0);
  await expect(page.locator("[data-composite-point-id]")).toHaveCount(0);
  await expect(page.getByTestId("graph-context-topic")).toHaveCount(0);
  await trigger.click();
  await page.getByRole("checkbox", { name: "일본사", exact: true }).check();
  await page.getByRole("dialog").press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator("[data-event-point-id]")).not.toHaveCount(0);
  await page.mouse.move(25, 450);
  await page.mouse.down();
  await page.mouse.move(70, 510, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
    .not.toBeNull();
  const camera = new URL(page.url()).searchParams.get("gsViewport");
  await page.reload();
  await expect(page.getByTestId("graph-context-hud")).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
    .toBe(camera);
  await page.screenshot({
    path: info.outputPath("a5-context-mobile.png"),
    animations: "disabled"
  });
  await page.goto(`${graph}&discovery=legacy`);
  await expect(page.getByTestId("moirai-source-island")).toHaveCount(1);
  await expect(page.getByTestId("graph-context-hud")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("full-viewport suppression hands meaning to HUD; partial support does not claim a topic", async ({
  page
}) => {
  let complete = true;
  await page.route("**/graph/v5/shell", async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind !== "viewport") return route.continue();
    const response = await (await route.fetch()).json();
    const box = request.viewport.bbox;
    const dx = box.maxX - box.minX;
    const dy = box.maxY - box.minY;
    const positions = [
      { x: box.minX - dx, y: box.minY - dy },
      { x: box.maxX + dx, y: box.minY - dy },
      { x: box.maxX + dx, y: box.maxY + dy },
      { x: box.minX - dx, y: box.maxY + dy }
    ];
    const base = {
      canonId: world,
      validationState: "ok",
      diagnostics: [],
      viewportClass: "visible"
    };
    const points = positions.map((position, i) => ({
      ...base,
      id: `support-${i}`,
      eventId: `support-${i}`,
      label: `support ${i}`,
      geometryKind: "point",
      contains: [],
      position
    }));
    await route.fulfill({
      json: {
        ...response,
        entities: points,
        regions: [
          {
            ...base,
            id: war,
            eventId: war,
            label: "고정된 맥락",
            geometryKind: "region",
            childrenComplete: complete,
            contains: points.map((point) => point.id),
            worldBounds: box
          }
        ],
        edges: [],
        completeness: {
          entities: true,
          regions: true,
          edges: true,
          regionSupport: complete
        }
      }
    });
  });
  await page.goto(graph);
  await expect(page.getByTestId("graph-context-topic")).toHaveText(
    "고정된 맥락"
  );
  await expect(page.locator(`[data-region-id="${war}"]`)).toHaveCount(0);
  complete = false;
  await page.setViewportSize({ width: 400, height: 844 });
  await expect(page.getByTestId("graph-context-topic")).toHaveCount(0);
  await expect(page.getByTestId("graph-context-hud")).toBeVisible();
});
