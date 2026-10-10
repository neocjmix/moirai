import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { computeLayout } from "@moirai/graph-presentation/layout-engine";
import type { LabPreset } from "../../apps/atropos-web/src/labs/layout/preset";
import { layoutGeometry } from "../../apps/atropos-web/src/labs/layout/geometry";

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
    page
      .getByRole("img", { name: beforeName, includeHidden: true })
      .locator("g[data-event-id]")
  ).toHaveCount(173);
  await page.waitForLoadState("networkidle");
}

test("stage opacity and small-point text controls preserve the pinned input, camera and A/B baseline", async ({
  page
}, info) => {
  await ready(page);
  const setup = await readPreset(page);
  const shape = computeLayout(setup.snapshot.input, setup).shapes.find(
    (s) => s.event_id === "sparse"
  )!;
  if (shape.kind !== "point") throw Error("Expected reference point");
  setup.camera = {
    x: shape.position.x + 50,
    y: shape.position.y + 15,
    spanX: 300,
    spanY: 180
  };
  setup.representation.childRevealHeightPx = 0;
  await page.getByTestId("lab-preset-json").fill(JSON.stringify(setup));
  await page.getByTestId("lab-preset-restore").click();
  await expect(page.locator(".lab-status")).toContainText(
    "저장한 실험을 다시 열었습니다."
  );
  const original = await readPreset(page);
  const geometry = await coordinates(page, afterName);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      ["fetch", "xhr"].includes(request.resourceType()) ||
      request.method() !== "GET"
    )
      requests.push(request.url());
  });
  await openSection(page, "representation");
  const map = page.getByRole("img", { name: afterName });
  const point = map.locator('g[data-event-id="sparse"] circle').first();
  const label = map.locator('text[data-event-id="sparse"]');
  await page
    .getByTestId("lab-representation-ordinaryPointOpacityScale")
    .fill("0.6");
  await page.getByTestId("lab-representation-ordinaryLabelOpacity").fill("0.8");
  await expect(point).toHaveAttribute("opacity", "0.6");
  await expect(label).toHaveAttribute("opacity", "0.48");
  await page.getByTestId("lab-representation-normalPointCount").fill("0");
  await page.getByTestId("lab-representation-normalHysteresisCount").fill("0");
  await page
    .getByTestId("lab-representation-smallPointOpacityScale")
    .fill("0.7");
  await page.getByTestId("lab-representation-smallLabelOpacity").fill("0.9");
  await expect(map.locator('g[data-event-id="sparse"]')).toHaveAttribute(
    "data-representation",
    "small-point"
  );
  await expect(point).toHaveAttribute("opacity", "0.7");
  await expect(label).toHaveAttribute("opacity", "0.63");
  const tuned = await readPreset(page);
  expect(tuned.camera).toEqual(original.camera);
  expect(tuned.snapshot).toEqual(original.snapshot);
  expect(tuned.before).toEqual(original.before);
  expect(await coordinates(page, afterName)).toEqual(geometry);
  await page.getByTestId("lab-preset-save").click();
  await openSection(page, "comparison");
  await page.getByTestId("lab-reset-b-defaults").click();
  await page.getByTestId("lab-preset-load").click();
  expect((await readPreset(page)).representation).toEqual(tuned.representation);
  await expect(label).toHaveAttribute("opacity", "0.63");
  expect(requests).toEqual([]);
  await openSection(page, "representation");
  await page
    .getByTestId("lab-representation-smallLabelOpacity")
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("lab-small-point-label-controls.png")
  });
});

test("complete labels reach the map edge and Composite color survives the borderless and point stages", async ({
  page
}, info) => {
  await ready(page);
  const setup = await readPreset(page);
  const output = computeLayout(setup.snapshot.input, setup);
  const geometry = layoutGeometry(setup.snapshot, output).find(
    (item) => item.id === "inner-process"
  )!;
  const xs = geometry.polygon.map((point) => point.x);
  const ys = geometry.polygon.map((point) => point.y);
  const bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
  setup.representation.childRevealHeightPx = 0;
  // Keep the dense synthetic children from consuming this stage/color probe's
  // point budget; size transitions are exercised explicitly at the end.
  setup.representation.normalPointCount = 200;
  setup.representation.smallPointCount = 220;
  setup.representation.hiddenPointCount = 240;
  const showSpan = async (span: number) => {
    const spanX = ((bounds.maxX - bounds.minX) * setup.viewport.width) / span;
    setup.camera = {
      x:
        center.x -
        ((setup.viewport.width / 2 - 24) * spanX) / setup.viewport.width,
      y: center.y,
      spanX,
      spanY: ((bounds.maxY - bounds.minY) * setup.viewport.height) / span
    };
    setup.history.after = {};
    await page.getByTestId("lab-preset-json").fill(JSON.stringify(setup));
    await page.getByTestId("lab-preset-restore").click();
    await expect(page.locator(".lab-status")).toContainText(
      "저장한 실험을 다시 열었습니다."
    );
  };
  await showSpan(32);
  const map = page.getByRole("img", { name: afterName });
  const composite = map.locator('g[data-event-id="inner-process"]');
  const hull = composite.locator(":scope > g");
  const outline = hull.locator("path[stroke]");
  const coats = hull.locator('path[fill]:not([fill="none"])');
  const point = composite.locator("circle").first();
  const pointHit = composite.locator("circle").last();
  const label = map.locator('text[data-event-id="inner-process"]');
  await expect(composite).toHaveAttribute(
    "data-representation",
    "borderless-hull"
  );
  await expect(hull).toHaveAttribute("opacity", "1");
  await expect(outline).toHaveAttribute("stroke-opacity", "0");
  await expect(outline).toHaveAttribute("stroke-width", "1.15");
  const coatCount = await coats.count();
  expect(coatCount).toBeGreaterThan(1);
  expect(coatCount).toBeLessThanOrEqual(4);
  // Feather coats preserve the full body's coverage while the outermost
  // contour carries less ink; check their aggregate, not any single layer.
  const bodyOpacity = () =>
    coats.evaluateAll(
      (nodes) =>
        1 -
        nodes.reduce(
          (uncovered, node) =>
            uncovered * (1 - Number(node.getAttribute("fill-opacity"))),
          1
        )
    );
  expect(await bodyOpacity()).toBeCloseTo(0.12 * 0.62);
  expect(Number(await coats.first().getAttribute("fill-opacity"))).toBeLessThan(
    await bodyOpacity()
  );
  await expect(hull).toHaveCSS("mix-blend-mode", "multiply");
  await expect(label).toHaveAttribute("opacity", "0.58");
  await expect(label).toHaveText("안쪽 묶음 · 이틀 동안의 사건");
  const textBounds = await label.evaluate((node) => {
    const box = (node as SVGGraphicsElement).getBBox();
    return { left: box.x, right: box.x + box.width };
  });
  expect(textBounds.left).toBeLessThan(setup.viewport.width);
  expect(textBounds.right).toBeGreaterThan(setup.viewport.width);
  await expect(map.locator('text[data-event-id="dense-process"]')).toHaveText(
    "밀집 묶음 · 촘촘한 사건 160개와 공유 사건"
  );
  const fill = await point.getAttribute("fill");
  const color = await composite.evaluate((node) => {
    const rgb = (element: Element) =>
      getComputedStyle(element)
        .fill.match(/[\d.]+/g)!
        .map(Number);
    const point = rgb(node.querySelector("circle")!);
    const coats = [
      ...node.querySelectorAll('path[fill]:not([fill="none"])')
    ].map(rgb);
    return { point, coats };
  });
  // Spectral material fitting may round a channel by one byte. The authored
  // Composite palette must still read as the same color at every coat/point.
  for (const coat of color.coats)
    coat.forEach((channel, index) =>
      expect(Math.abs(channel - color.point[index]!)).toBeLessThanOrEqual(1)
    );
  await map.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("lab-borderless-edge-label.png")
  });
  await showSpan(52);
  await expect(outline).toHaveAttribute("stroke-opacity", "0.15");
  await expect(coats).toHaveCount(1);
  expect(await bodyOpacity()).toBeCloseTo(0.12);
  await showSpan(12);
  await expect(composite).toHaveAttribute(
    "data-representation",
    "ordinary-point"
  );
  await expect(point).toHaveAttribute("opacity", "1");
  await expect(point).toHaveAttribute("fill", fill!);
  await expect(pointHit).toHaveAttribute("pointer-events", "all");
  setup.representation.normalPointCount = 0;
  setup.representation.normalHysteresisCount = 0;
  await showSpan(12);
  await expect(composite).toHaveAttribute(
    "data-representation",
    "ordinary-point"
  );
  await expect(point).toHaveAttribute("opacity", "1");
  await showSpan(6);
  await expect(composite).toHaveAttribute("data-representation", "small-point");
  await expect(point).toHaveAttribute("fill", fill!);
  expect(Number(await point.getAttribute("r"))).toBeCloseTo(2.1);
  await showSpan(2);
  expect(Number(await point.getAttribute("opacity"))).toBeCloseTo(0.5);
  await showSpan(1);
  await expect(composite).toHaveAttribute("data-representation", "hidden");
  await expect(composite).toHaveAttribute("pointer-events", "none");
  await showSpan(24);
  await expect(composite).toHaveAttribute(
    "data-representation",
    "borderless-hull"
  );
  await expect(hull).toHaveAttribute("opacity", "1");
});

async function coordinates(page: Page, name: string) {
  return page
    .getByRole("img", { name, includeHidden: true })
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

async function camera(page: Page) {
  return JSON.parse(
    (await page.getByTestId("lab-comparison").getAttribute("data-camera"))!
  ) as LabPreset["camera"];
}

async function pinch(page: Page, axis: "x" | "y" | "both", delta: number) {
  const map = page.getByRole("img", { name: afterName });
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  const first = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.3 };
  const second = {
    x: axis === "y" ? first.x : box.x + box.width * 0.62,
    y: axis === "x" ? first.y : box.y + box.height * 0.65
  };
  // WebKit exposes one native touch. Like Atropos's existing pinch regression,
  // hold a native mouse contact and move the native touch's real pointer ID.
  // Capture/handlers remain real; this is integration, not a physical iPhone.
  await page.evaluate(
    ({ axis, delta }) => {
      const move = (event: PointerEvent) => {
        if (event.pointerType !== "touch") return;
        document.removeEventListener("pointerdown", move);
        for (let i = 1; i <= 5; i++)
          (event.target as Element).dispatchEvent(
            new PointerEvent("pointermove", {
              bubbles: true,
              cancelable: true,
              pointerId: event.pointerId,
              pointerType: "touch",
              buttons: 1,
              clientX: event.clientX + (axis === "y" ? 0 : (delta * i) / 5),
              clientY: event.clientY + (axis === "x" ? 0 : (delta * i) / 5),
              isPrimary: event.isPrimary
            })
          );
      };
      document.addEventListener("pointerdown", move);
    },
    { axis, delta }
  );
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.touchscreen.tap(second.x, second.y);
  await page.mouse.up();
  await page.evaluate(() => new Promise(requestAnimationFrame));
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

  await pinch(page, "x", 40);
  const xZoom = await camera(page);
  expect(xZoom.spanX).toBeLessThan(initial.camera.spanX);
  expect(xZoom.spanY).toBeCloseTo(initial.camera.spanY);
  expect(await coordinates(page, beforeName)).toEqual(
    await coordinates(page, afterName)
  );
  await pinch(page, "y", 40);
  const xyZoom = await camera(page);
  expect(xyZoom.spanX).toBeCloseTo(xZoom.spanX);
  expect(xyZoom.spanY).toBeLessThan(xZoom.spanY);
  await pinch(page, "both", -25);
  const sweepCamera = await camera(page);
  expect(sweepCamera.spanX).toBeGreaterThan(xyZoom.spanX);
  expect(sweepCamera.spanY).toBeGreaterThan(xyZoom.spanY);
  await expect(page.getByTestId("lab-focus-event")).toHaveValue("");
  await expect(
    page.locator(
      '[data-testid^="lab-zoom-"], [data-testid^="lab-sweep-"], [data-testid="lab-fit-all"]'
    )
  ).toHaveCount(0);
  await openSection(page, "layout");
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
  await openSection(page, "comparison");
  await page.getByTestId("lab-use-b-as-a").click();
  expect(await coordinates(page, beforeName)).toEqual(
    await coordinates(page, afterName)
  );
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  await page.getByRole("img", { name: afterName }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("layout-lab-mobile-comparison.png")
  });
});

test("local save and JSON export/import restore immutable input, camera, visibility and hysteresis", async ({
  page
}, info) => {
  await ready(page);
  await pinch(page, "both", 40);
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

  await openSection(page, "comparison");
  await page.getByTestId("lab-reset-b-defaults").click();
  await pinch(page, "both", -25);
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
  const setup = await readPreset(page);
  const shape = computeLayout(setup.snapshot.input, setup).shapes.find(
    (shape) => shape.event_id === "sparse"
  )!;
  if (shape.kind !== "point") throw Error("Expected sparse fixture point");
  setup.camera = { ...shape.position, spanX: 200, spanY: 180 };
  await page.getByTestId("lab-preset-json").fill(JSON.stringify(setup));
  await page.getByTestId("lab-preset-restore").click();
  await expect(page.locator(".lab-status")).toContainText(
    "저장한 실험을 다시 열었습니다."
  );
  await openSection(page, "events");
  await page.getByTestId("lab-focus-event").selectOption("sparse");
  expect(await camera(page)).toEqual(setup.camera);
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
  await openSection(page, "layout");
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
  await page.getByTestId("lab-show-a").click();
  await expect(page.getByRole("img", { name: beforeName })).toBeVisible();
  await expect(page.getByRole("img", { name: afterName })).toBeHidden();
  await page.getByTestId("lab-show-b").click();
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
  const map = page.getByRole("img", { name: afterName });
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  const initialScroll = await page.evaluate(() => scrollY);
  const initialGeometry = await coordinates(page, afterName);
  const cancellation = await map.evaluate((svg) => {
    const inside = new Event("touchmove", { bubbles: true, cancelable: true });
    const outside = new Event("touchmove", { bubbles: true, cancelable: true });
    svg.dispatchEvent(inside);
    document
      .querySelector('[data-testid="lab-section-layout"]')!
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
    .poll(() => coordinates(page, afterName))
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

  test("mobile map ignores wheel zoom while keeping page scrolling outside", async ({
    page
  }, info) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await ready(page);
    const map = page.getByRole("img", { name: afterName });
    await map.scrollIntoViewIfNeeded();
    const box = (await map.boundingBox())!;
    const before = {
      scrollY: await page.evaluate(() => scrollY),
      camera: await camera(page)
    };
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 240);
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
    expect(await camera(page)).toEqual(before.camera);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Control");
    expect(await camera(page)).toEqual(before.camera);
    expect(await page.evaluate(() => scrollY)).toBe(before.scrollY);
    expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);

    await page.mouse.move(5, box.y + box.height / 2);
    await page.mouse.wheel(0, 240);
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeGreaterThan(before.scrollY);
    expect(await camera(page)).toEqual(before.camera);
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

test("promoted incidence candidate exposes every control and replays complete membership", async ({
  page
}) => {
  await ready(page);
  const before = await readPreset(page);
  await openSection(page, "layout");
  await page.getByTestId("lab-algorithm").selectOption("global-incidence");
  await waitForCompute(page);
  const selected = await readPreset(page);
  expect(selected.algorithm).toBe("global-incidence");
  expect(selected.snapshot.input.incidence?.formatVersion).toBe(
    "collection-incidence/1"
  );
  expect(selected.snapshot).toEqual(before.snapshot);
  expect(selected.camera).toEqual(before.camera);
  await expect(page.getByTestId("lab-layout-parameter-spacing")).toBeVisible();
  await page.getByTestId("lab-layout-parameter-spacing").fill("64");
  await waitForCompute(page);
  const tuned = await readPreset(page);
  expect(tuned.parameters.spacing).toBe(64);
  await expect(
    page
      .getByRole("img", { name: afterName, includeHidden: true })
      .locator("g[data-event-id]")
  ).toHaveCount(173);
  await page.getByTestId("lab-preset-json").fill(JSON.stringify(tuned));
  await page.getByTestId("lab-preset-restore").click();
  await waitForCompute(page);
  expect((await readPreset(page)).parameters).toEqual(tuned.parameters);
});
