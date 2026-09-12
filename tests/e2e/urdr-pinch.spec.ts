import { expect, test } from "@playwright/test";

test("WebKit active-pointer pinch preserves the original viewport zoom path", async ({
  page
}) => {
  await page.goto("/graph/demo");
  await expect(
    page.locator('[data-event-point-id="event:founding"]')
  ).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
    .not.toBeNull();
  const before = new URL(page.url()).searchParams
    .get("gsViewport")!
    .split(",")
    .map(Number);
  // WebKit's public automation API exposes one native touch. Combine it with
  // a held native mouse pointer, then move that active touch in the DOM event
  // stream. Pointer capture and the application's handlers are not replaced.
  // This is two-pointer integration coverage, not a physical iPhone test.
  await page.evaluate(() => {
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType !== "touch") return;
        const target = event.target as Element;
        target.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerId: event.pointerId,
            pointerType: "touch",
            clientX: event.clientX + 70,
            clientY: event.clientY + 70,
            buttons: 1,
            isPrimary: event.isPrimary
          })
        );
      },
      { once: false }
    );
  });
  await page.mouse.move(25, 350);
  await page.mouse.down();
  await page.touchscreen.tap(290, 550);
  await page.mouse.up();
  await expect
    .poll(() => {
      const value = new URL(page.url()).searchParams
        .get("gsViewport")!
        .split(",")
        .map(Number);
      return value[2]! < before[2]! && value[3]! < before[3]!;
    })
    .toBe(true);
  await expect(page.getByTestId("event-drawer-sheet")).toHaveCount(0);
});
