/** Public/local browser smoke. URL and evidence directory are command arguments. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, devices, type Page } from "@playwright/test";
import type { LayoutOutput } from "../../packages/graph-presentation/src/layout-engine.js";
import type { LabCamera } from "../../apps/atropos-web/src/labs/layout/preset.js";
declare global {
  interface Window {
    readonly moiraiResearch: {
      generation: number;
      busy: boolean;
      camera: LabCamera;
      digest: string;
      selected: string;
      outputs: LayoutOutput[];
      quality: unknown[];
      parameters: { stability: number };
    };
  }
}
const url = process.argv[2] ?? "http://127.0.0.1:8765/",
  dir = resolve(process.argv[3] ?? ".artifacts/layout-smoke");
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const evidence = [];
async function ready(p: Page) {
  await p.waitForFunction(
    () =>
      window.moiraiResearch &&
      !window.moiraiResearch.busy &&
      window.moiraiResearch.outputs.every(Boolean)
  );
  await p.waitForTimeout(100);
  assert(!(await p.locator("#status").innerText()).startsWith("오류:"));
}
for (const [name, options] of [
  ["desktop", { viewport: { width: 1400, height: 1000 }, hasTouch: true }],
  ["mobile-chromium", devices["iPhone 14"]]
] as const) {
  const page = await browser.newPage(options);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto(url, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  await ready(page);
  const state = await page.evaluate(() => window.moiraiResearch);
  const baseline = JSON.stringify(state.outputs),
    oldGeneration = state.generation;
  for (const output of state.outputs) {
    assert.equal(
      new Set(output.shapes.map((s) => s.event_id)).size,
      output.shapes.length
    );
    assert.equal(output.unplaced_event_ids.length, 1);
  }
  assert.deepEqual(
    state.outputs[0]!.shapes.map((s) => s.event_id),
    state.outputs[1]!.shapes.map((s) => s.event_id)
  );
  for (const s of state.outputs[0]!.shapes) {
    const other = state.outputs[1]!.shapes.find(
      (o) => o.event_id === s.event_id
    )!;
    if (s.kind === "point" && other.kind === "point")
      assert.equal(s.position.y, other.position.y);
    if (s.kind === "segment" && other.kind === "segment")
      assert.deepEqual([s.start.y, s.end.y], [other.start.y, other.end.y]);
  }
  await page.locator("#zoomIn").click();
  await page.locator("[data-collection]").first().uncheck();
  await page.locator("#hulls").uncheck();
  await page.locator("#edges").check();
  await page.waitForTimeout(80);
  const navigated = await page.evaluate(() => window.moiraiResearch);
  assert.equal(navigated.generation, oldGeneration);
  assert.equal(JSON.stringify(navigated.outputs), baseline);
  assert(navigated.camera.spanX < state.camera.spanX);
  const canvas = page.locator("#canvas1");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, {
    steps: 3
  });
  await page.mouse.up();
  assert.notEqual(
    (await page.evaluate(() => window.moiraiResearch.camera)).x,
    navigated.camera.x
  );
  // Multi-pointer integration: real touch events through Chromium CDP, not synthetic pointer capture.
  const client = await page.context().newCDPSession(page);
  const touch = [
    { x: box.x + box.width * 0.4, y: box.y + box.height * 0.4 },
    { x: box.x + box.width * 0.7, y: box.y + box.height * 0.7 }
  ];
  const beforePinch = await page.evaluate(() => window.moiraiResearch.camera);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: touch
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: touch[0]!.x - 12, y: touch[0]!.y - 12 },
      { x: touch[1]!.x + 12, y: touch[1]!.y + 12 }
    ]
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });
  assert(
    (await page.evaluate(() => window.moiraiResearch.camera)).spanX <
      beforePinch.spanX
  );
  await page.locator('button[data-period="1592,1600"]').click();
  await page.locator("#search").fill("공유 사건");
  const id = await page.locator("#event option").nth(1).getAttribute("value");
  assert(id);
  await page.locator("#event").selectOption(id);
  assert.equal((await page.evaluate(() => window.moiraiResearch)).selected, id);
  assert((await page.locator("#selection").innerText()).includes("소속:"));
  const savedState = await page.evaluate(() => window.moiraiResearch);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#save").click();
  const download = await downloadPromise;
  const preset = resolve(dir, name + "-preset.json");
  await download.saveAs(preset);
  await page.locator("#zoomOut").click();
  await page.locator("#restore").setInputFiles(preset);
  await page.waitForFunction(
    (n) => window.moiraiResearch.generation > n,
    savedState.generation
  );
  await ready(page);
  assert.deepEqual(
    (await page.evaluate(() => window.moiraiResearch)).camera,
    savedState.camera
  );
  assert.equal(
    JSON.stringify((await page.evaluate(() => window.moiraiResearch)).outputs),
    baseline
  );
  await page.locator("#hulls").check();
  await page.locator("#edges").uncheck();
  await page.locator("#fit").click();
  await page.screenshot({
    path: resolve(dir, name + "-overview.png"),
    fullPage: true
  });
  await page.locator('button[data-period="1592,1600"]').click();
  await page.screenshot({
    path: resolve(dir, name + "-contact.png"),
    fullPage: true
  });
  const beforeIncrement = (await page.evaluate(() => window.moiraiResearch))
    .generation;
  await page.locator("#increment").click();
  await page.waitForFunction(
    (n) => window.moiraiResearch.generation > n,
    beforeIncrement
  );
  await ready(page);
  const added = await page.evaluate(() => window.moiraiResearch);
  assert.equal(
    added.outputs[1]!.shapes.length,
    state.outputs[1]!.shapes.length + 1
  );
  assert((await page.locator("#status").innerText()).includes("p95"));
  const secondDownload = page.waitForEvent("download");
  await page.locator("#save").click();
  const d2 = await secondDownload;
  const addedPreset = resolve(dir, name + "-added.json");
  await d2.saveAs(addedPreset);
  await page.locator("#restore").setInputFiles(addedPreset);
  await page.waitForFunction(
    (n) => window.moiraiResearch.generation > n,
    added.generation
  );
  await ready(page);
  assert.equal(
    JSON.stringify((await page.evaluate(() => window.moiraiResearch)).outputs),
    JSON.stringify(added.outputs)
  );
  const beforeReal = (await page.evaluate(() => window.moiraiResearch))
    .generation;
  await page.locator("#dataset").selectOption("history-r56");
  await page.waitForFunction(
    (n) => window.moiraiResearch.generation > n,
    beforeReal
  );
  await page.waitForFunction(
    (d) => window.moiraiResearch.digest !== d,
    added.digest
  );
  await ready(page);
  const real = await page.evaluate(() => window.moiraiResearch);
  assert.equal(real.selected, "");
  assert(!(await page.locator("#selection").innerText()).includes(id));
  assert.equal(real.outputs[1]!.shapes.length, 539);
  assert.equal(real.outputs[1]!.unplaced_event_ids.length, 0);
  await page.screenshot({
    path: resolve(dir, name + "-history.png"),
    fullPage: true
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth
    ),
    false
  );
  assert.deepEqual(errors, []);
  evidence.push({
    profile: name,
    url,
    http: response?.status(),
    initialEvents: 522,
    realPlaced: 539,
    navigationRecompute: false,
    temporalYStable: true,
    pan: true,
    pinch: true,
    presetRoundTrip: true,
    incrementRoundTrip: true,
    renderErrors: errors,
    limitations:
      "Chromium viewport/touch emulation; not physical iPhone Safari or PWA"
  });
  await page.close();
}
await browser.close();
writeFileSync(
  resolve(dir, "smoke.json"),
  JSON.stringify({ checkedAt: new Date().toISOString(), evidence }, null, 2)
);
console.log(JSON.stringify(evidence));
