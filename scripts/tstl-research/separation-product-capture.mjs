import console from "node:console";
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const out = ".artifacts/tstl-separation/current";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chromium" });
const results = [];
for (const [profile, width, height] of [
  ["desktop", 1280, 800],
  ["mobile", 390, 844]
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: profile === "mobile",
    hasTouch: profile === "mobile"
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const [view, camera] of [
    ["overview", "0,220900,1050,21000"],
    ["imjin", "260,223420,650,1800"],
    ["detail", "280,222950,430,500"]
  ])
    for (const mode of ["B0", "A", "B", "C", "bubble", "ribbon"]) {
      await page.goto(
        "https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=" +
          mode +
          "&gsViewport=" +
          camera,
        { waitUntil: "domcontentloaded" }
      );
      await page.getByTestId("graph-stage").waitFor();
      await page.waitForFunction(
        (mode) => {
          let s;
          const f = (e) => (s = e.detail);
          globalThis.addEventListener("moirai:graph-inspection", f, {
            once: true
          });
          globalThis.dispatchEvent(
            new globalThis.Event("moirai:inspect-graph")
          );
          globalThis.removeEventListener("moirai:graph-inspection", f);
          return (
            s?.loadState === "ready" &&
            s.paintSourceKey === "tstl:" + mode &&
            !s.cache?.pending &&
            !s.sceneJobs?.pending &&
            !s.workerJobs?.running &&
            !s.workerJobs?.pending
          );
        },
        mode,
        { timeout: 60000 }
      );
      await page.waitForTimeout(600);
      const state = await page.evaluate(() => {
        let s;
        const f = (e) => (s = e.detail);
        globalThis.addEventListener("moirai:graph-inspection", f, {
          once: true
        });
        globalThis.dispatchEvent(new globalThis.Event("moirai:inspect-graph"));
        return s;
      });
      await page.screenshot({ path: `${out}/${profile}-${mode}-${view}.png` });
      results.push({
        profile,
        mode,
        view,
        camera,
        state: {
          loadState: state.loadState,
          liveView: state.liveView,
          view: state.view,
          counts: state.counts,
          renderer: state.renderer,
          paintSourceKey: state.paintSourceKey,
          activeIds: state.activeIds
        }
      });
      writeFileSync(
        out + "/captures.json",
        JSON.stringify({ results, errors }, null, 2)
      );
      console.log(profile, mode, view);
    }
  await page.close();
}
await browser.close();
