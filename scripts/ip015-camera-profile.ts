/** One five-step read-only CPU/working-set sample; not device GPU evidence. */
import { webkit, devices } from "@playwright/test";
import { writeFile } from "node:fs/promises";
type Inspection = {
  view: Record<string, number>;
  liveView?: Record<string, number>;
  sceneJobs?: { pending: number };
  workerJobs?: { running: number; pending: number };
  loadState?: string;
  counts: Record<string, number>;
  hullCache: Record<string, number>;
  work: Record<string, number>;
  phaseTiming: Record<string, { calls: number; totalMs: number }>;
};
const base = process.env.PUBLIC_INTEGRATION_URL ?? "http://127.0.0.1:3000";
const browser = await webkit.launch();
const context = await browser.newContext({
  ...devices["iPhone 14"],
  ...(base.includes("127.0.0.1")
    ? {}
    : { proxy: { server: process.env.HTTPS_PROXY! } })
});
await context.addInitScript("globalThis.__name = (fn) => fn");
const page = await context.newPage();
if (base.includes("127.0.0.1")) {
  const upstream = await browser.newContext({
    proxy: { server: process.env.HTTPS_PROXY! }
  });
  await page.route(/\/graph\/v5\/(shell|render)/, async (route) => {
    const response = await upstream.request.fetch(
      "https://moirai-production-8ed1.up.railway.app" +
        new URL(route.request().url()).pathname,
      {
        method: route.request().method(),
        data: route.request().postData() ?? undefined,
        headers: { "content-type": "application/json" }
      }
    );
    await route.fulfill({ response });
  });
}
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(
  `${base}/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&gsProfile=1${process.env.IP015_VIEW ? "&gsViewport=" + process.env.IP015_VIEW : ""}`
);
await page.waitForSelector("[data-testid=geographic-webgl]");
await page.waitForTimeout(2500);
// Eventual scenes must settle before the next independent gesture phase.
// The baseline inspector lacks liveView and retains the original fixed wait.
const waitStable = () =>
  page.waitForFunction(
    () => {
      let state: Inspection | undefined;
      addEventListener(
        "moirai:graph-inspection",
        (event: Event) => {
          state = (event as CustomEvent<Inspection>).detail;
        },
        { once: true }
      );
      dispatchEvent(new Event("moirai:inspect-graph"));
      if (!state) return false;
      if (!state.liveView) return true;
      return (
        Object.keys(state.view).every(
          (key) => state!.view[key] === state!.liveView![key]
        ) &&
        !state.sceneJobs?.pending &&
        !state.workerJobs?.running &&
        !state.workerJobs?.pending &&
        !state.counts.stageActive &&
        state.loadState === "ready"
      );
    },
    undefined,
    { timeout: 20000 }
  );
await waitStable();
const inspect = () =>
  page.evaluate(() => {
    let data: Inspection | undefined;
    addEventListener(
      "moirai:graph-inspection",
      (event: Event) => (data = (event as CustomEvent<Inspection>).detail),
      { once: true }
    );
    dispatchEvent(new Event("moirai:inspect-graph"));
    if (!data) throw Error("graph_inspection_unavailable");
    const canvas = document.querySelector(
      "[data-testid=geographic-webgl]"
    ) as HTMLElement;
    return { ...data, gpu: { ...canvas?.dataset } };
  });
const samples: {
  phase: string;
  state?: Inspection;
  start?: Inspection;
  immediate?: Inspection;
  settled?: Inspection;
  frames?: number[];
}[] = [{ phase: "initial", state: await inspect() }];
for (const phase of [
  "initial-pan",
  "zoom-in",
  "zoomed-pan",
  "zoom-out",
  "post-out-pan"
]) {
  const start = await inspect();
  const frames = await page.evaluate(async (phase) => {
    const stage = document.querySelector(
      "[data-testid=graph-stage]"
    ) as HTMLElement;
    stage.setPointerCapture = () => {};
    stage.releasePointerCapture = () => {};
    stage.hasPointerCapture = () => false;
    const box = stage.getBoundingClientRect();
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    const pinch = phase === "zoom-in" || phase === "zoom-out";
    const out = phase === "zoom-out";
    const send = (type: string, id: number, px: number, py: number) =>
      stage.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: id,
          pointerType: "touch",
          clientX: px,
          clientY: py,
          buttons: type === "pointerup" ? 0 : 1
        })
      );
    const distance = (t: number) => (out ? 120 - 80 * t : 40 + 80 * t);
    send(
      "pointerdown",
      81,
      pinch ? x - distance(0) : x,
      pinch ? y - distance(0) : y - 50
    );
    if (pinch) send("pointerdown", 82, x + distance(0), y + distance(0));
    const intervals: number[] = [];
    let last = performance.now();
    for (let i = 1; i <= 24; i++) {
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      intervals.push(now - last);
      last = now;
      send(
        "pointermove",
        81,
        pinch
          ? x - distance(i / 24)
          : x + 30 * Math.sin((i / 24) * Math.PI * 2),
        pinch ? y - distance(i / 24) : y - 50
      );
      if (pinch)
        send("pointermove", 82, x + distance(i / 24), y + distance(i / 24));
    }
    send("pointerup", 81, x, y);
    if (pinch) send("pointerup", 82, x, y);
    return intervals;
  }, phase);
  const immediate = await inspect();
  await page.waitForTimeout(1200);
  await waitStable();
  samples.push({ phase, start, immediate, settled: await inspect(), frames });
}
await writeFile(
  process.env.IP015_OUTPUT ?? "/tmp/ip015-profile.json",
  JSON.stringify({ base, samples, errors }, null, 2)
);
console.log(
  samples.map((s) => ({
    phase: s.phase,
    counts: (s.settled ?? s.state)!.counts,
    hullCache: (s.settled ?? s.state)!.hullCache,
    work: (s.settled ?? s.state)!.work,
    phaseTiming: (s.settled ?? s.state)!.phaseTiming
  }))
);
await browser.close();
