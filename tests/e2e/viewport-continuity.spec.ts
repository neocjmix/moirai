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
    .poll(() =>
      new URL(page.url()).searchParams
        .get("gsViewport")
        ?.split(",")
        .slice(0, 2)
        .map(Number)
    )
    .not.toEqual([999000, 999000]);
  // The synthetic fixture spans 220 to modern years; its fitted center is
  // legitimately above 100000 world units. Assert visible data, not a made-up range.
  await expect
    .poll(() =>
      page.locator('[data-event-point-id^="m_event_"]').evaluateAll((nodes) =>
        nodes.some((node) => {
          const rect = node.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.right > 0 &&
            rect.bottom > 0 &&
            rect.left < innerWidth &&
            rect.top < innerHeight
          );
        })
      )
    )
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

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`a whole gesture released in one task settles its final camera (${reducedMotion})`, async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/graph?gsViewport=999000%2C999000%2C400%2C800");
    await expect
      .poll(() => page.locator('[data-event-point-id^="m_event_"]').count())
      .toBeGreaterThan(0);
    await page.getByTestId("graph-stage").evaluate((stage) => {
      // No native contact exists for this synthetic same-task burst. Stub
      // capture only; exercise the real React input, batching and settle path.
      const original = stage.setPointerCapture;
      stage.setPointerCapture = () => {};
      try {
        for (const [type, x, y] of [
          ["pointerdown", 30, 350],
          ["pointermove", 5000, 5000],
          ["pointerup", 5000, 5000]
        ] as const)
          stage.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              pointerId: 4242,
              pointerType: "touch",
              buttons: type === "pointerup" ? 0 : 1,
              clientX: x,
              clientY: y
            })
          );
      } finally {
        stage.setPointerCapture = original;
      }
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          let state:
            | {
                view: { x: number; y: number; scaleX: number; scaleY: number };
                navigationBounds: {
                  minX: number;
                  maxX: number;
                  minY: number;
                  maxY: number;
                };
              }
            | undefined;
          addEventListener(
            "moirai:graph-inspection",
            ((event: CustomEvent) => {
              state = event.detail;
            }) as EventListener,
            { once: true }
          );
          dispatchEvent(new Event("moirai:inspect-graph"));
          if (!state?.navigationBounds) return false;
          const x = -state.view.x / state.view.scaleX,
            y = -state.view.y / state.view.scaleY;
          const b = state.navigationBounds;
          // Navigation expands a narrower scope to a minimum120-unit span.
          // That fitted range is valid, not elastic overscroll.
          const padX = Math.max(0, (120 - (b.maxX - b.minX)) / 2);
          const padY = Math.max(0, (120 - (b.maxY - b.minY)) / 2);
          return (
            x >= b.minX - padX - 0.001 &&
            x <= b.maxX + padX + 0.001 &&
            y >= b.minY - padY - 0.001 &&
            y <= b.maxY + padY + 0.001
          );
        })
      )
      .toBe(true);
  });
}

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
