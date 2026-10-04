import { expect, test } from "@playwright/test";

test("steady pan uses current Composite label coordinates without a second paint-state commit", async ({
  page
}) => {
  await page.goto("/graph/demo");
  const hull = page.locator('path[data-region-id="region:early-joseon"]');
  await expect(hull).toBeVisible();
  await page.waitForTimeout(300);
  const idleCommits = await page.evaluate(async () => {
    const inspect = () => {
      let commits: number | undefined;
      const listener = (event: Event) => {
        commits = (event as CustomEvent).detail.work.commits;
      };
      addEventListener("moirai:graph-inspection", listener, { once: true });
      dispatchEvent(new Event("moirai:inspect-graph"));
      removeEventListener("moirai:graph-inspection", listener);
      if (commits === undefined)
        throw new Error("Graph inspection is unavailable");
      return commits;
    };
    const before = inspect();
    for (let frame = 0; frame < 15; frame++)
      await new Promise(requestAnimationFrame);
    return inspect() - before;
  });
  expect(idleCommits).toBe(0);
  const original = await hull.elementHandle();
  await page.mouse.move(65, 510);
  await page.evaluate(() => {
    addEventListener(
      "pointerdown",
      (event) => {
        (window as unknown as { paintPointer: number }).paintPointer =
          event.pointerId;
      },
      { once: true, capture: true }
    );
  });
  await page.mouse.down();
  const result = await page
    .getByTestId("graph-stage")
    .evaluate(async (stage) => {
      const frame = () => new Promise(requestAnimationFrame);
      const inspect = () => {
        let state: { work: Record<string, number> } | undefined;
        const listener = (event: Event) => {
          state = (event as CustomEvent).detail;
        };
        addEventListener("moirai:graph-inspection", listener, { once: true });
        dispatchEvent(new Event("moirai:inspect-graph"));
        removeEventListener("moirai:graph-inspection", listener);
        if (!state) throw new Error("Graph inspection is unavailable");
        return state.work;
      };
      await frame();
      await frame();
      const before = inspect();
      for (let step = 1; step <= 50; step++) {
        // A small camera change keeps this fixture's paint membership stable.
        stage.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerId: (window as unknown as { paintPointer: number })
              .paintPointer,
            pointerType: "mouse",
            buttons: 1,
            clientX: 65 + step / 25,
            clientY: 510
          })
        );
        await frame();
        await frame();
      }
      return { before, after: inspect() };
    });
  await page.mouse.up();
  const delta = (key: string) => result.after[key]! - result.before[key]!;
  expect(delta("viewportBatches")).toBe(50);
  expect(delta("staleSemanticRegionPasses")).toBe(0);
  expect(delta("compositeFrameTicks")).toBe(0);
  // Allow independent viewport response/label lifecycle commits. A copied
  // Composite state on every camera frame would require at least100 commits.
  expect(delta("commits")).toBeLessThanOrEqual(78);
  expect(
    await hull.evaluate((node, previous) => node === previous, original)
  ).toBe(true);
});
