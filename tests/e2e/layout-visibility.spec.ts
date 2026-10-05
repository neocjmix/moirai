import { expect, test, type Page } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";
const compositeId = "visibility-composite";
const compositeTitle =
  "한산도와 안골포의 연속 작전 전체를 설명하는 긴 컴포짓 사건 이름";

interface Viewport {
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  viewportWidth: number;
  viewportHeight: number;
}

interface Scene {
  points?: boolean;
  compositeSpan?: number;
  compositeCenterX?: number;
  smallPoint?: boolean;
  compositeTitle?: string;
}

async function installScene(page: Page, scene: () => Scene) {
  await page.route("**/graph/v5/shell", async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind !== "viewport") return route.continue();
    const response = await (await route.fetch()).json();
    const viewport = request.viewport as Viewport;
    const box = viewport.bbox;
    // The semantic reader requests a four-viewport support box. Place the
    // synthetic facts in screen pixels, independently of the label policy.
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
    const current = scene();
    const base = {
      canonId: world,
      validationState: "ok",
      diagnostics: [],
      viewportClass: "visible",
      contains: []
    };
    const centerX = current.compositeCenterX ?? viewport.viewportWidth / 2;
    const centerY = viewport.viewportHeight * 0.55;
    const halfSpan = (current.compositeSpan ?? 0) / 2;
    const first = position(centerX - halfSpan, centerY - halfSpan);
    const last = position(centerX + halfSpan, centerY + halfSpan);
    await route.fulfill({
      json: {
        ...response,
        entities: current.points
          ? [
              {
                ...base,
                id: "right-edge",
                eventId: "right-edge",
                label: "오른쪽 경계 이름표",
                geometryKind: "point",
                position: position(
                  viewport.viewportWidth - 48,
                  viewport.viewportHeight * 0.45
                )
              },
              {
                ...base,
                id: "left-edge",
                eventId: "left-edge",
                label: "왼쪽 경계 이름표",
                geometryKind: "point",
                position: position(-24, viewport.viewportHeight * 0.65)
              }
            ]
          : [],
        regions: current.compositeSpan
          ? [
              {
                ...base,
                id: compositeId,
                eventId: compositeId,
                label: current.compositeTitle ?? compositeTitle,
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
                ],
                renderDensity: current.smallPoint
                  ? { pointScale: 0.35, opacity: 1, labelOpacity: 0 }
                  : { pointScale: 1, opacity: 1, labelOpacity: 1 }
              }
            ]
          : [],
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

async function openScene(page: Page) {
  // Native SVG exposes the actual paint attributes; Canvas/WebGL parity is
  // separately covered by the compiler-v4 continuity suite and painter tests.
  await page.goto(`/graph/v5?world=${world}&tileData=0&gsGraphics=svg`);
  await page.waitForLoadState("networkidle");
}

test("screen-edge Event titles retain their complete text until the natural viewport crop", async ({
  page
}, info) => {
  await installScene(page, () => ({ points: true }));
  await openScene(page);
  const right = page.locator('[data-event-paint-id="right-edge"] text');
  const left = page.locator('[data-event-paint-id="left-edge"] text');
  await expect(right).toHaveText("오른쪽 경계 이름표");
  await expect(left).toHaveText("왼쪽 경계 이름표");
  for (const label of [left, right]) {
    await expect(label).toBeVisible();
    await expect
      .poll(() =>
        label.evaluate((node) => Number(getComputedStyle(node).opacity))
      )
      .toBeGreaterThan(0.9);
  }
  const width = await page
    .getByLabel("Projected chart surface", { exact: true })
    .evaluate(
      (node) => (node as unknown as SVGSVGElement).viewBox.baseVal.width
    );
  // WebKit's protocol boundingBox reports SVG text's local glyph extent at
  // (0, 0). Combine the painted SVG anchor and native glyph width instead.
  const rightBox = await right.evaluate((node) => ({
    x: Number(node.getAttribute("x")),
    width: (node as SVGTextElement).getComputedTextLength()
  }));
  const leftBox = await left.evaluate((node) => ({
    x: Number(node.getAttribute("x")),
    width: (node as SVGTextElement).getComputedTextLength()
  }));
  await info.attach("edge-label-bounds", {
    body: JSON.stringify({ width, rightBox, leftBox }),
    contentType: "application/json"
  });
  expect(rightBox.x).toBeLessThan(width);
  expect(rightBox.x + rightBox.width).toBeGreaterThan(width);
  expect(leftBox.x).toBeLessThan(0);
  expect(leftBox.x + leftBox.width).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("viewport-edge-titles.png") });
});

for (const [name, title] of [
  ["Korean", compositeTitle],
  ["wide Latin", "WWWWW MMMMM WWWWW MMMMM WWWWW MMMMM WWWWW MMMMM"],
  ["Arabic ligature", "﷽".repeat(12)]
] as const) {
  test(`a short Composite hull paints every character of its full ${name} title`, async ({
    page
  }, info) => {
    await installScene(page, () => ({
      compositeSpan: 32,
      compositeTitle: title
    }));
    await openScene(page);
    const label = page.locator(`text[data-region-id="${compositeId}"]`);
    const path = page.locator(
      `path[data-region-label-path-id="${compositeId}"]`
    );
    await expect(label).toHaveText(title);
    await expect(label).toBeVisible();
    await expect
      .poll(() =>
        label.evaluate((node) => Number(getComputedStyle(node).opacity))
      )
      .toBeGreaterThan(0.45);
    const text = await label.evaluate((node) => {
      const element = node as SVGTextElement;
      const first = element.getExtentOfChar(0);
      const last = element.getExtentOfChar(element.getNumberOfChars() - 1);
      return {
        length: element.getComputedTextLength(),
        firstWidth: first.width,
        firstHeight: first.height,
        lastWidth: last.width,
        lastHeight: last.height
      };
    });
    const pathLength = await path.evaluate((node) =>
      (node as SVGPathElement).getTotalLength()
    );
    expect(text.length).toBeGreaterThan(32 * 3);
    expect(pathLength).toBeGreaterThan(text.length);
    expect(text.firstWidth).toBeGreaterThan(0);
    expect(text.firstHeight).toBeGreaterThan(0);
    expect(text.lastWidth).toBeGreaterThan(0);
    expect(text.lastHeight).toBeGreaterThan(0);
    await page.screenshot({
      path: info.outputPath("short-hull-full-title.png")
    });
  });
}

test("a Composite outside the screen retains its full title when its glyphs extend inside", async ({
  page
}, info) => {
  // Authored support occupies [-46, -14]px: the visible title, rather than
  // the offscreen Composite bounds, must keep this candidate available.
  await installScene(page, () => ({
    compositeSpan: 32,
    compositeCenterX: -30
  }));
  await openScene(page);
  const label = page.locator(`text[data-region-id="${compositeId}"]`);
  await expect(label).toHaveText(compositeTitle);
  await expect(label).toBeVisible();
  await expect
    .poll(() =>
      label.evaluate((node) => Number(getComputedStyle(node).opacity))
    )
    .toBeGreaterThan(0.45);
  const glyphs = await label.evaluate((node) => {
    const element = node as SVGTextElement;
    const transform = element.getScreenCTM()!;
    const surface = element.ownerSVGElement!.getBoundingClientRect();
    const extents = Array.from(
      { length: element.getNumberOfChars() },
      (_, index) => {
        const extent = element.getExtentOfChar(index);
        const corners = [
          new DOMPoint(extent.x, extent.y).matrixTransform(transform),
          new DOMPoint(
            extent.x + extent.width,
            extent.y + extent.height
          ).matrixTransform(transform)
        ];
        return {
          width: extent.width,
          height: extent.height,
          minX: Math.min(...corners.map((point) => point.x)),
          maxX: Math.max(...corners.map((point) => point.x)),
          minY: Math.min(...corners.map((point) => point.y)),
          maxY: Math.max(...corners.map((point) => point.y))
        };
      }
    );
    return {
      first: extents[0]!,
      last: extents.at(-1)!,
      visible: extents.some(
        (extent) =>
          extent.minX < surface.right &&
          extent.maxX > surface.left &&
          extent.minY < surface.bottom &&
          extent.maxY > surface.top
      )
    };
  });
  expect(glyphs.visible).toBe(true);
  expect(glyphs.first.width).toBeGreaterThan(0);
  expect(glyphs.first.height).toBeGreaterThan(0);
  expect(glyphs.last.width).toBeGreaterThan(0);
  expect(glyphs.last.height).toBeGreaterThan(0);
  await page.screenshot({
    path: info.outputPath("offscreen-hull-visible-title.png")
  });
});

test("a Composite loses its outline before becoming a point and retains its color through small-point reduction", async ({
  page
}, info) => {
  let scene: Scene = { compositeSpan: 72 };
  await installScene(page, () => scene);
  await openScene(page);
  const owner = page.locator(`[data-composite-paint-id="${compositeId}"]`);
  const hull = owner.locator(":scope > path");
  const compact = owner.locator(`[data-composite-point-id="${compositeId}"]`);
  await expect(hull).toBeVisible();
  await expect
    .poll(() =>
      hull.evaluate((node) => Number(getComputedStyle(node).strokeOpacity))
    )
    .toBeGreaterThan(0);
  await hull.evaluate(async (node) => {
    await Promise.all(
      node.getAnimations().map((animation) => animation.finished)
    );
  });
  const color = await hull.evaluate((node) => getComputedStyle(node).fill);
  const originalOwner = await owner.elementHandle();

  scene = { compositeSpan: 32 };
  await page.setViewportSize({ width: 410, height: 844 });
  await expect(hull).toHaveAttribute("data-region-id", compositeId);
  await expect(compact).toHaveCount(0);
  await expect
    .poll(() =>
      hull.evaluate((node) => Number(getComputedStyle(node).strokeOpacity))
    )
    .toBe(0);
  await expect
    .poll(() => hull.evaluate((node) => Number(getComputedStyle(node).opacity)))
    .toBe(1);
  expect(await hull.evaluate((node) => getComputedStyle(node).fill)).toBe(
    color
  );
  expect(
    await hull.evaluate((node) => Number(getComputedStyle(node).fillOpacity))
  ).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("borderless-composite.png") });

  for (const [index, smallPoint] of [false, true, false].entries()) {
    scene = { compositeSpan: 12, smallPoint };
    await page.setViewportSize({ width: 420 + index * 10, height: 844 });
    await expect(compact).toHaveAttribute(
      "data-point-density",
      smallPoint ? "small-point" : "point"
    );
    const circle = compact.locator("circle");
    expect(await circle.evaluate((node) => getComputedStyle(node).fill)).toBe(
      color
    );
    await expect
      .poll(() =>
        circle.evaluate((node) => parseFloat(getComputedStyle(node).r))
      )
      .toBeCloseTo(smallPoint ? 2.1 : 6, 1);
    expect(
      await owner.evaluate((node, previous) => node === previous, originalOwner)
    ).toBe(true);
  }
  await page.screenshot({
    path: info.outputPath("colored-composite-point.png")
  });
});
