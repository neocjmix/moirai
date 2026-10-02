import { expect, test } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";
const graph = `/graph/v5?world=${world}`;
const war = "019f3b00-0000-7000-8000-000000000a11";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("urdr:app-language-override", "ko")
  );
});

test("Collection navigation during drawer close settles on one detail request", async ({
  page
}) => {
  const detailRequests: string[] = [];
  const initialEventRequests: string[] = [];
  let releaseDetails: (() => void) | undefined;
  const detailGate = new Promise<void>((resolve) => {
    releaseDetails = resolve;
  });
  await page.route("**/graph/v5/shell", async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind === "detail") initialEventRequests.push(request.event_id);
    if (request.kind !== "collection") return route.continue();
    detailRequests.push(request.collection_id);
    await detailGate;
    await route.continue();
  });
  await page.goto(`${graph}&event=${war}`);
  const drawer = page.getByTestId("event-drawer-sheet");
  await expect(drawer).toContainText("임진왜란 서사");
  expect(initialEventRequests).toEqual([war]);
  await page.getByTestId("event-drawer-close").click();
  // The outgoing drawer still exists during its exit. Incoming Collection
  // focus must take ownership without reporting the outgoing Event upstream.
  await page.getByRole("button", { name: /^컬렉션/ }).click();
  await page.getByRole("button", { name: "일본사 설명", exact: true }).click();
  await expect.poll(() => detailRequests.length).toBe(1);
  await page.waitForTimeout(250);
  expect(detailRequests).toHaveLength(1);
  releaseDetails!();
  await expect(drawer).toContainText("일본사 컬렉션 서사");
  expect(detailRequests).toHaveLength(1);
  await expect(page).toHaveURL(/collection=/);
  await page.getByTestId("event-drawer-stage-toggle").click();
  await expect(drawer).toHaveAttribute("data-stage", "full");
  await expect(drawer).toContainText("일본사 컬렉션 서사");
  expect(detailRequests).toHaveLength(1);
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

test("full, narrow and incomplete support all receive a ranked representative", async ({
  page
}) => {
  let complete = true;
  let linear = false;
  // The synthetic viewport varies only the geometry below. Load immutable
  // response metadata once so later camera callbacks need no API body read.
  let responseTemplate: Promise<Record<string, unknown>> | undefined;
  await page.route("**/graph/v5/shell", async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind !== "viewport") return route.continue();
    responseTemplate ??= route.fetch().then((response) => response.json());
    const response = await responseTemplate;
    const box = request.viewport.bbox;
    const dx = box.maxX - box.minX;
    const dy = box.maxY - box.minY;
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const positions = linear
      ? [
          { x: cx - dx * 0.002, y: cy - dy * 0.08 },
          { x: cx + dx * 0.002, y: cy - dy * 0.08 },
          { x: cx + dx * 0.002, y: cy + dy * 0.08 },
          { x: cx - dx * 0.002, y: cy + dy * 0.08 }
        ]
      : [
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
  linear = true;
  await page.setViewportSize({ width: 410, height: 844 });
  await expect(page.locator(`[data-region-id="${war}"]`)).not.toHaveCount(0);
  await expect(page.getByTestId("graph-context-topic")).toHaveText(
    "고정된 맥락"
  );
  complete = false;
  const finalViewport = page.waitForResponse((response) => {
    if (!response.url().endsWith("/graph/v5/shell")) return false;
    const request = response.request().postDataJSON();
    return (
      request.kind === "viewport" && request.viewport.viewportWidth === 400
    );
  });
  await page.setViewportSize({ width: 400, height: 844 });
  await (await finalViewport).finished();
  await expect(page.getByTestId("graph-context-topic")).toHaveText(
    "고정된 맥락"
  );
  await expect(page.getByTestId("graph-context-hud")).toBeVisible();
});
