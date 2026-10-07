import { expect, test, type Page } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";
const graph = `/graph/v5?world=${world}`;
const camera = "0,222919,390,664";
const sessionKey = "moirai:graph-session:v1";

type View = { x: number; y: number; scaleX: number; scaleY: number };

async function view(page: Page): Promise<View> {
  return page.evaluate(() => {
    let state: { view: View } | undefined;
    addEventListener(
      "moirai:graph-inspection",
      ((event: CustomEvent) => {
        state = event.detail;
      }) as EventListener,
      { once: true }
    );
    dispatchEvent(new Event("moirai:inspect-graph"));
    if (!state) throw Error("Graph inspection unavailable");
    return state.view;
  });
}

async function open(page: Page) {
  await page.goto(`${graph}&gsViewport=${camera}&gsGraphics=svg`);
  await expect(page.getByTestId("graph-context-hud")).toBeVisible();
  await expect
    .poll(() => page.locator("[data-composite-paint-id]").count())
    .toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready);
}

async function flick(page: Page, pointerType: "touch" | "pen" = "touch") {
  await page.getByTestId("graph-stage").evaluate(async (stage, kind) => {
    // Synthetic contacts need no native capture. All movement, release,
    // animation and persistence still use the actual React gesture handlers.
    const capture = stage.setPointerCapture;
    stage.setPointerCapture = () => {};
    const send = (type: string, x: number, y: number) =>
      stage.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 4242,
          pointerType: kind,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y
        })
      );
    try {
      send("pointerdown", 120, 420);
      for (let step = 1; step <= 5; step++) {
        await new Promise((resolve) => setTimeout(resolve, 24));
        send("pointermove", 120 + step * 8, 420 + step * 3);
      }
      send("pointerup", 160, 435);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    } finally {
      stage.setPointerCapture = capture;
    }
  }, pointerType);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("urdr:app-language-override", "ko")
  );
});

test("an empty entry opens World selection and malformed or blocked session storage preserves navigation", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/graph/v5");
  await expect(
    page.getByRole("heading", { name: "월드 선택", exact: true })
  ).toBeVisible();
  await page.evaluate(
    (key) => localStorage.setItem(key, "{malformed"),
    sessionKey
  );
  await open(page);
  await expect(page.getByTestId("graph-context-hud")).toBeVisible();
  await page.addInitScript((key) => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) {
      if (name === key)
        throw new DOMException("Storage unavailable", "SecurityError");
      return get.call(this, name);
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      return set.call(this, name, value);
    };
  }, sessionKey);
  await open(page);
  await expect(page.getByTestId("graph-context-hud")).toBeVisible();
  expect(errors).toEqual([]);
});

test("last World and final camera restore from an entry URL while explicit camera wins", async ({
  page
}) => {
  await open(page);
  await page.mouse.move(100, 420);
  await page.mouse.down();
  await page.mouse.move(128, 438, { steps: 5 });
  await page.mouse.up();
  const finalView = await view(page);
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) ?? "null")?.worlds?.[
            "019f3b00-0000-7000-8000-000000000a01"
          ]?.viewport?.centerX,
        sessionKey
      )
    )
    .toBeCloseTo(-finalView.x / finalView.scaleX, 5);
  const saved = new URL(page.url()).searchParams.get("gsViewport");
  expect(saved).not.toBeNull();
  await page.goto("/graph/v5");
  await expect(page.getByTestId("graph-context-hud")).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("world"))
    .toBe(world);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
    .toBe(saved);
  await page.goto("/");
  await expect(page.getByTestId("graph-context-hud")).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("world"))
    .toBe(world);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
    .toBe(saved);

  // A stale last World must not hijack a shared explicit World/camera URL.
  await page.evaluate((key) => {
    const session = JSON.parse(localStorage.getItem(key)!);
    session.lastWorldId = "019f3b00-0000-7000-8000-000000000fff";
    localStorage.setItem(key, JSON.stringify(session));
  }, sessionKey);
  await open(page);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("world"))
    .toBe(world);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
    .toBe(camera);
});

test("right-edge HUD stacks World, active topic and badged Collection layers outside the axis", async ({
  page
}, info) => {
  await open(page);
  const hud = page.getByTestId("graph-context-hud");
  const worldLink = hud.getByRole("link", { name: "월드 선택", exact: true });
  await expect(
    hud.getByRole("link", { name: "사건 목록", exact: true })
  ).toHaveCount(0);
  const trigger = hud.getByTestId("graph-collection-trigger");
  await expect(hud.getByTestId("graph-context-topic")).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await hud.evaluate((node) => {
      const link = node.querySelector("a")!;
      const topic = node.querySelector('[data-testid="graph-context-topic"]')!;
      const button = node.querySelector("button")!;
      return {
        box: node.getBoundingClientRect().toJSON(),
        world: link.getBoundingClientRect().toJSON(),
        topic: topic.getBoundingClientRect().toJSON(),
        button: button.getBoundingClientRect().toJSON(),
        wrap: getComputedStyle(link).whiteSpace,
        overflow: document.documentElement.scrollWidth > innerWidth
      };
    });
    expect(bounds.box.x).toBeGreaterThanOrEqual(64);
    expect(bounds.world.right).toBeCloseTo(width - 12, 0);
    expect(bounds.topic.right).toBeCloseTo(bounds.world.right, 0);
    expect(bounds.button.right).toBeCloseTo(bounds.world.right, 0);
    expect(bounds.topic.top).toBeGreaterThanOrEqual(bounds.world.bottom);
    expect(bounds.button.top).toBeGreaterThan(bounds.topic.bottom);
    expect(bounds.button.width).toBeGreaterThanOrEqual(44);
    expect(bounds.button.height).toBeGreaterThanOrEqual(44);
    expect(bounds.wrap).toBe("nowrap");
    expect(bounds.overflow).toBe(false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(trigger.locator("svg")).toBeVisible();
  await expect(trigger).toHaveText(/^\d+$/);
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("checkbox")).not.toHaveCount(0);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await worldLink.click();
  await expect(
    page.getByRole("heading", { name: "월드 선택", exact: true })
  ).toBeVisible();
  const entry = page.locator(`a[href="${graph}"]`);
  await expect(entry).toBeVisible();
  await expect(entry.locator("h2")).toBeVisible();
  await page.screenshot({ path: info.outputPath("world-picker-mobile.png") });
  await entry.click();
  await expect(hud).toBeVisible();
});

for (const pointerType of ["touch", "pen"] as const) {
  test(`${pointerType} flick coasts, settles and stores the final camera`, async ({
    page
  }) => {
    await open(page);
    const before = await view(page);
    await flick(page, pointerType);
    const released = await view(page);
    expect(released.x - before.x).toBeGreaterThan(20);
    await page.waitForTimeout(120);
    const coasting = await view(page);
    // This diagonal flick can reach the fixture's X camera clamp before the
    // protocol reads release. Its remaining Y coast must still count as
    // inertia; requiring more X travel rejects correct boundary handling.
    expect(
      Math.hypot(coasting.x - released.x, coasting.y - released.y)
    ).toBeGreaterThan(3);
    await page.waitForTimeout(1300);
    const settled = await view(page);
    await page.waitForTimeout(100);
    expect(await view(page)).toEqual(settled);
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const session = JSON.parse(localStorage.getItem(key) ?? "null");
          return session?.worlds?.[session.lastWorldId]?.viewport?.centerX;
        }, sessionKey)
      )
      .toBeCloseTo(-settled.x / settled.scaleX, 5);
  });
}

test("a new contact cancels inertia and reduced motion disables coast", async ({
  page
}) => {
  await open(page);
  await flick(page);
  await page.getByTestId("graph-stage").evaluate(async (stage) => {
    const capture = stage.setPointerCapture;
    stage.setPointerCapture = () => {};
    try {
      stage.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 4243,
          pointerType: "touch",
          buttons: 1,
          clientX: 160,
          clientY: 435
        })
      );
    } finally {
      stage.setPointerCapture = capture;
    }
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  const cancelled = await view(page);
  await page.waitForTimeout(200);
  expect(await view(page)).toEqual(cancelled);
  await page.getByTestId("graph-stage").dispatchEvent("pointerup", {
    pointerId: 4243,
    pointerType: "touch",
    buttons: 0,
    clientX: 160,
    clientY: 435
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await flick(page);
  const released = await view(page);
  await page.waitForTimeout(200);
  expect(await view(page)).toEqual(released);
});
