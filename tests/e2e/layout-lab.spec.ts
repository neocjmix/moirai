import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { LabPreset } from "../../apps/atropos-web/src/labs/layout/preset";

const beforeName = "A · 기준 화면 지도";
const afterName = "B · 바꾼 화면 지도";

async function openSection(page: Page, name: string) {
  const section = page.getByTestId(`lab-section-${name}`);
  if (!(await section.evaluate((node) => (node as HTMLDetailsElement).open)))
    await section.locator("summary").click();
}

async function readPreset(page: Page): Promise<LabPreset> {
  await openSection(page, "preset");
  await page.getByTestId("lab-preset-show").click();
  return JSON.parse(
    await page.getByTestId("lab-preset-json").inputValue()
  ) as LabPreset;
}

async function waitForCompute(page: Page) {
  await expect(page.getByTestId("lab-preset-show")).toBeEnabled();
}

async function ready(page: Page) {
  await page.goto("/labs/layout?demo=1");
  await expect(
    page.getByRole("heading", { name: "사건 표현·배치 실험실" })
  ).toBeVisible();
  await waitForCompute(page);
  await expect(
    page.getByRole("img", { name: beforeName }).locator("g[data-event-id]")
  ).toHaveCount(173);
  await page.waitForLoadState("networkidle");
}

async function coordinates(page: Page, name: string) {
  return page
    .getByRole("img", { name })
    .locator("g[data-event-id]")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        id: node.getAttribute("data-event-id"),
        points: [...node.querySelectorAll("circle")].map((point) => [
          point.getAttribute("cx"),
          point.getAttribute("cy")
        ]),
        hull: node.querySelector("path")?.getAttribute("d"),
        line: [...node.querySelectorAll("line")].map((line) =>
          ["x1", "x2", "y1", "y2"].map((key) => line.getAttribute(key))
        )
      }))
    );
}

test("research controls recompute locally, retain algorithm-specific values, and share one camera", async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      ["fetch", "xhr"].includes(request.resourceType()) ||
      !["GET", "HEAD"].includes(request.method())
    )
      requests.push(`${request.method()} ${request.url()}`);
  });
  const initial = await readPreset(page);
  expect(await coordinates(page, beforeName)).toEqual(
    await coordinates(page, afterName)
  );

  await page.getByTestId("lab-zoom-x-in").click();
  const xZoom = await readPreset(page);
  expect(xZoom.camera.spanX).toBeCloseTo(initial.camera.spanX * 0.7);
  expect(xZoom.camera.spanY).toBe(initial.camera.spanY);
  expect(await coordinates(page, beforeName)).toEqual(
    await coordinates(page, afterName)
  );
  await page.getByTestId("lab-zoom-y-in").click();
  const xyZoom = await readPreset(page);
  expect(xyZoom.camera.spanX).toBe(xZoom.camera.spanX);
  expect(xyZoom.camera.spanY).toBeCloseTo(initial.camera.spanY * 0.7);
  await page.getByTestId("lab-zoom-x-out").click();
  await page.getByTestId("lab-zoom-y-out").click();
  const restoredCamera = (await readPreset(page)).camera;
  expect(restoredCamera.spanX).toBeCloseTo(initial.camera.spanX);
  expect(restoredCamera.spanY).toBeCloseTo(initial.camera.spanY);

  const wheel = async () => {
    const scene = page.getByRole("img", { name: beforeName });
    await scene.scrollIntoViewIfNeeded();
    // Mobile WebKit does not expose hardware wheel input; exercise the policy
    // handler while real tap/button input above verifies the mobile controls.
    await scene.dispatchEvent("wheel", { deltaY: 100 });
  };
  await wheel();
  const outward = (await readPreset(page)).camera;
  expect(outward.spanX).toBeGreaterThan(restoredCamera.spanX);
  expect(outward.spanY).toBeGreaterThan(restoredCamera.spanY);
  await page.getByTestId("lab-zoom-reverse").check();
  await wheel();
  const reversed = (await readPreset(page)).camera;
  expect(reversed.spanX).toBeCloseTo(restoredCamera.spanX);
  expect(reversed.spanY).toBeCloseTo(restoredCamera.spanY);
  await page.getByTestId("lab-sweep-both").click();
  await expect(page.getByTestId("lab-sweep-stop")).toBeVisible();
  await expect(page.getByTestId("lab-sweep-stop")).toHaveCount(0, {
    timeout: 10_000
  });
  const sweepCamera = (await readPreset(page)).camera;
  expect(sweepCamera).toEqual(reversed);

  await page.getByTestId("lab-layout-parameter-iterations").fill("12");
  await waitForCompute(page);
  await page.getByTestId("lab-algorithm").selectOption("deterministic-slots");
  await expect(page.getByTestId("lab-layout-parameter-iterations")).toHaveCount(
    0
  );
  await page.getByTestId("lab-layout-parameter-slotSpacing").fill("170");
  await expect(page.getByTestId("lab-algorithm")).toHaveValue(
    "deterministic-slots"
  );
  await waitForCompute(page);
  const candidate = await coordinates(page, afterName);
  expect(candidate).not.toEqual(await coordinates(page, beforeName));

  await openSection(page, "collections");
  await page.getByTestId("lab-collection-lab-primary").uncheck();
  expect(await coordinates(page, afterName)).toEqual(candidate);
  await openSection(page, "representation");
  await page.getByTestId("lab-representation-showLabels").uncheck();
  await page.getByTestId("lab-representation-compactThresholdPx").fill("64");
  expect(await coordinates(page, afterName)).toEqual(candidate);
  const tuned = await readPreset(page);
  expect(tuned.snapshot).toEqual(initial.snapshot);
  expect(tuned.camera).toEqual(sweepCamera);
  expect(tuned.activeCollectionIds).not.toContain("lab-primary");

  await page.getByTestId("lab-algorithm").selectOption("legacy-force");
  await expect(page.getByTestId("lab-layout-parameter-iterations")).toHaveValue(
    "12"
  );
  await page.getByTestId("lab-algorithm").selectOption("deterministic-slots");
  await expect(
    page.getByTestId("lab-layout-parameter-slotSpacing")
  ).toHaveValue("170");
  await waitForCompute(page);
  await page.getByTestId("lab-use-b-as-a").click();
  expect(await coordinates(page, beforeName)).toEqual(
    await coordinates(page, afterName)
  );
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  await page.getByRole("img", { name: beforeName }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("layout-lab-mobile-comparison.png")
  });
});

test("local save and JSON export/import restore immutable input, camera, visibility and hysteresis", async ({
  page
}, info) => {
  await ready(page);
  await page.getByTestId("lab-zoom-both-in").click();
  await openSection(page, "representation");
  await page.getByTestId("lab-representation-compactHysteresisPx").fill("35");
  await page.getByTestId("lab-representation-showRelations").uncheck();
  await openSection(page, "collections");
  await page.getByTestId("lab-collection-lab-overlap").uncheck();
  const saved = await readPreset(page);
  const savedGeometry = await coordinates(page, afterName);
  expect(Object.keys(saved.history.after).length).toBeGreaterThan(0);
  await page.getByTestId("lab-preset-save").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("lab-preset-export").click();
  const download = await downloadPromise;
  const exportPath = info.outputPath("layout-lab-export.json");
  await download.saveAs(exportPath);
  expect(JSON.parse(await readFile(exportPath, "utf8"))).toEqual(saved);

  await page.getByTestId("lab-reset-b-defaults").click();
  await page.getByTestId("lab-fit-all").click();
  await page.getByTestId("lab-collections-none").click();
  await page.getByTestId("lab-preset-load").click();
  await expect(page.locator(".lab-status")).toContainText(
    "저장한 실험을 다시 열었습니다."
  );
  expect(await readPreset(page)).toEqual(saved);
  expect(await coordinates(page, afterName)).toEqual(savedGeometry);

  // Import remains self-contained after a page reload without local storage.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setViewportSize({ width: 414, height: 896 });
  await waitForCompute(page);
  await openSection(page, "preset");
  await page.getByTestId("lab-preset-import").setInputFiles(exportPath);
  await expect(page.locator(".lab-status")).toContainText(
    "저장한 실험을 다시 열었습니다."
  );
  expect(await readPreset(page)).toEqual(saved);
  expect(await coordinates(page, afterName)).toEqual(savedGeometry);
});

test("mobile tap selects a visible Event and controls stay within the viewport", async ({
  page
}, info) => {
  await ready(page);
  await openSection(page, "events");
  await page.getByTestId("lab-focus-event").selectOption("sparse");
  const focused = await readPreset(page);
  await page.getByTestId("lab-preset-restore").click();
  await expect(page.locator(".lab-status")).toContainText(
    "저장한 실험을 다시 열었습니다."
  );
  await expect(page.getByTestId("lab-focus-event")).toHaveValue("");
  await page
    .getByRole("img", { name: afterName })
    .locator('g[data-event-id="sparse"] circle')
    .last()
    .tap();
  await expect(page.getByTestId("lab-focus-event")).toHaveValue("sparse");
  expect((await readPreset(page)).camera).toEqual(focused.camera);

  for (const name of ["representation", "collections", "events"])
    await openSection(page, name);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page
    .getByRole("heading", { name: "사건 표현·배치 실험실" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("layout-lab-mobile-overview.png")
  });
});

test("mobile pinned comparison stays visible while tuning and preserves its viewport across A/B", async ({
  page
}, info) => {
  await ready(page);
  const initial = await readPreset(page);
  await page.getByTestId("lab-pin-preview").check();
  await expect(page.getByRole("img", { name: afterName })).toBeVisible();
  await expect(page.getByRole("img", { name: beforeName })).toBeHidden();
  await page.getByTestId("lab-layout-parameter-iterations").fill("10");
  await waitForCompute(page);
  await page
    .getByTestId("lab-layout-parameter-iterations")
    .scrollIntoViewIfNeeded();
  const box = (await page.getByRole("img", { name: afterName }).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThan(page.viewportSize()!.height);
  await page.getByRole("button", { name: "기준 A 보기", exact: true }).click();
  await expect(page.getByRole("img", { name: beforeName })).toBeVisible();
  await expect(page.getByRole("img", { name: afterName })).toBeHidden();
  await page.getByRole("button", { name: "바꾼 B 보기", exact: true }).click();
  const tuned = await readPreset(page);
  expect(tuned.parameters.iterations).toBe(10);
  expect(tuned.viewport).toEqual(initial.viewport);
  expect(tuned.camera).toEqual(initial.camera);
  expect(tuned.snapshot).toEqual(initial.snapshot);
  await page
    .getByTestId("lab-layout-parameter-iterations")
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("layout-lab-mobile-pinned-controls.png")
  });
});

test("mobile map owns touch movement while controls retain ordinary page gestures", async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const before = await readPreset(page);
  const map = page.getByRole("img", { name: beforeName });
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  const initialScroll = await page.evaluate(() => scrollY);
  const initialGeometry = await coordinates(page, beforeName);
  const cancellation = await map.evaluate((svg) => {
    const inside = new Event("touchmove", { bubbles: true, cancelable: true });
    const outside = new Event("touchmove", { bubbles: true, cancelable: true });
    svg.dispatchEvent(inside);
    document
      .querySelector('[data-testid="lab-section-camera"]')!
      .dispatchEvent(outside);
    return {
      inside: inside.defaultPrevented,
      outside: outside.defaultPrevented,
      touchAction: getComputedStyle(svg.parentElement!).touchAction
    };
  });
  expect(cancellation).toEqual({
    inside: true,
    outside: false,
    touchAction: "none"
  });

  // WebKit exposes native touch tap, but no native touch-drag automation API.
  // Keep its genuine pointer capture/start/end and insert one move after React
  // has handled pointerdown. This tests integration, not physical iPhone swipe.
  await page.evaluate(() => {
    document.addEventListener("pointerdown", function move(event) {
      if (event.pointerType !== "touch") return;
      document.removeEventListener("pointerdown", move);
      (event.target as Element).dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          pointerId: event.pointerId,
          pointerType: "touch",
          clientX: event.clientX + 35,
          clientY: event.clientY + 55,
          buttons: 1,
          isPrimary: event.isPrimary
        })
      );
    });
  });
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect
    .poll(() => coordinates(page, beforeName))
    .not.toEqual(initialGeometry);
  expect(await page.evaluate(() => scrollY)).toBe(initialScroll);
  expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
  expect(await coordinates(page, beforeName)).toEqual(
    await coordinates(page, afterName)
  );
  const after = await readPreset(page);
  expect(after.camera.x).toBeLessThan(before.camera.x);
  expect(after.camera.y).toBeLessThan(before.camera.y);
  expect(after.camera.spanX).toBe(before.camera.spanX);
  expect(after.camera.spanY).toBe(before.camera.spanY);
  expect(after.snapshot).toEqual(before.snapshot);
  expect(errors).toEqual([]);
  await info.attach("touch-evidence.json", {
    body: JSON.stringify({
      nativeTouchStartEnd: true,
      syntheticPointerMove: true,
      cancellation,
      pageScrollDelta: 0
    }),
    contentType: "application/json"
  });
});

test.describe("desktop WebKit wheel boundary", () => {
  // Playwright's mobile WebKit explicitly rejects hardware wheel automation.
  // Use desktop input here so this regression includes the browser's real
  // default scrolling action, which a synthetic WheelEvent cannot reproduce.
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: { width: 1024, height: 900 }
  });

  test("native wheel zooms only the map and the surrounding page still scrolls", async ({
    page
  }, info) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await ready(page);
    const map = page.getByRole("img", { name: beforeName });
    await map.scrollIntoViewIfNeeded();
    const box = (await map.boundingBox())!;
    const before = {
      scrollY: await page.evaluate(() => scrollY),
      zoomX: await page.getByTestId("lab-zoom-x").inputValue()
    };
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 240);
    await expect(page.getByTestId("lab-zoom-x")).not.toHaveValue(before.zoomX);
    // Observe several frames after the native wheel. An immediate equality
    // could pass before the browser's asynchronous default scroll occurs.
    const scrollSamples = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const start = performance.now(),
            values: number[] = [];
          const sample = () => {
            values.push(scrollY);
            if (performance.now() - start < 250) requestAnimationFrame(sample);
            else resolve(values);
          };
          requestAnimationFrame(sample);
        })
    );
    expect(scrollSamples.every((value) => value === before.scrollY)).toBe(true);
    expect(await coordinates(page, beforeName)).toEqual(
      await coordinates(page, afterName)
    );
    const outwardZoom = await page.getByTestId("lab-zoom-x").inputValue();
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Control");
    await expect(page.getByTestId("lab-zoom-x")).not.toHaveValue(outwardZoom);
    expect(await page.evaluate(() => scrollY)).toBe(before.scrollY);
    expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);

    const zoomOutside = await page.getByTestId("lab-zoom-x").inputValue();
    await page.mouse.move(5, box.y + box.height / 2);
    await page.mouse.wheel(0, 240);
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeGreaterThan(before.scrollY);
    await expect(page.getByTestId("lab-zoom-x")).toHaveValue(zoomOutside);
    expect(consoleErrors).toEqual([]);
    await info.attach("wheel-evidence.json", {
      body: JSON.stringify({
        nativeWheel: true,
        before,
        mapScrollSamples: scrollSamples,
        outsideScrollY: await page.evaluate(() => scrollY)
      }),
      contentType: "application/json"
    });
    await page.screenshot({
      path: info.outputPath("layout-lab-desktop-wheel-isolation.png")
    });
  });
});
