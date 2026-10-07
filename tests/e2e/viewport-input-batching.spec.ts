import { expect, test } from "@playwright/test";

for (const interruption of ["pointercancel", "lostpointercapture"]) {
  test(`${interruption} on an Event contact does not select it`, async ({
    page
  }) => {
    await page.goto("/graph/demo");
    const point = page.locator('[data-event-point-id="event:founding"]');
    await expect(point).toBeVisible();
    await point.evaluate(async (node, type) => {
      const stage = document.querySelector<HTMLElement>(
        '[data-testid="graph-stage"]'
      )!;
      const capture = stage.setPointerCapture;
      stage.setPointerCapture = () => {};
      const bounds = node.getBoundingClientRect();
      const input = {
        bubbles: true,
        pointerId: 4242,
        pointerType: "touch",
        clientX: bounds.x + bounds.width / 2,
        clientY: bounds.y + bounds.height / 2
      };
      try {
        node.dispatchEvent(
          new PointerEvent("pointerdown", { ...input, buttons: 1 })
        );
        await new Promise(requestAnimationFrame);
        stage.dispatchEvent(new PointerEvent(type, { ...input, buttons: 0 }));
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      } finally {
        stage.setPointerCapture = capture;
      }
    }, interruption);
    await expect(page.getByTestId("event-drawer-sheet")).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("gsEvent")).toBeNull();
    // A canceled contact must also leave the following genuine tap usable.
    await point.click();
    await expect(page.getByTestId("event-drawer-sheet")).toBeVisible();
  });
}

test("a pointer burst reads stage layout once and preserves the final pan", async ({
  page
}) => {
  await page.goto("/graph/demo");
  const point = page.locator('[data-event-point-id="event:capital"]');
  await expect(point).toBeVisible();
  const before = await point.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move(65, 510);
  await page.evaluate(() => {
    document.addEventListener(
      "pointerdown",
      (event) => {
        (
          window as typeof window & { __batchPointerId?: number }
        ).__batchPointerId = event.pointerId;
      },
      { once: true, capture: true }
    );
  });
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
        // Use the browser-assigned pointer ID. All events arrive in one task,
        // before the next paint, just like a high-frequency input burst.
        for (let i = 1; i <= 20; i++)
          stage.dispatchEvent(
            new PointerEvent("pointermove", {
              bubbles: true,
              pointerId: (
                window as typeof window & { __batchPointerId?: number }
              ).__batchPointerId!,
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
