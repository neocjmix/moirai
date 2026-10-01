import { expect, test } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";

test("leaf and authored Composite points shrink, hide and reverse without losing identity", async ({
  page
}, info) => {
  let density = { pointScale: 1, opacity: 1, labelOpacity: 1 };
  let hull = false;
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
        regions: [
          {
            ...base,
            id: "density-composite",
            eventId: "density-composite",
            label: "Group",
            geometryKind: "region",
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
  expect(errors).toEqual([]);
});
