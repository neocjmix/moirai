import { expect, test } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";
const event = "019f3b00-0000-7000-8000-000000000a12";

test("Collection refresh retains an admitted Event label against a fading Composite", async ({
  page
}) => {
  let blockViewport = false;
  let releaseViewport: (() => void) | undefined;
  await page.addInitScript(() =>
    localStorage.setItem("urdr:app-language-override", "ko")
  );
  await page.route("**/graph/v5/shell", async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind !== "viewport") return route.continue();
    const response = await (await route.fetch()).json();
    if (blockViewport)
      await new Promise<void>((resolve) => {
        releaseViewport = resolve;
      });
    const box = request.viewport.bbox;
    const dx = box.maxX - box.minX;
    const dy = box.maxY - box.minY;
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const base = {
      canonId: world,
      validationState: "ok",
      diagnostics: [],
      viewportClass: "visible",
      contains: []
    };
    // Both labels fit but collide. The selected Event establishes the label;
    // the committed Event and Composite survive while the next scene prepares.
    const rx = cx;
    const bounds = {
      minX: rx - dx * 0.001,
      maxX: rx + dx * 0.001,
      minY: cy - dy * 0.001,
      maxY: cy + dy * 0.001
    };
    await route.fulfill({
      json: {
        ...response,
        entities: [
          {
            ...base,
            id: event,
            eventId: event,
            label: "Shared Event",
            geometryKind: "point",
            position: { x: cx, y: cy }
          }
        ],
        regions: [
          {
            ...base,
            id: "colliding-composite",
            eventId: "colliding-composite",
            label: "Group",
            geometryKind: "region",
            childrenComplete: true,
            worldBounds: bounds,
            preparedWorldHull: [
              { x: bounds.minX, y: bounds.minY },
              { x: bounds.maxX, y: bounds.minY },
              { x: bounds.maxX, y: bounds.maxY },
              { x: bounds.minX, y: bounds.maxY }
            ]
          }
        ],
        edges: [],
        completeness: {
          entities: true,
          regions: true,
          edges: true,
          regionSupport: true
        }
      }
    });
  });
  await page.goto(`/graph/v5?world=${world}&tileData=0&event=${event}`);
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(
    "공유된 전투"
  );
  await page.getByTestId("event-drawer-close").click();
  await expect(page.getByTestId("event-drawer-sheet")).toHaveCount(0);
  const target = page.locator(
    `[data-primary-hit-target="event"][data-event-point-id="${event}"]`
  );
  await expect(target).toBeVisible();
  const committedTarget = await target.elementHandle();
  await expect(
    page.locator('[data-composite-point-id="colliding-composite"]')
  ).toHaveCount(1);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
    .not.toBeNull();
  const camera = new URL(page.url()).searchParams.get("gsViewport");
  await page.getByRole("button", { name: "컬렉션 2", exact: true }).click();
  const option = page.getByRole("checkbox", { name: "일본사", exact: true });
  blockViewport = true;
  await option.uncheck();
  await expect.poll(() => Boolean(releaseViewport)).toBe(true);
  // IP-015 keeps the complete committed scene while replacement data waits.
  await expect(target).toBeVisible();
  expect(
    await target.evaluate(
      (node, previous) => node === previous,
      committedTarget
    )
  ).toBe(true);
  blockViewport = false;
  releaseViewport!();
  await expect(target).toBeVisible();
  await option.check();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(target).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
    .toBe(camera);
  await expect(page.locator(`[data-event-point-id="${event}"]`)).toHaveCount(1);
  await target.focus();
  await target.press("Enter");
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(
    "공유된 전투"
  );
});
