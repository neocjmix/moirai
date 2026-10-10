import { expect, test, type Page } from "@playwright/test";
test.afterEach(async ({ page }) => {
  // Async scene reads can outlive the camera settle assertion. Drain mock routes
  // before disposing the page/request context, preserving any handler errors.
  await page.unrouteAll({ behavior: "wait" });
});

type Inspection = {
  view: { x: number; y: number; scaleX: number; scaleY: number };
  liveView: { x: number; y: number; scaleX: number; scaleY: number };
  work: { hullBuilds: number };
  workerJobs: { running: number; pending: number; failed: boolean };
};
const world = "019f3b00-0000-7000-8000-000000000a01";
const event = "019f3b00-0000-7000-8000-000000000a12";
const hull = "019f3b00-0000-7000-8000-000000000a11";
const compact = "camera-compact";
async function installScene(page: Page) {
  const representation = { compactHull: false };
  let origin:
    | {
        bbox: { minX: number; maxX: number; minY: number; maxY: number };
        viewportWidth: number;
        viewportHeight: number;
      }
    | undefined;
  await page.route("**/graph/v5/shell", async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind !== "viewport") return route.continue();
    const response = await (await route.fetch()).json();
    origin ??= request.viewport;
    const viewport = origin!;
    const box = viewport.bbox;
    // As in the pigment fixture, the request includes four viewports of
    // support. Anchor the fixture once so camera changes move real geometry.
    const position = (x: number, y: number) => ({
      x:
        (box.minX + box.maxX) / 2 +
        ((x - viewport.viewportWidth / 2) * (box.maxX - box.minX)) /
          (viewport.viewportWidth * 4),
      y:
        (box.minY + box.maxY) / 2 +
        ((y - viewport.viewportHeight / 2) * (box.maxY - box.minY)) /
          (viewport.viewportHeight * 4)
    });
    const base = {
      canonId: world,
      validationState: "ok",
      diagnostics: [],
      viewportClass: "visible",
      contains: [],
      renderDensity: { pointScale: 1, opacity: 1, labelOpacity: 1 }
    };
    const region = (
      id: string,
      label: string,
      first: { x: number; y: number },
      last: { x: number; y: number }
    ) => ({
      ...base,
      id,
      eventId: id,
      label,
      geometryKind: "region",
      childrenComplete: true,
      worldBounds: {
        minX: first.x,
        maxX: last.x,
        minY: first.y,
        maxY: last.y
      },
      preparedWorldHull: [
        first,
        { x: last.x, y: first.y },
        last,
        { x: first.x, y: last.y }
      ]
    });
    await route.fulfill({
      json: {
        ...response,
        entities: [
          {
            ...base,
            id: event,
            eventId: event,
            label: "Camera Event",
            geometryKind: "point",
            position: position(270, 470)
          }
        ],
        regions: [
          region(
            hull,
            "Camera Hull",
            representation.compactHull ? position(155, 328) : position(80, 245),
            representation.compactHull ? position(165, 338) : position(240, 420)
          ),
          region(
            compact,
            "Camera Composite",
            position(125, 500),
            position(135, 510)
          )
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
  return representation;
}

async function openScene(page: Page) {
  await installScene(page);
  await page.goto(`/graph/v5?world=${world}&tileData=0`);
  await expect(page.getByTestId("geographic-webgl")).toBeVisible();
  await expect(page.locator(`path[data-region-id="${hull}"]`)).toBeVisible();
  await expect(
    page.locator(`[data-composite-point-id="${compact}"]`)
  ).toBeVisible();
  await expect(page.locator(`[data-event-point-id="${event}"]`)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  return;
}

async function inspect(page: Page) {
  return page.evaluate(() => {
    let value: Inspection | undefined;
    addEventListener(
      "moirai:graph-inspection",
      (e: Event) => (value = (e as CustomEvent<Inspection>).detail),
      { once: true }
    );
    dispatchEvent(new Event("moirai:inspect-graph"));
    if (!value) throw Error("graph_inspection_unavailable");
    return value;
  });
}
test("camera moves the stable scene immediately; bounded pan does not rebuild it; settle converges", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openScene(page);
  const canvas = page.getByTestId("geographic-webgl");
  await expect(canvas).toBeVisible();
  const before = await inspect(page);
  const sample = await page
    .getByTestId("graph-stage")
    .evaluate(async (stage) => {
      const capture = stage.setPointerCapture;
      stage.setPointerCapture = () => {};
      const send = (type: string, x: number) =>
        stage.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: 7901,
            pointerType: "touch",
            clientX: x,
            clientY: 490,
            buttons: 1
          })
        );
      send("pointerdown", 60);
      await new Promise(requestAnimationFrame);
      const labels = [...document.querySelectorAll("svg text")].map((node) =>
        node.getBoundingClientRect()
      );
      send("pointermove", 88);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      let data: Inspection | undefined;
      addEventListener(
        "moirai:graph-inspection",
        (e: Event) => (data = (e as CustomEvent<Inspection>).detail),
        { once: true }
      );
      dispatchEvent(new Event("moirai:inspect-graph"));
      if (!data) throw Error("graph_inspection_unavailable");
      const moved = [...document.querySelectorAll("svg text")].map((node) =>
        node.getBoundingClientRect()
      );
      const disabled = document.querySelector("svg > g")?.getAttribute("style");
      send("pointercancel", 88);
      stage.setPointerCapture = capture;
      return {
        data,
        labels: labels.map((b) => ({ width: b.width, height: b.height })),
        moved: moved.map((b) => ({ width: b.width, height: b.height })),
        disabled
      };
    });
  expect(sample.data.liveView.x - before.liveView.x).toBeCloseTo(28);
  expect(sample.data.view).toEqual(before.view);
  expect(sample.data.work.hullBuilds).toBe(before.work.hullBuilds);
  expect(sample.disabled).toContain("pointer-events: none");
  expect(sample.labels.length).toBeGreaterThan(0);
  for (let i = 0; i < sample.labels.length; i++) {
    expect(sample.moved[i]!.width).toBeCloseTo(sample.labels[i]!.width, 1);
    expect(sample.moved[i]!.height).toBeCloseTo(sample.labels[i]!.height, 1);
  }
  await expect
    .poll(async () => {
      const d = await inspect(page);
      return d.view.x - d.liveView.x;
    })
    .toBe(0);
  await expect
    .poll(async () => (await inspect(page)).workerJobs)
    .toEqual({ running: 0, pending: 0, failed: false });
  await expect(page.locator("svg > g")).not.toHaveCSS("pointer-events", "none");
  expect(errors).toEqual([]);
});

test("independent-axis pinch preserves native text metrics while geometry follows live camera", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openScene(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const sample = await page
    .getByTestId("graph-stage")
    .evaluate(async (stage) => {
      const capture = stage.setPointerCapture;
      stage.setPointerCapture = () => {};
      const send = (type: string, id: number, x: number, y: number) =>
        stage.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: id,
            pointerType: "touch",
            clientX: x,
            clientY: y,
            buttons: 1
          })
        );
      send("pointerdown", 7911, 110, 350);
      send("pointerdown", 7912, 250, 510);
      await new Promise(requestAnimationFrame);
      const text = document.querySelector<SVGGraphicsElement>(
        "[data-event-paint-id] text"
      )!;
      const before = text.getBoundingClientRect();
      const circle = document.querySelector<SVGGraphicsElement>(
        "[data-event-paint-id] circle"
      )!;
      const pointBefore = circle.getBoundingClientRect();
      send("pointermove", 7911, 100, 348);
      send("pointermove", 7912, 260, 512);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const after = text.getBoundingClientRect();
      const pointAfter = circle.getBoundingClientRect();
      let data: Inspection | undefined;
      addEventListener(
        "moirai:graph-inspection",
        (e: Event) => (data = (e as CustomEvent<Inspection>).detail),
        { once: true }
      );
      dispatchEvent(new Event("moirai:inspect-graph"));
      send("pointercancel", 7911, 100, 348);
      send("pointercancel", 7912, 260, 512);
      stage.setPointerCapture = capture;
      if (!data) throw Error("graph_inspection_unavailable");
      return {
        before: { width: before.width, height: before.height },
        after: { width: after.width, height: after.height },
        pointBefore: { width: pointBefore.width, height: pointBefore.height },
        pointAfter: { width: pointAfter.width, height: pointAfter.height },
        data
      };
    });
  expect(sample.data.liveView.scaleX).not.toBe(sample.data.liveView.scaleY);
  expect(sample.after.width).toBeCloseTo(sample.before.width, 1);
  expect(sample.after.height).toBeCloseTo(sample.before.height, 1);
  expect(sample.pointAfter.width).toBeCloseTo(sample.pointBefore.width, 1);
  expect(sample.pointAfter.height).toBeCloseTo(sample.pointBefore.height, 1);
  await expect
    .poll(async () => {
      const d = await inspect(page);
      return d.view.scaleX - d.liveView.scaleX;
    })
    .toBe(0);
  expect(errors).toEqual([]);
});
