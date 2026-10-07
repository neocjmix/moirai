import { expect, test, type Page } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";
const event = "019f3b00-0000-7000-8000-000000000a12";
const hull = "019f3b00-0000-7000-8000-000000000a11";
const compact = "renderer-compact";
type Backend = "custom-webgl2" | "pixi" | "three";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

const canvasId = (backend: Backend) =>
  backend === "custom-webgl2" ? "geographic-webgl" : `geographic-${backend}`;

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
            label: "Renderer Event",
            geometryKind: "point",
            position: position(270, 470)
          }
        ],
        regions: [
          region(
            hull,
            "Renderer Hull",
            representation.compactHull ? position(155, 328) : position(80, 245),
            representation.compactHull ? position(165, 338) : position(240, 420)
          ),
          region(
            compact,
            "Renderer Composite",
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

async function openScene(page: Page, backend: Backend) {
  const representation = await installScene(page);
  await page.goto(`/graph/v5?world=${world}&tileData=0&gsRenderer=${backend}`);
  await expect(page.getByTestId(canvasId(backend))).toBeVisible();
  await expect(page.locator(`path[data-region-id="${hull}"]`)).toBeVisible();
  await expect(
    page.locator(`[data-composite-point-id="${compact}"]`)
  ).toBeVisible();
  await expect(page.locator(`[data-event-point-id="${event}"]`)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  return representation;
}

async function camera(page: Page) {
  return page.evaluate(() => {
    let state: { view: Record<string, number> } | undefined;
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

async function moveCamera(page: Page) {
  await page.getByTestId("graph-stage").evaluate(async (stage) => {
    const capture = stage.setPointerCapture;
    stage.setPointerCapture = () => {};
    const send = (type: string, id: number, x: number, y: number) =>
      stage.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          pointerType: "touch",
          buttons: type === "pointercancel" ? 0 : 1,
          clientX: x,
          clientY: y
        })
      );
    try {
      send("pointerdown", 7201, 60, 490);
      send("pointermove", 7201, 72, 482);
      await new Promise(requestAnimationFrame);
      send("pointercancel", 7201, 72, 482);
      send("pointerdown", 7202, 110, 350);
      send("pointerdown", 7203, 250, 510);
      send("pointermove", 7202, 106, 346);
      send("pointermove", 7203, 254, 514);
      await new Promise(requestAnimationFrame);
      send("pointercancel", 7202, 106, 346);
      send("pointercancel", 7203, 254, 514);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    } finally {
      stage.setPointerCapture = capture;
    }
  });
}

async function expectPaintAligned(page: Page, backend: Backend) {
  const canvas = page.getByTestId(canvasId(backend));
  const centers = await canvas.evaluate(
    (node, selectors) => {
      const canvasBounds = node.getBoundingClientRect();
      return selectors.map((selector) => {
        const bounds = document
          .querySelector(selector)!
          .getBoundingClientRect();
        return {
          x: Math.round(bounds.x + bounds.width / 2 - canvasBounds.x),
          y: Math.round(bounds.y + bounds.height / 2 - canvasBounds.y)
        };
      });
    },
    [
      `path[data-region-id="${hull}"]`,
      `[data-event-paint-id="${event}"] circle`,
      `[data-composite-point-id="${compact}"] circle`
    ]
  );
  // Hide only the native overlay in the capture: painted pixels must come
  // from the selected GPU backend, at the exact SVG interaction coordinates.
  const screenshot = await canvas.screenshot({
    scale: "css",
    style: 'svg[aria-label="Projected chart surface"] { visibility: hidden; }'
  });
  await test.info().attach(`${backend}-paint`, {
    body: screenshot,
    contentType: "image/png"
  });
  const ink = await page.evaluate(
    async ({ source, centers }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const target = document.createElement("canvas");
      target.width = image.width;
      target.height = image.height;
      const context = target.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return centers.map(({ x, y }) => {
        const pixels = context.getImageData(x - 1, y - 1, 3, 3).data;
        let strongest = 0;
        for (let offset = 0; offset < pixels.length; offset += 4)
          strongest = Math.max(
            strongest,
            765 - pixels[offset]! - pixels[offset + 1]! - pixels[offset + 2]!
          );
        return strongest;
      });
    },
    {
      source: `data:image/png;base64,${screenshot.toString("base64")}`,
      centers
    }
  );
  await test.info().attach(`${backend}-paint-samples`, {
    body: JSON.stringify({ centers, ink }),
    contentType: "application/json"
  });
  expect(ink[0], "Hull paint under its native path").toBeGreaterThan(6);
  expect(ink[1], "Event point under its native hit target").toBeGreaterThan(80);
  expect(ink[2], "Composite point under its native hit target").toBeGreaterThan(
    40
  );
  return { centers, ink };
}

for (const backend of ["pixi", "three"] as const) {
  test(`${backend} paints Hulls and both point roles aligned through pan and pinch`, async ({
    page
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const representation = await openScene(page, backend);
    const canvas = page.getByTestId(canvasId(backend));
    const original = await canvas.elementHandle();
    const before = await expectPaintAligned(page, backend);
    const viewBefore = await camera(page);
    await moveCamera(page);
    expect(await camera(page)).not.toEqual(viewBefore);
    const after = await expectPaintAligned(page, backend);
    expect(after.centers).not.toEqual(before.centers);
    expect(
      await canvas.evaluate((node, first) => node === first, original)
    ).toBe(true);
    const viewport = page.viewportSize()!;
    representation.compactHull = true;
    await page.setViewportSize({ ...viewport, width: viewport.width + 1 });
    await expect(
      page.locator(`[data-composite-point-id="${hull}"]`)
    ).toBeVisible();
    await expect(canvas).toHaveAttribute("data-point-count", "3");
    representation.compactHull = false;
    await page.setViewportSize(viewport);
    await expect(page.locator(`path[data-region-id="${hull}"]`)).toBeVisible();
    await expect(canvas).toHaveAttribute("data-point-count", "2");
    expect(
      await canvas.evaluate((node, first) => node === first, original)
    ).toBe(true);
    await expectPaintAligned(page, backend);
    expect(errors).toEqual([]);
    await info.attach(`${backend}-alignment`, {
      body: JSON.stringify({ before, after }),
      contentType: "application/json"
    });
  });
}

test("renderer switching preserves World, camera and selection and saves the preference", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openScene(page, "custom-webgl2");
  const stage = await page.getByTestId("graph-stage").elementHandle();
  const view = await camera(page);
  const initialCanvas = await page
    .getByTestId("geographic-webgl")
    .elementHandle();
  // The existing Event drawer intentionally covers the bottom navigation.
  // Exercise Settings before selection, then test selected-event switching
  // through the in-graph controls that remain available above the drawer.
  await page
    .getByRole("button", { name: /설정|Settings/, exact: true })
    .click();
  await expect(page).toHaveURL(/\/graph\/settings/);
  await expect(
    page.getByTestId("renderer-select").filter({ visible: true })
  ).toHaveValue("custom-webgl2");
  expect(await stage!.evaluate((node) => node.isConnected)).toBe(true);
  await page
    .getByRole("button", { name: /공개 그래프|Public graph/, exact: true })
    .click();
  await expect(page.getByTestId("geographic-webgl")).toBeVisible();
  expect(await stage!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await initialCanvas!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await camera(page)).toEqual(view);
  expect(new URL(page.url()).searchParams.get("world")).toBe(world);
  await page.locator(`[data-event-point-id="${event}"]`).click();
  await expect(page.getByTestId("event-drawer-sheet")).toBeVisible();
  const selection = new URL(page.url()).searchParams.get("gsEvent");
  expect(selection).not.toBeNull();
  await page.getByTestId("renderer-controls-toggle").click();
  const select = page.getByTestId("renderer-select").filter({ visible: true });
  let oldCanvas = await page.getByTestId("geographic-webgl").elementHandle();
  for (const backend of ["pixi", "three", "custom-webgl2", "pixi"] as const) {
    await select.selectOption(backend);
    const canvas = page.getByTestId(canvasId(backend));
    await expect(canvas).toBeVisible();
    expect(await oldCanvas!.evaluate((node) => node.isConnected)).toBe(false);
    expect(await camera(page)).toEqual(view);
    expect(new URL(page.url()).searchParams.get("world")).toBe(world);
    expect(new URL(page.url()).searchParams.get("gsEvent")).toBe(selection);
    expect(await stage!.evaluate((node) => node.isConnected)).toBe(true);
    await expect(page.getByTestId("event-drawer-sheet")).toBeVisible();
    oldCanvas = await canvas.elementHandle();
  }
  await page.waitForLoadState("networkidle");
  // Remove the URL override to exercise the stored preference itself.
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.delete("gsRenderer");
    history.replaceState(history.state, "", url);
  });
  await page.reload();
  await expect(page.getByTestId("geographic-pixi")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("world")).toBe(world);
  expect(new URL(page.url()).searchParams.get("gsEvent")).toBe(selection);
  expect(errors).toEqual([]);
});

test("lost candidate context returns to the baseline and releases the failed canvas", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openScene(page, "pixi");
  const canvas = await page.getByTestId("geographic-pixi").elementHandle();
  const view = await camera(page);
  await canvas!.evaluate((node) =>
    node.dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
  );
  await expect(page.getByTestId("geographic-webgl")).toBeVisible();
  expect(await canvas!.evaluate((node) => node.isConnected)).toBe(false);
  expect(await camera(page)).toEqual(view);
  await expectPaintAligned(page, "custom-webgl2");
  expect(errors).toEqual([]);
});
