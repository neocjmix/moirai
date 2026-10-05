import { expect, test, type Page } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";
const pointId = "label-boundary-leaf";

async function captureLabelExit(page: Page, reverse: boolean) {
  await page.evaluate(
    ({ id, reverse }) => {
      const point = document.querySelector(`[data-event-paint-id="${id}"]`)!;
      const label = point.querySelector("text") as SVGElement;
      const stage = document.querySelector('[data-testid="graph-stage"]')!;
      const result = new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          if (Number(label.style.opacity) !== 0) return;
          observer.disconnect();
          const disabledAtExit =
            label.getAttribute("aria-hidden") === "true" &&
            !point.querySelector("[data-primary-hit-target]");
          const samples: number[] = [];
          const start = performance.now();
          let reversed = false;
          const sample = () => {
            const opacity = Number(getComputedStyle(label).opacity);
            samples.push(opacity);
            if (reverse && !reversed && opacity > 0 && opacity < 1) {
              reversed = true;
              stage.dispatchEvent(
                new PointerEvent("pointermove", {
                  bubbles: true,
                  pointerId: (window as unknown as { labelPointerId: number })
                    .labelPointerId,
                  pointerType: "mouse",
                  buttons: 1,
                  clientX: 220,
                  clientY: 500
                })
              );
            }
            if (performance.now() - start < 420) requestAnimationFrame(sample);
            else
              resolve({
                samples,
                disabledAtExit,
                reversed,
                connected: label.isConnected,
                samePoint:
                  point ===
                  document.querySelector(`[data-event-paint-id="${id}"]`),
                sameLabel: label === point.querySelector("text")
              });
          };
          requestAnimationFrame(sample);
        });
        observer.observe(label, {
          attributes: true,
          attributeFilter: ["style"]
        });
      });
      (window as unknown as { labelExit: Promise<unknown> }).labelExit = result;
    },
    { id: pointId, reverse }
  );
}
async function exitEvidence(page: Page) {
  return page.evaluate(
    async () =>
      (
        window as unknown as {
          labelExit: Promise<{
            samples: number[];
            disabledAtExit: boolean;
            reversed: boolean;
            connected: boolean;
            samePoint: boolean;
            sameLabel: boolean;
          }>;
        }
      ).labelExit
  );
}

test("semantic label admission fades and reverses at the viewport boundary without replacing Event paint", async ({
  page
}) => {
  let fixed = false;
  let position: { x: number; y: number };
  await page.route("**/graph/v5/shell", async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind !== "viewport") return route.continue();
    const response = await (await route.fetch()).json();
    if (!fixed) {
      const box = request.viewport.bbox;
      const width = request.viewport.viewportWidth;
      const height = request.viewport.viewportHeight;
      position = {
        x:
          (box.minX + box.maxX) / 2 +
          ((width - 16 - width / 2) * (box.maxX - box.minX)) / (width * 4),
        y:
          (box.minY + box.maxY) / 2 +
          ((400 - height / 2) * (box.maxY - box.minY)) / (height * 4)
      };
    }
    await route.fulfill({
      json: {
        ...response,
        entities: [
          {
            id: pointId,
            eventId: pointId,
            canonId: world,
            label: "Stable label",
            geometryKind: "point",
            position,
            contains: [],
            validationState: "ok",
            diagnostics: [],
            viewportClass: "visible"
          }
        ],
        regions: [],
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
  const point = page.locator(`[data-event-paint-id="${pointId}"]`);
  const label = point.locator("text");
  await expect(point.locator("[data-primary-hit-target]")).toBeVisible();
  await expect
    .poll(() =>
      label.evaluate((node) => Number(getComputedStyle(node).opacity))
    )
    .toBeCloseTo(1);
  fixed = true;
  await page.evaluate(() =>
    addEventListener(
      "pointerdown",
      (event) => {
        (window as unknown as { labelPointerId: number }).labelPointerId = (
          event as PointerEvent
        ).pointerId;
      },
      { capture: true }
    )
  );
  await captureLabelExit(page, true);
  await page.mouse.move(220, 500);
  await page.mouse.down();
  await page.mouse.move(232, 500);
  const reversed = await exitEvidence(page);
  await page.mouse.move(220, 500);
  await page.mouse.up();
  expect(reversed.disabledAtExit).toBe(true);
  expect(reversed.reversed).toBe(true);
  expect(reversed.samples.some((opacity) => opacity > 0 && opacity < 1)).toBe(
    true
  );
  expect(reversed.samples.at(-1)).toBeCloseTo(1);
  expect(reversed.samePoint).toBe(true);
  expect(reversed.sameLabel).toBe(true);

  await captureLabelExit(page, false);
  await page.mouse.move(220, 500);
  await page.mouse.down();
  await page.mouse.move(232, 500);
  const exit = await exitEvidence(page);
  await page.mouse.up();
  expect(exit.disabledAtExit).toBe(true);
  expect(exit.samples.some((opacity) => opacity > 0 && opacity < 1)).toBe(true);
  expect(exit.connected).toBe(false);
  expect(exit.samePoint).toBe(true);
  await expect(point.locator("circle")).toBeVisible();
  await expect(point.locator("[data-primary-hit-target]")).toHaveCount(0);

  // Re-admission after the old paint was pruned must fade a newly mounted
  // label in as well, while keeping the still-visible Event circle mounted.
  await page.evaluate((id) => {
    const point = document.querySelector(`[data-event-paint-id="${id}"]`)!;
    const result = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const label = point.querySelector("text");
        if (!label) return;
        observer.disconnect();
        const samples: number[] = [];
        const start = performance.now();
        const sample = () => {
          samples.push(Number(getComputedStyle(label).opacity));
          if (performance.now() - start < 300) requestAnimationFrame(sample);
          else
            resolve({
              samples,
              samePoint:
                point ===
                document.querySelector(`[data-event-paint-id="${id}"]`)
            });
        };
        requestAnimationFrame(sample);
      });
      observer.observe(point, { childList: true });
    });
    (window as unknown as { labelEntry: Promise<unknown> }).labelEntry = result;
  }, pointId);
  await page.mouse.move(220, 500);
  await page.mouse.down();
  await page.mouse.move(208, 500);
  const entry = await page.evaluate(
    async () =>
      (
        window as unknown as {
          labelEntry: Promise<{ samples: number[]; samePoint: boolean }>;
        }
      ).labelEntry
  );
  await page.mouse.up();
  expect(entry.samples.some((opacity) => opacity > 0 && opacity < 1)).toBe(
    true
  );
  expect(entry.samples.at(-1)).toBeCloseTo(1);
  expect(entry.samePoint).toBe(true);
  await page.unrouteAll({ behavior: "wait" });
});
