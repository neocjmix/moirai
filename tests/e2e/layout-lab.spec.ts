import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { LabPreset } from "../../apps/atropos-web/src/labs/layout/preset";

const beforeName = "A · before research geometry";
const afterName = "B · candidate research geometry";

async function openSection(page: Page, name: string) {
  const section = page.locator("details").filter({
    has: page.locator("summary", { hasText: name })
  });
  if (!(await section.evaluate((node) => (node as HTMLDetailsElement).open)))
    await section.locator("summary").click();
}

async function readPreset(page: Page): Promise<LabPreset> {
  await openSection(page, "Preset save / load / export");
  await page.getByRole("button", { name: "JSON 보기", exact: true }).click();
  return JSON.parse(
    await page.getByRole("textbox", { name: "Preset JSON" }).inputValue()
  ) as LabPreset;
}

async function ready(page: Page) {
  await page.goto("/labs/layout?demo=1");
  await expect(
    page.getByRole("heading", { name: "Composite & Layout Lab" })
  ).toBeVisible();
  await expect(page.getByTestId("lab-computation")).toContainText(
    "local compute"
  );
  await expect(
    page.getByRole("img", { name: beforeName }).locator("g[data-event-id]")
  ).toHaveCount(173);
  await page.waitForLoadState("networkidle");
}

async function coordinates(page: Page, name: string) {
  return page
    .getByRole("img", { name })
    .locator("g[data-event-id]")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        id: node.getAttribute("data-event-id"),
        points: [...node.querySelectorAll("circle")].map((point) => [
          point.getAttribute("cx"),
          point.getAttribute("cy")
        ]),
        hull: node.querySelector("path")?.getAttribute("d"),
        line: [...node.querySelectorAll("line")].map((line) =>
          ["x1", "x2", "y1", "y2"].map((key) => line.getAttribute(key))
        )
      }))
    );
}

test("research controls recompute locally, retain algorithm-specific values, and share one camera", async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      ["fetch", "xhr"].includes(request.resourceType()) ||
      !["GET", "HEAD"].includes(request.method())
    )
      requests.push(`${request.method()} ${request.url()}`);
  });
  const initial = await readPreset(page);
  expect(await coordinates(page, beforeName)).toEqual(
    await coordinates(page, afterName)
  );

  await page.getByRole("button", { name: "x zoom in", exact: true }).click();
  const xZoom = await readPreset(page);
  expect(xZoom.camera.spanX).toBeCloseTo(initial.camera.spanX * 0.7);
  expect(xZoom.camera.spanY).toBe(initial.camera.spanY);
  expect(await coordinates(page, beforeName)).toEqual(
    await coordinates(page, afterName)
  );
  await page.getByRole("button", { name: "y zoom in", exact: true }).click();
  const xyZoom = await readPreset(page);
  expect(xyZoom.camera.spanX).toBe(xZoom.camera.spanX);
  expect(xyZoom.camera.spanY).toBeCloseTo(initial.camera.spanY * 0.7);
  await page.getByRole("button", { name: "x zoom out", exact: true }).click();
  await page.getByRole("button", { name: "y zoom out", exact: true }).click();
  const restoredCamera = (await readPreset(page)).camera;
  expect(restoredCamera.spanX).toBeCloseTo(initial.camera.spanX);
  expect(restoredCamera.spanY).toBeCloseTo(initial.camera.spanY);

  const wheel = async () => {
    const scene = page.getByRole("img", { name: beforeName });
    await scene.scrollIntoViewIfNeeded();
    // Mobile WebKit does not expose hardware wheel input; exercise the policy
    // handler while real tap/button input above verifies the mobile controls.
    await scene.dispatchEvent("wheel", { deltaY: 100 });
  };
  await wheel();
  const outward = (await readPreset(page)).camera;
  expect(outward.spanX).toBeGreaterThan(restoredCamera.spanX);
  expect(outward.spanY).toBeGreaterThan(restoredCamera.spanY);
  await page.getByRole("checkbox", { name: "휠 줌 방향 반전" }).check();
  await wheel();
  const reversed = (await readPreset(page)).camera;
  expect(reversed.spanX).toBeCloseTo(restoredCamera.spanX);
  expect(reversed.spanY).toBeCloseTo(restoredCamera.spanY);
  await page
    .getByRole("button", { name: "XY 왕복 sweep", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "중지", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "중지", exact: true })
  ).toHaveCount(0, { timeout: 10_000 });
  const sweepCamera = (await readPreset(page)).camera;
  expect(sweepCamera).toEqual(reversed);

  await page
    .getByRole("spinbutton", { name: "Iterations value", exact: true })
    .fill("12");
  await expect(page.getByTestId("lab-computation")).toContainText(
    "local compute"
  );
  await page
    .getByRole("combobox", { name: "Layout algorithm", exact: true })
    .selectOption("deterministic-slots");
  await expect(
    page.getByRole("spinbutton", { name: "Iterations value", exact: true })
  ).toHaveCount(0);
  await page
    .getByRole("spinbutton", {
      name: "Slot spacing (world units) value",
      exact: true
    })
    .fill("170");
  await expect(page.getByTestId("lab-computation")).toContainText(
    "deterministic-slots@1"
  );
  await expect(page.getByTestId("lab-computation")).toContainText(
    "local compute"
  );
  const candidate = await coordinates(page, afterName);
  expect(candidate).not.toEqual(await coordinates(page, beforeName));

  await openSection(page, "Collection visibility");
  await page.getByRole("checkbox", { name: /^Primary process/ }).uncheck();
  expect(await coordinates(page, afterName)).toEqual(candidate);
  await openSection(page, "B Composite representation");
  await page.getByRole("checkbox", { name: "Labels", exact: true }).uncheck();
  await page
    .getByRole("slider", { name: "Hull → point (px)", exact: true })
    .fill("64");
  expect(await coordinates(page, afterName)).toEqual(candidate);
  const tuned = await readPreset(page);
  expect(tuned.snapshot).toEqual(initial.snapshot);
  expect(tuned.camera).toEqual(sweepCamera);
  expect(tuned.activeCollectionIds).not.toContain("lab-primary");

  await page
    .getByRole("combobox", { name: "Layout algorithm", exact: true })
    .selectOption("legacy-force");
  await expect(
    page.getByRole("spinbutton", { name: "Iterations value", exact: true })
  ).toHaveValue("12");
  await page
    .getByRole("combobox", { name: "Layout algorithm", exact: true })
    .selectOption("deterministic-slots");
  await expect(
    page.getByRole("spinbutton", {
      name: "Slot spacing (world units) value",
      exact: true
    })
  ).toHaveValue("170");
  await expect(page.getByTestId("lab-computation")).toContainText(
    "local compute"
  );
  await page.getByRole("button", { name: "B → A 고정", exact: true }).click();
  expect(await coordinates(page, beforeName)).toEqual(
    await coordinates(page, afterName)
  );
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  await page.getByRole("img", { name: beforeName }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("layout-lab-mobile-comparison.png")
  });
});

test("local save and JSON export/import restore immutable input, camera, visibility and hysteresis", async ({
  page
}, info) => {
  await ready(page);
  await page.getByRole("button", { name: "both zoom in", exact: true }).click();
  await openSection(page, "B Composite representation");
  await page
    .getByRole("slider", { name: "Compact hysteresis (px)", exact: true })
    .fill("35");
  await page
    .getByRole("checkbox", { name: "Relations", exact: true })
    .uncheck();
  await openSection(page, "Collection visibility");
  await page
    .getByRole("checkbox", { name: /^Overlapping selection/ })
    .uncheck();
  const saved = await readPreset(page);
  const savedGeometry = await coordinates(page, afterName);
  expect(Object.keys(saved.history.after).length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "로컬 저장", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON export", exact: true }).click();
  const download = await downloadPromise;
  const exportPath = info.outputPath("layout-lab-export.json");
  await download.saveAs(exportPath);
  expect(JSON.parse(await readFile(exportPath, "utf8"))).toEqual(saved);

  await page.getByRole("button", { name: "B 기본값", exact: true }).click();
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  await page.getByRole("button", { name: "모두 끄기", exact: true }).click();
  await page.getByRole("button", { name: "로컬 복원", exact: true }).click();
  await expect(page.locator(".lab-status")).toContainText("복원 완료:");
  expect(await readPreset(page)).toEqual(saved);
  expect(await coordinates(page, afterName)).toEqual(savedGeometry);

  // Import remains self-contained after a page reload without local storage.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setViewportSize({ width: 414, height: 896 });
  await expect(page.getByTestId("lab-computation")).toContainText(
    "local compute"
  );
  await openSection(page, "Preset save / load / export");
  await page.getByLabel("JSON 파일 import").setInputFiles(exportPath);
  await expect(page.locator(".lab-status")).toContainText("복원 완료:");
  expect(await readPreset(page)).toEqual(saved);
  expect(await coordinates(page, afterName)).toEqual(savedGeometry);
});

test("mobile tap selects a visible Event and controls stay within the viewport", async ({
  page
}, info) => {
  await ready(page);
  await openSection(page, "Event / Composite 관찰");
  await page
    .getByRole("combobox", { name: "Focus Event", exact: true })
    .selectOption("sparse");
  const focused = await readPreset(page);
  await page.getByRole("button", { name: "JSON 복원", exact: true }).click();
  await expect(page.locator(".lab-status")).toContainText("복원 완료:");
  await expect(
    page.getByRole("combobox", { name: "Focus Event", exact: true })
  ).toHaveValue("");
  await page
    .getByRole("img", { name: afterName })
    .locator('g[data-event-id="sparse"] circle')
    .last()
    .tap();
  await expect(
    page.getByRole("combobox", { name: "Focus Event", exact: true })
  ).toHaveValue("sparse");
  expect((await readPreset(page)).camera).toEqual(focused.camera);

  for (const name of [
    "B Composite representation",
    "Collection visibility",
    "Event / Composite 관찰"
  ])
    await openSection(page, name);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page
    .getByRole("heading", { name: "Composite & Layout Lab" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("layout-lab-mobile-overview.png")
  });
});

test("mobile pinned comparison stays visible while tuning and preserves its viewport across A/B", async ({
  page
}, info) => {
  await ready(page);
  const initial = await readPreset(page);
  await page
    .getByRole("checkbox", { name: "조절 중 비교 화면 고정 (모바일 A/B 전환)" })
    .check();
  await expect(page.getByRole("img", { name: afterName })).toBeVisible();
  await expect(page.getByRole("img", { name: beforeName })).toBeHidden();
  await page
    .getByRole("spinbutton", { name: "Iterations value", exact: true })
    .fill("10");
  await expect(page.getByTestId("lab-computation")).toContainText(
    "local compute"
  );
  await page
    .getByRole("spinbutton", { name: "Iterations value", exact: true })
    .scrollIntoViewIfNeeded();
  const box = (await page.getByRole("img", { name: afterName }).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThan(page.viewportSize()!.height);
  await page.getByRole("button", { name: "A 보기", exact: true }).click();
  await expect(page.getByRole("img", { name: beforeName })).toBeVisible();
  await expect(page.getByRole("img", { name: afterName })).toBeHidden();
  await page.getByRole("button", { name: "B 보기", exact: true }).click();
  const tuned = await readPreset(page);
  expect(tuned.parameters.iterations).toBe(10);
  expect(tuned.viewport).toEqual(initial.viewport);
  expect(tuned.camera).toEqual(initial.camera);
  expect(tuned.snapshot).toEqual(initial.snapshot);
  await page
    .getByRole("spinbutton", { name: "Iterations value", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("layout-lab-mobile-pinned-controls.png")
  });
});
