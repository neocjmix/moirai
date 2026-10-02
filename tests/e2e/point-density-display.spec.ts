import { expect, test } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";

test("leaf and authored Composite points shrink, hide and reverse without losing identity", async ({
  page
}, info) => {
  let density = { pointScale: 1, opacity: 1, labelOpacity: 1 };
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
    const span = hull ? 0.035 : 0.001;
    const bounds = {
      minX: rx - dx * span,
      maxX: rx + dx * span,
      minY: cy - dy * span,
      maxY: cy + dy * span
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
        groups
          .locator("circle")
          .first()
          .evaluate((node) => parseFloat(getComputedStyle(node).r))
      )
      .toBeCloseTo(6 * density.pointScale, 1);
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
  hull = false;
  density = { pointScale: 1, opacity: 1, labelOpacity: 1 };
  await page.setViewportSize({ width: 470, height: 844 });
  await expect(
    page.locator('[data-composite-point-id="density-composite"]')
  ).toHaveCount(1);
  const hullPaint = page.locator(
    '[data-composite-paint-id="density-composite"] > path'
  );
  await expect
    .poll(
      () =>
        hullPaint.evaluate((node) => {
          const opacity = Number(getComputedStyle(node).opacity);
          return opacity > 0 && opacity < 1;
        }),
      { intervals: [10] }
    )
    .toBe(true);
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
  await leafPaint.evaluate((node) => {
    (window as unknown as { originalLeafPaint: Element }).originalLeafPaint =
      node;
  });
  hull = false;
  suppressChild = true;
  await page.setViewportSize({ width: 490, height: 844 });
  await expect(leafPaint.locator("[data-primary-hit-target]")).toHaveCount(0);
  await expect
    .poll(
      () =>
        leafPaint.locator("circle").evaluate((node) => {
          const opacity = Number(getComputedStyle(node).opacity);
          return opacity > 0 && opacity < 1;
        }),
      { intervals: [10] }
    )
    .toBe(true);
  suppressChild = false;
  await page.setViewportSize({ width: 500, height: 844 });
  await expect(leafPaint.locator("[data-primary-hit-target]")).toHaveCount(1);
  expect(
    await leafPaint.evaluate(
      (node) =>
        node ===
        (window as unknown as { originalLeafPaint: Element }).originalLeafPaint
    )
  ).toBe(true);
  await expect
    .poll(() =>
      leafPaint
        .locator("circle")
        .evaluate((node) => Number(getComputedStyle(node).opacity))
    )
    .toBeCloseTo(1);
  suppressChild = true;
  await page.setViewportSize({ width: 510, height: 844 });
  await expect(leafPaint).toHaveCount(0);

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
