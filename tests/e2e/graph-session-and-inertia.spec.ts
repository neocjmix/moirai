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

test("compact two-row HUD preserves World, Events and Collection navigation outside the axis", async ({
  page
}, info) => {
  await open(page);
  const hud = page.getByTestId("graph-context-hud");
  const worldLink = hud.getByRole("link", { name: "월드 선택", exact: true });
  const eventsLink = hud.getByRole("link", { name: "사건 목록", exact: true });
  const bounds = await hud.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const links = [...node.querySelectorAll("a")].map((link) => ({
      box: link.getBoundingClientRect().toJSON(),
      wrap: getComputedStyle(link).whiteSpace
    }));
    return {
      box: box.toJSON(),
      links,
      overflow: document.documentElement.scrollWidth > innerWidth
    };
  });
  expect(bounds.box.x).toBeGreaterThanOrEqual(64);
  expect(bounds.box.height).toBeLessThanOrEqual(68);
  expect(bounds.links).toHaveLength(2);
  expect(bounds.links[0]!.box.y).toBe(bounds.links[1]!.box.y);
  expect(bounds.links.every((link) => link.wrap === "nowrap")).toBe(true);
  expect(bounds.overflow).toBe(false);
  await page.getByRole("button", { name: /^컬렉션/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("checkbox")).not.toHaveCount(0);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await eventsLink.click();
  await expect(page).toHaveURL(new RegExp(`/worlds/${world}/events`));
  await page.goBack();
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
    expect(coasting.x - released.x).toBeGreaterThan(3);
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
