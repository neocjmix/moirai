import { expect, test } from "@playwright/test";

test("a pointer burst reads stage layout once and preserves the final pan", async ({
  page
}) => {
  await page.goto("/graph/demo");
  const point = page.locator('[data-event-point-id="event:founding"]');
  await expect(point).toBeVisible();
  const before = await point.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move(65, 510);
  await page.mouse.down();
  const reads = await page
    .getByTestId("graph-stage")
    .evaluate(async (stage) => {
      const original = stage.getBoundingClientRect;
      let count = 0;
      stage.getBoundingClientRect = function () {
        count++;
        return original.call(this);
      };
      try {
        // WebKit's native mouse has pointerId 1. All events arrive in one task,
        // before the next paint, just like a high-frequency input burst.
        for (let i = 1; i <= 20; i++)
          stage.dispatchEvent(
            new PointerEvent("pointermove", {
              bubbles: true,
              pointerId: 1,
              pointerType: "mouse",
              buttons: 1,
              clientX: 65 - i * 2,
              clientY: 510 - i * 3
            })
          );
        const synchronous = count;
        await new Promise(requestAnimationFrame);
        return { synchronous, frame: count };
      } finally {
        stage.getBoundingClientRect = original;
      }
    });
  expect(reads).toEqual({ synchronous: 0, frame: 1 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const after = await point.boundingBox();
      return after ? Math.round(after.x - before!.x) : null;
    })
    .toBe(-40);
  await expect
    .poll(async () => {
      const after = await point.boundingBox();
      return after ? Math.round(after.y - before!.y) : null;
    })
    .toBe(-60);
  await expect(page.getByTestId("event-drawer-sheet")).toHaveCount(0);
});
