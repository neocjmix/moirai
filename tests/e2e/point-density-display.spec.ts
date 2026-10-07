import { expect, test, type Page } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";

// Capture in the browser before the change. A Playwright locator retry can
// resume after a180–220ms transition has already ended on a busy worker.
async function captureOpacityExit(page: Page, selector: string, pause = false) {
  await page.evaluate(
    ({ selector, pause }) => {
      const node = document.querySelector(selector) as SVGElement;
      const result = new Promise<{
        samples: number[];
        connected: boolean;
        animations: number;
      }>((resolve) => {
        const observer = new MutationObserver(() => {
          if (Number(node.style.opacity) !== 0) return;
          observer.disconnect();
          const samples: number[] = [];
          const started = performance.now();
          const sample = () => {
            const opacity = Number(getComputedStyle(node).opacity);
            samples.push(opacity);
            if (pause && opacity > 0 && opacity < 1) {
              const animations = node
                .getAnimations()
                .filter(
                  (animation) =>
                    (animation as Animation & { transitionProperty?: string })
                      .transitionProperty === "opacity"
                );
              for (const animation of animations) animation.pause();
              resolve({
                samples,
                connected: node.isConnected,
                animations: animations.length
              });
            } else if (performance.now() - started < 300)
              requestAnimationFrame(sample);
            else
              resolve({ samples, connected: node.isConnected, animations: 0 });
          };
          requestAnimationFrame(sample);
        });
        observer.observe(node, {
          attributes: true,
          attributeFilter: ["style"]
        });
      });
      (window as unknown as { opacityExit: typeof result }).opacityExit =
        result;
    },
    { selector, pause }
  );
}
async function opacityExit(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          opacityExit: Promise<{
            samples: number[];
            connected: boolean;
            animations: number;
          }>;
        }
      ).opacityExit
  );
}

test("leaf and authored Composite points shrink, hide and reverse without losing identity", async ({
  page
}, info) => {
  let density = { pointScale: 1, opacity: 1, labelOpacity: 1 };
  let compositeSpan = 12;
  let hull = false;
  let suppressChild = false;
  let omitComposite = false;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/graph/v5/shell", async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind !== "viewport") return route.continue();
    const response = await (await route.fetch()).json();
    const box = request.viewport.bbox;
    const dx = box.maxX - box.minX,
      dy = box.maxY - box.minY;
    const cx = (box.minX + box.maxX) / 2,
      cy = (box.minY + box.maxY) / 2;
    const base = {
      canonId: world,
      validationState: "ok",
      diagnostics: [],
      viewportClass: "visible",
      contains: [],
      renderDensity: density
    };
    const rx = cx + dx * 0.05;
    // The reader requests four viewports of support. Express the Composite's
    // authored span in screen pixels: its size stage is independent of rank.
    const halfSpan = (hull ? 96 : compositeSpan) / 2;
    const halfWidth = (halfSpan * dx) / (request.viewport.viewportWidth * 4);
    const halfHeight = (halfSpan * dy) / (request.viewport.viewportHeight * 4);
    const bounds = {
      minX: rx - halfWidth,
      maxX: rx + halfWidth,
      minY: cy - halfHeight,
      maxY: cy + halfHeight
    };
    await route.fulfill({
      json: {
        ...response,
        entities: [
          {
            ...base,
            id: "density-leaf",
            eventId: "density-leaf",
            label: "Leaf",
            geometryKind: "point",
            position: { x: cx - dx * 0.05, y: cy }
          }
        ],
        regions: omitComposite
          ? []
          : [
              {
                ...base,
                id: "density-composite",
                eventId: "density-composite",
                label: "Group",
                geometryKind: "region",
                contains: suppressChild ? ["density-leaf"] : [],
                childrenComplete: true,
                worldBounds: bounds,
                preparedWorldHull: [
                  { x: bounds.minX, y: bounds.minY },
                  { x: bounds.maxX, y: bounds.minY },
                  { x: bounds.maxX, y: bounds.maxY },
                  { x: bounds.minX, y: bounds.maxY }
                ]
              }
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
  await page.goto(`/graph/v5?world=${world}&tileData=0`);
  const groups = page.locator("[data-point-density]");
  await expect(groups).toHaveCount(2);
  const leafCircle = page.locator(
    '[data-event-paint-id="density-leaf"] circle'
  );
  const compositePoint = page.locator(
    '[data-composite-point-id="density-composite"]'
  );
  const normalIds = await groups.evaluateAll((nodes) =>
    nodes
      .map(
        (node) =>
          node.getAttribute("data-composite-point-id") ??
          node
            .querySelector("[data-event-point-id]")
            ?.getAttribute("data-event-point-id")
      )
      .sort()
  );
  for (const [index, stage] of [
    "small-point",
    "hidden",
    "small-point",
    "point"
  ].entries()) {
    compositeSpan = stage === "point" ? 12 : stage === "small-point" ? 6 : 0.5;
    density =
      stage === "point"
        ? { pointScale: 1, opacity: 1, labelOpacity: 1 }
        : stage === "small-point"
          ? { pointScale: 0.35, opacity: 1, labelOpacity: 0 }
          : { pointScale: 0, opacity: 0, labelOpacity: 0 };
    await page.setViewportSize({ width: 410 + index * 10, height: 844 });
    await expect(page.locator(`[data-point-density="${stage}"]`)).toHaveCount(
      2
    );
    if (stage !== "point") {
      await expect
        .poll(() =>
          groups
            .locator("text")
            .evaluateAll((nodes) =>
              nodes.every(
                (node) =>
                  Number(getComputedStyle(node).opacity) === 0 &&
                  node.getAttribute("aria-hidden") === "true"
              )
            )
        )
        .toBe(true);
      await expect(groups.locator("[data-primary-hit-target]")).toHaveCount(0);
    } else {
      await expect(groups.locator("[data-primary-hit-target]")).toHaveCount(2);
    }
    await expect
      .poll(async () =>
        leafCircle.evaluate((node) => parseFloat(getComputedStyle(node).r))
      )
      .toBeCloseTo(6 * density.pointScale, 1);
    await expect
      .poll(() =>
        compositePoint
          .locator("circle")
          .evaluate((node) => parseFloat(getComputedStyle(node).r))
      )
      .toBeCloseTo(stage === "point" ? 6 : 2.1, 1);
    for (const paint of [leafCircle, compositePoint]) {
      await expect
        .poll(() =>
          paint.evaluate((node) => Number(getComputedStyle(node).opacity))
        )
        .toBe(stage === "hidden" ? 0 : 1);
    }
    await page.screenshot({
      path: info.outputPath(`density-${index}-${stage}.png`)
    });
  }
  const restoredIds = await groups.evaluateAll((nodes) =>
    nodes
      .map(
        (node) =>
          node.getAttribute("data-composite-point-id") ??
          node
            .querySelector("[data-event-point-id]")
            ?.getAttribute("data-event-point-id")
      )
      .sort()
  );
  expect(restoredIds).toEqual(normalIds);
  // Density may remove a Composite label, but cannot hide its authored point
  // while its own support still occupies the ordinary-point band.
  density = { pointScale: 0, opacity: 0, labelOpacity: 0 };
  await page.setViewportSize({ width: 450, height: 844 });
  await expect(compositePoint).toHaveAttribute("data-point-density", "point");
  await expect
    .poll(() =>
      compositePoint.evaluate((node) => Number(getComputedStyle(node).opacity))
    )
    .toBe(1);
  await expect
    .poll(() =>
      leafCircle.evaluate((node) => Number(getComputedStyle(node).opacity))
    )
    .toBe(0);
  // Observe the same paint owner while a later fetch replaces the tiny hull
  // with expanded geometry. Replacing <g> with <path> restarts identity and
  // cannot animate opacity, even if the two elements happen to share a key.
  await page.evaluate(() => {
    const owner = document.querySelector(
      '[data-composite-paint-id="density-composite"]'
    )!;
    const path = owner.querySelector("path")!;
    const state = {
      owner,
      path,
      samples: [] as number[],
      done: Promise.resolve()
    };
    (window as unknown as { densityPaint: typeof state }).densityPaint = state;
    state.done = new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (Number(path.style.opacity) === 0) return;
        observer.disconnect();
        const start = performance.now();
        const sample = () => {
          state.samples.push(Number(getComputedStyle(path).opacity));
          if (performance.now() - start < 300) requestAnimationFrame(sample);
          else resolve();
        };
        requestAnimationFrame(sample);
      });
      observer.observe(path, { attributes: true, attributeFilter: ["style"] });
    });
  });
  // At the same hidden priority, an expanded authored hull remains a hull.
  hull = true;
  density = { pointScale: 0, opacity: 0, labelOpacity: 0 };
  await page.setViewportSize({ width: 460, height: 844 });
  await expect(
    page.locator('[data-composite-point-id="density-composite"]')
  ).toHaveCount(0);
  await expect(
    page.locator('path[data-region-id="density-composite"]')
  ).toBeVisible();
  const continuity = await page.evaluate(async () => {
    const state = (
      window as unknown as {
        densityPaint: {
          owner: Element;
          path: Element;
          samples: number[];
          done: Promise<void>;
        };
      }
    ).densityPaint;
    await state.done;
    const owner = document.querySelector(
      '[data-composite-paint-id="density-composite"]'
    );
    return {
      sameOwner: owner === state.owner,
      sameHull: owner?.querySelector("path") === state.path,
      samples: state.samples
    };
  });
  expect(continuity.sameOwner).toBe(true);
  expect(continuity.sameHull).toBe(true);
  expect(continuity.samples.some((opacity) => opacity > 0 && opacity < 1)).toBe(
    true
  );
  expect(continuity.samples.at(-1)).toBeCloseTo(1);

  // Reverse the representation while its previous fade is still in flight.
  // The same authored owner and hull must keep the browser's current opacity,
  // rather than remounting either shape at the end state.
  await captureOpacityExit(
    page,
    '[data-composite-paint-id="density-composite"] > path',
    true
  );
  hull = false;
  density = { pointScale: 1, opacity: 1, labelOpacity: 1 };
  await page.setViewportSize({ width: 470, height: 844 });
  const hullExit = await opacityExit(page);
  expect(hullExit.connected).toBe(true);
  expect(hullExit.animations).toBeGreaterThan(0);
  expect(hullExit.samples.some((opacity) => opacity > 0 && opacity < 1)).toBe(
    true
  );
  const hullPaint = page.locator(
    '[data-composite-paint-id="density-composite"] > path'
  );
  hull = true;
  await page.setViewportSize({ width: 480, height: 844 });
  await expect
    .poll(() =>
      hullPaint.evaluate((node) => Number(getComputedStyle(node).opacity))
    )
    .toBeCloseTo(1);
  expect(
    await page.evaluate(() => {
      const state = (
        window as unknown as { densityPaint: { owner: Element; path: Element } }
      ).densityPaint;
      const owner = document.querySelector(
        '[data-composite-paint-id="density-composite"]'
      );
      return (
        owner === state.owner && owner?.querySelector("path") === state.path
      );
    })
  ).toBe(true);
  // Authored child suppression used to unmount at target opacity zero,
  // cutting off the browser's still-running opacity transition.
  const leafPaint = page.locator('[data-event-paint-id="density-leaf"]');
  await captureOpacityExit(page, '[data-event-paint-id="density-leaf"] circle');
  hull = false;
  suppressChild = true;
  await page.setViewportSize({ width: 490, height: 844 });
  const childExit = await opacityExit(page);
  expect(childExit.samples.some((opacity) => opacity > 0 && opacity < 1)).toBe(
    true
  );
  await expect(leafPaint.locator("[data-primary-hit-target]")).toHaveCount(0);
  await expect(leafPaint).toHaveCount(0);
  // Reentry after paint pruning is a new DOM mount, so it needs an explicit
  // entrance fade; an ordinary CSS transition cannot animate its first style.
  await page.evaluate(() => {
    const scene = document.querySelector(
      'svg[aria-label="Projected chart surface"]'
    )!;
    const result = new Promise<number[]>((resolve) => {
      const observer = new MutationObserver(() => {
        const node = scene.querySelector(
          '[data-event-paint-id="density-leaf"]'
        );
        if (!node) return;
        observer.disconnect();
        const values: number[] = [];
        const start = performance.now();
        const sample = () => {
          values.push(Number(getComputedStyle(node).opacity));
          if (performance.now() - start < 300) requestAnimationFrame(sample);
          else resolve(values);
        };
        requestAnimationFrame(sample);
      });
      observer.observe(scene, { childList: true, subtree: true });
    });
    (window as unknown as { pointReentry: Promise<number[]> }).pointReentry =
      result;
  });
  suppressChild = false;
  await page.setViewportSize({ width: 500, height: 844 });
  const pointReentry = await page.evaluate(
    () =>
      (window as unknown as { pointReentry: Promise<number[]> }).pointReentry
  );
  expect(pointReentry.some((opacity) => opacity > 0 && opacity < 1)).toBe(true);
  expect(pointReentry.at(-1)).toBeCloseTo(1);
  await expect(leafPaint.locator("[data-primary-hit-target]")).toHaveCount(1);

  // A disappearing hull keeps its label paint, but leaves keyboard and
  // accessibility surfaces immediately, before the220ms paint exit completes.
  hull = true;
  density = { pointScale: 0, opacity: 0, labelOpacity: 0 };
  await page.setViewportSize({ width: 520, height: 844 });
  const hullLabel = page.locator('text[data-region-id="density-composite"]');
  await expect(hullLabel).toHaveAttribute("role", "button");
  await hullLabel.focus();
  await hullLabel.evaluate((node) => {
    const result = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (node.hasAttribute("data-primary-hit-target")) return;
        observer.disconnect();
        resolve({
          connected: node.isConnected,
          role: node.getAttribute("role"),
          tabIndex: node.getAttribute("tabindex"),
          hidden: node.getAttribute("aria-hidden")
        });
      });
      observer.observe(node, { attributes: true });
    });
    (window as unknown as { hullLabelExit: Promise<unknown> }).hullLabelExit =
      result;
  });
  omitComposite = true;
  await page.setViewportSize({ width: 530, height: 844 });
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { hullLabelExit: Promise<unknown> }).hullLabelExit
    )
  ).toEqual({ connected: true, role: null, tabIndex: null, hidden: "true" });
  await expect(hullLabel).toHaveCount(0);
  // Complete any scheduled fixture response before Playwright disposes it.
  await page.unrouteAll({ behavior: "wait" });
  expect(errors).toEqual([]);
});
