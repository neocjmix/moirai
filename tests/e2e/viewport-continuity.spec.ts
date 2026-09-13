import { expect, test } from "@playwright/test";
test("viewport keeps successful geometry during a delayed or failed refresh", async ({
  page
}) => {
  await page.goto("/graph");
  const points = page.locator('[data-event-point-id^="m_event_"]');
  await expect.poll(() => points.count()).toBeGreaterThan(0);
  let intercepted = false;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/graph/spatial", async (route) => {
    intercepted = true;
    await gate;
    await route.abort();
  });
  // Changing the viewport dimensions also changes the coverage key, ensuring a refresh.
  await page.setViewportSize({ width: 400, height: 844 });
  await expect.poll(() => intercepted).toBe(true);
  await expect.poll(() => points.count()).toBeGreaterThan(0);
  release!();
  await expect(page.getByTestId("graph-stage")).toContainText(
    /Unable to load viewport data|뷰포트 데이터를 불러오지 못했습니다/i
  );
  await expect.poll(() => points.count()).toBeGreaterThan(0);
});

test("far-away restored views recover inside the publication without return controls", async ({
  page
}) => {
  await page.goto("/graph?gsViewport=999000%2C999000%2C400%2C800");
  await expect
    .poll(() => page.locator('[data-event-point-id^="m_event_"]').count())
    .toBeGreaterThan(0);
  await expect
    .poll(() => {
      const values = new URL(page.url()).searchParams
        .get("gsViewport")
        ?.split(",")
        .map(Number);
      return (
        !!values &&
        Math.abs(values[0]!) < 100000 &&
        Math.abs(values[1]!) < 100000
      );
    })
    .toBe(true);
  await expect(
    page.getByRole("button", {
      name: /전체 보기|선택 사건으로|Fit all|Return to selection/
    })
  ).toHaveCount(0);
});

test("repeated outward drags settle at a stable boundary", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/graph?gsViewport=999000%2C999000%2C400%2C800");
  await expect
    .poll(() => page.locator('[data-event-point-id^="m_event_"]').count())
    .toBeGreaterThan(0);
  const drag = async () => {
    await page.mouse.move(30, 350);
    await page.mouse.down();
    await page.mouse.move(300, 650, { steps: 8 });
    await page.mouse.up();
  };
  for (let i = 0; i < 5; i++) await drag();
  const settled = new URL(page.url()).searchParams.get("gsViewport");
  await drag();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
    .toBe(settled);
});

test("publication pinch preserves independent axes with navigation bounds", async ({
  page
}) => {
  await page.goto("/graph");
  await expect
    .poll(() => page.locator('[data-event-point-id^="m_event_"]').count())
    .toBeGreaterThan(0);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
    .not.toBeNull();
  const before = new URL(page.url()).searchParams
    .get("gsViewport")!
    .split(",")
    .map(Number);
  // WebKit exposes one native touch: pair it with a captured mouse pointer,
  // as in urdr-pinch.spec.ts, and move only the touch's horizontal coordinate.
  await page.evaluate(() => {
    document.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      (event.target as Element).dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: event.pointerId,
          pointerType: "touch",
          clientX: event.clientX + 70,
          clientY: event.clientY,
          buttons: 1,
          isPrimary: event.isPrimary
        })
      );
    });
  });
  await page.mouse.move(25, 350);
  await page.mouse.down();
  await page.touchscreen.tap(290, 550);
  await page.mouse.up();
  await expect
    .poll(() => {
      const after = new URL(page.url()).searchParams
        .get("gsViewport")!
        .split(",")
        .map(Number);
      return after[2]! < before[2]! && Math.abs(after[3]! - before[3]!) < 0.001;
    })
    .toBe(true);
});
