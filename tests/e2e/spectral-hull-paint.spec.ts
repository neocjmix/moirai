import { expect, test, type Page } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";

// Stable authored IDs select the existing yellow and blue palette entries;
// this exercises the renderer without substituting its colors or shader.
function paletteId(slot: number) {
  for (let index = 0; index < 1000; index++) {
    const id = `pigment-${index}`;
    let hash = 2166136261;
    for (const character of `${world}:${id}`) {
      hash ^= character.codePointAt(0)!;
      hash = Math.imul(hash, 16777619);
    }
    if ((hash >>> 0) % 12 === slot) return id;
  }
  throw Error("palette_fixture_unavailable");
}

const yellow = paletteId(1),
  blue = paletteId(6),
  feather = paletteId(3);

type Viewport = {
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  viewportWidth: number;
  viewportHeight: number;
};

async function installPaintScene(page: Page, mode = { points: false }) {
  let origin: Viewport | undefined;
  await page.route("**/graph/v5/shell", async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind !== "viewport") return route.continue();
    const response = await (await route.fetch()).json();
    origin ??= request.viewport as Viewport;
    const viewport = origin;
    const box = viewport.bbox;
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
    const region = (
      id: string,
      label: string,
      left: number,
      top: number,
      right: number,
      bottom: number
    ) => {
      const first = mode.points
          ? position((left + right) / 2, (top + bottom) / 2)
          : position(left, top),
        last = mode.points ? first : position(right, bottom);
      return {
        canonId: world,
        validationState: "ok",
        diagnostics: [],
        viewportClass: "visible",
        contains: [],
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
        preparedWorldHull: mode.points
          ? [first]
          : [first, { x: last.x, y: first.y }, last, { x: first.x, y: last.y }],
        renderDensity: { pointScale: 1, opacity: 1, labelOpacity: 1 }
      };
    };
    await route.fulfill({
      json: {
        ...response,
        entities: [],
        regions: [
          region(yellow, "노랑 안료", 70, 245, 205, 425),
          region(blue, "파랑 안료", 145, 245, 285, 425),
          region(feather, "부드러운 영역", 100, 465, 200, 491)
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
}

async function openPaintScene(page: Page, graphics: "webgl" | "svg") {
  await page.goto(`/graph/v5?world=${world}&tileData=0&gsGraphics=${graphics}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await expect(
    page.locator(`[data-composite-paint-id="${blue}"]`)
  ).toBeVisible();
  await page.waitForTimeout(350);
}

async function screenPixels(page: Page, points: readonly [number, number][]) {
  const buffer = await page.screenshot({ scale: "css" });
  return page.evaluate(
    async ({ source, points }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return points.map(([x, y]) =>
        Array.from(context.getImageData(x!, y!, 1, 1).data)
      );
    },
    { source: `data:image/png;base64,${buffer.toString("base64")}`, points }
  );
}

test("white graph paper and weaker borders give way to a filter-free feathered edge", async ({
  page
}, info) => {
  await installPaintScene(page);
  await openPaintScene(page, "svg");
  const solid = page.locator(`[data-composite-paint-id="${blue}"] > path`);
  const faded = page.locator(`[data-composite-paint-id="${feather}"]`);
  expect(
    await solid.evaluate((node) => Number(getComputedStyle(node).strokeOpacity))
  ).toBeCloseTo(0.15, 3);
  expect(
    await faded.evaluate((node) =>
      [...node.querySelectorAll("path")].some((path) =>
        /blur/.test(getComputedStyle(path).filter)
      )
    )
  ).toBe(false);
  const edge = await faded.locator(":scope > path").evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { x: Math.ceil(box.left), y: Math.floor(box.top + box.height / 2) };
  });
  const pixels = await screenPixels(page, [
    [325, 180],
    [edge.x - 2, edge.y],
    [edge.x, edge.y],
    [edge.x + 1, edge.y],
    [edge.x + 2, edge.y],
    [edge.x + 4, edge.y],
    [edge.x + 15, edge.y]
  ]);
  expect(pixels[0]).toEqual([255, 255, 255, 255]);
  expect(pixels[1]).toEqual([255, 255, 255, 255]);
  const ink = pixels
    .slice(2)
    .map((pixel) => 765 - pixel[0]! - pixel[1]! - pixel[2]!);
  expect(ink.at(-1)).toBeGreaterThan(6);
  expect(ink[0]).toBeLessThan(ink.at(-1)!);
  expect(new Set(ink).size).toBeGreaterThanOrEqual(3);
  for (let index = 1; index < ink.length; index++)
    expect(ink[index]).toBeGreaterThanOrEqual(ink[index - 1]! - 3);
  await info.attach("white-and-feather-pixels", {
    body: JSON.stringify({ edge, pixels, ink }),
    contentType: "application/json"
  });
  await page.screenshot({ path: info.outputPath("white-feather-svg.png") });
});

test("GPU overlap mixes yellow and blue pigment and reuses geometry during panning", async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installPaintScene(page);
  await openPaintScene(page, "webgl");
  const canvas = page.getByTestId("geographic-webgl");
  await expect(canvas).toBeVisible();
  const pixels = await screenPixels(page, [
    [110, 330],
    [250, 330],
    [175, 330]
  ]);
  const [yellowPixel, bluePixel, mixed] = pixels;
  const blueAlpha = await page
    .locator(`[data-composite-paint-id="${blue}"] > path`)
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return Number(style.fillOpacity) * Number(style.opacity);
    });
  // Ordinary sRGB source-over of the two separately painted colors on white.
  // The pigment overlap must materially differ and retain a green-biased mix.
  const ordinary = yellowPixel!
    .slice(0, 3)
    .map((value, index) =>
      Math.round(bluePixel![index]! + (value - 255) * (1 - blueAlpha))
    );
  expect(mixed![1]).toBeGreaterThan(mixed![0]! + 2);
  expect(mixed![1]).toBeGreaterThan(mixed![2]! + 2);
  expect(
    mixed!
      .slice(0, 3)
      .some((value, index) => Math.abs(value - ordinary[index]!) > 5)
  ).toBe(true);
  const before = await canvas.evaluate((node) => ({
    builds: Number(node.dataset.meshBuilds),
    reuses: Number(node.dataset.meshReuses),
    error: (node as HTMLCanvasElement).getContext("webgl2")!.getError(),
    dataset: { ...node.dataset }
  }));
  expect(before.error).toBe(0);
  expect(before.dataset.pigmentMode).toBe("spectral-6band");
  expect(Number(before.dataset.pigmentPixels)).toBeLessThanOrEqual(300_000);
  expect(Number(before.dataset.pigmentBytes)).toBeLessThanOrEqual(6_000_000);
  expect(Number(before.dataset.pigmentBytes)).toBe(
    Number(before.dataset.pigmentPixels) * 20
  );
  expect(before.dataset.pigmentResolvePixels).toBe(
    before.dataset.pigmentPixels
  );
  expect(before.dataset.featherCoats).toBe("2");
  expect(Number(before.dataset.meshArrays)).toBeGreaterThan(0);
  const resolution = await canvas.evaluate((node) => ({
    displayPixels:
      (node as HTMLCanvasElement).width * (node as HTMLCanvasElement).height,
    cssPixels: node.clientWidth * node.clientHeight
  }));
  // Only the pigment surface is coarser; points and borders keep their
  // existing display resolution and labels remain native SVG text.
  expect(Number(before.dataset.pigmentPixels)).toBeLessThanOrEqual(
    resolution.cssPixels
  );
  expect(resolution.displayPixels).toBeGreaterThan(resolution.cssPixels);
  expect(Number(before.dataset.meshBytes)).toBeLessThanOrEqual(8_000_000);
  await page.mouse.move(310, 520);
  await page.mouse.down();
  for (let index = 1; index <= 8; index++) {
    await page.mouse.move(310 + index / 4, 520);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await page.mouse.up();
  const after = await canvas.evaluate((node) => ({
    builds: Number(node.dataset.meshBuilds),
    reuses: Number(node.dataset.meshReuses),
    error: (node as HTMLCanvasElement).getContext("webgl2")!.getError(),
    dataset: { ...node.dataset }
  }));
  expect(after.builds).toBe(before.builds);
  expect(after.reuses).toBeGreaterThan(before.reuses);
  expect(after.dataset.meshArrays).toBe(before.dataset.meshArrays);
  expect(after.dataset.meshBytes).toBe(before.dataset.meshBytes);
  expect(after.error).toBe(0);
  expect(errors).toEqual([]);
  await info.attach("spectral-pixel-and-mesh-evidence", {
    body: JSON.stringify({ pixels, blueAlpha, ordinary, before, after }),
    contentType: "application/json"
  });
  await page.screenshot({
    path: info.outputPath("spectral-overlap-webgl.png")
  });
});

test("settled point-only frames skip pigment passes and restore hulls on the same canvas", async ({
  page
}) => {
  const mode = { points: false };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installPaintScene(page, mode);
  await openPaintScene(page, "webgl");
  const canvas = page.getByTestId("geographic-webgl");
  const original = await canvas.elementHandle();
  await expect(canvas).toHaveAttribute("data-pigment-mode", "spectral-6band");
  const width = page.viewportSize()!.width;
  const height = page.viewportSize()!.height;
  mode.points = true;
  await page.setViewportSize({ width: width + 1, height });
  await expect.poll(() => canvas.getAttribute("data-pigment-draws")).toBe("0");
  await expect(canvas).toHaveAttribute("data-pigment-resolve-pixels", "0");
  await expect(canvas).toHaveAttribute("data-mesh-count", "0");
  await expect(canvas).toHaveAttribute("data-mesh-arrays", "0");
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
  const points = page.locator("[data-composite-point-id]");
  await expect(points).toHaveCount(3);
  for (const point of await points.all()) {
    expect(
      await point.evaluate((node) => Number(getComputedStyle(node).opacity))
    ).toBeGreaterThan(0);
  }
  mode.points = false;
  await page.setViewportSize({ width, height });
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-pigment-draws")))
    .toBeGreaterThan(0);
  await page.waitForTimeout(700);
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
  const [mix, paper] = await screenPixels(page, [
    [175, 330],
    [325, 180]
  ]);
  expect(mix![1]).toBeGreaterThan(mix![0]! + 2);
  expect(mix![1]).toBeGreaterThan(mix![2]! + 2);
  expect(paper).toEqual([255, 255, 255, 255]);
  expect(
    await canvas.evaluate((node) =>
      (node as HTMLCanvasElement).getContext("webgl2")!.getError()
    )
  ).toBe(0);
  expect(errors).toEqual([]);
});

test("small pinches reuse bounded background meshes while native hull paths and glyphs stay live", async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installPaintScene(page);
  await openPaintScene(page, "webgl");
  const canvas = page.getByTestId("geographic-webgl");
  const originalCanvas = await canvas.elementHandle();
  const beforeReuses = Number(
    await canvas.getAttribute("data-mesh-zoom-reuses")
  );
  const result = await page
    .getByTestId("graph-stage")
    .evaluate(async (stage, id) => {
      const hull = stage.querySelector<SVGPathElement>(
        `[data-composite-paint-id="${id}"] > path`
      )!;
      const svg = stage.querySelector<SVGSVGElement>(
        'svg[aria-label="Projected chart surface"]'
      )!;
      const label = [
        ...svg.querySelectorAll<SVGTextElement>("text[data-label-paint-id]")
      ].find(
        (node) =>
          Number(getComputedStyle(node).opacity) > 0.1 &&
          node.querySelector("textPath")
      );
      if (!label) throw Error("native_hull_label_unavailable");
      const textPath = label.querySelector("textPath")!;
      const before = {
        path: hull.getAttribute("d"),
        text: label.textContent,
        fontSize: getComputedStyle(label).fontSize
      };
      const bounds = stage.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2,
        y = bounds.top + bounds.height * 0.55;
      const capture = stage.setPointerCapture;
      const samples: {
        path: string | null;
        native: boolean;
        text: string | null;
        fontSize: string;
        opacity: number;
        svgOpacity: number;
        transform: number[];
        characters: number;
        snapshots: number;
      }[] = [];
      // WebKit does not automate a native two-finger drag. As in the existing
      // gesture regressions, synthetic contacts use the actual pointer handlers
      // and RAF commits, with capture disabled only for these synthetic IDs.
      stage.setPointerCapture = () => {};
      const send = (
        type: string,
        pointerId: number,
        sign: number,
        scale: number
      ) =>
        stage.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId,
            pointerType: "touch",
            button: 0,
            buttons: type === "pointercancel" ? 0 : 1,
            clientX: x + sign * 65 * scale,
            clientY: y + sign * 55 * scale
          })
        );
      try {
        send("pointerdown", 7821, -1, 1);
        send("pointerdown", 7822, 1, 1);
        for (let step = 1; step <= 12; step++) {
          const scale = 1 + step * 0.002;
          send("pointermove", 7821, -1, scale);
          send("pointermove", 7822, 1, scale);
          await new Promise(requestAnimationFrame);
          const matrix = label.getScreenCTM()!;
          samples.push({
            path: hull.getAttribute("d"),
            native:
              label.isConnected && label.querySelector("textPath") === textPath,
            text: label.textContent,
            fontSize: getComputedStyle(label).fontSize,
            opacity: Number(getComputedStyle(label).opacity),
            svgOpacity: Number(getComputedStyle(svg).opacity),
            transform: [matrix.a, matrix.b, matrix.c, matrix.d],
            characters: label.getNumberOfChars(),
            snapshots: stage.querySelectorAll(
              '[data-testid="gesture-graph-cache"], svg image'
            ).length
          });
        }
      } finally {
        send("pointercancel", 7821, -1, 1.024);
        send("pointercancel", 7822, 1, 1.024);
        stage.setPointerCapture = capture;
      }
      return { before, samples };
    }, blue);
  await expect
    .poll(async () =>
      Number(await canvas.getAttribute("data-mesh-zoom-reuses"))
    )
    .toBeGreaterThan(beforeReuses);
  expect(
    result.samples.some((sample) => sample.path !== result.before.path)
  ).toBe(true);
  for (const sample of result.samples) {
    expect(sample.native).toBe(true);
    expect(sample.text).toBe(result.before.text);
    expect(sample.fontSize).toBe(result.before.fontSize);
    expect(sample.opacity).toBeGreaterThan(0.1);
    expect(sample.svgOpacity).toBe(1);
    expect(sample.characters).toBeGreaterThan(0);
    expect(sample.snapshots).toBe(0);
    sample.transform.forEach((value, index) =>
      expect(value).toBeCloseTo(index % 3 === 0 ? 1 : 0, 5)
    );
  }
  expect(
    await canvas.evaluate((node, original) => node === original, originalCanvas)
  ).toBe(true);
  const after = await canvas.evaluate((node) => ({
    dataset: { ...node.dataset },
    error: (node as HTMLCanvasElement).getContext("webgl2")!.getError()
  }));
  expect(after.dataset.pigmentMode).toBe("spectral-6band");
  expect(Number(after.dataset.meshBytes)).toBeLessThanOrEqual(8_000_000);
  expect(Number(after.dataset.meshControlBytes)).toBeLessThanOrEqual(1_000_000);
  expect(Number(after.dataset.meshCount)).toBeLessThanOrEqual(128);
  expect(Number(after.dataset.pigmentBytes)).toBeLessThanOrEqual(6_000_000);
  expect(after.error).toBe(0);
  expect(errors).toEqual([]);
  await info.attach("bounded-zoom-native-label-evidence", {
    body: JSON.stringify({ beforeReuses, ...result, after }),
    contentType: "application/json"
  });
});

test("unsupported float color targets retain visible SVG multiply paint and authored identity", async ({
  page
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      const context = original.apply(this, args);
      if (args[0] === "webgl2" && context) {
        const gl = context as WebGL2RenderingContext;
        const getExtension = gl.getExtension.bind(gl);
        gl.getExtension = (name: string) =>
          name === "EXT_color_buffer_float" ? null : getExtension(name);
      }
      return context;
    } as typeof original;
  });
  await installPaintScene(page);
  await openPaintScene(page, "webgl");
  await expect(page.getByTestId("geographic-webgl")).toHaveCount(0);
  await expect(page.locator('svg[data-graphics-painter="svg"]')).toHaveCount(1);
  const regions = page.locator("[data-composite-paint-id]");
  await expect(regions).toHaveCount(3);
  const pixels = await screenPixels(page, [
    [175, 330],
    [325, 180]
  ]);
  expect(pixels[0]!.slice(0, 3).some((value) => value < 245)).toBe(true);
  expect(pixels[1]).toEqual([255, 255, 255, 255]);
  const hue = await page
    .locator(`[data-composite-paint-id="${blue}"] > path`)
    .evaluate((node) => getComputedStyle(node).fill);
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.locator(`[data-composite-paint-id="${blue}"] > path`)
  ).toBeVisible();
  expect(
    await page
      .locator(`[data-composite-paint-id="${blue}"] > path`)
      .evaluate((node) => getComputedStyle(node).fill)
  ).toBe(hue);
});
