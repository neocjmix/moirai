/** Live iPhone 14 WebKit observations for the restored Atropos graph. */
import { performance } from "node:perf_hooks";
import { devices, webkit, type Response } from "@playwright/test";

const baseURL =
  process.env.PUBLIC_INTEGRATION_URL ??
  "https://moirai-production-8ed1.up.railway.app";
const worldId = "01995c2a-7b00-7000-8000-000000000101";
const url = `/graph/v5?world=${worldId}`;
const p95 = (values: number[]) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!
    : Infinity;
const browser = await webkit.launch();
const navigations: {
  graph_ready_ms: number;
  drawer_ms: number;
  html_bytes: number;
  graph_response_bytes: number[];
  errors: string[];
}[] = [];
const gestures: Record<
  string,
  {
    samples: number;
    p95_ms: number;
    max_ms: number;
    dom_nodes: number;
    long_frames: { index: number; ms: number }[];
  }
> = {};
const failures: string[] = [];

try {
  for (let index = 0; index < 20; index++) {
    const context = await browser.newContext({
      ...devices["iPhone 14"],
      baseURL
    });
    const page = await context.newPage();
    const errors: string[] = [];
    const graphResponses: Response[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      const path = new URL(response.url()).pathname;
      if (path === "/graph/v5/shell")
        graphResponses.push(response);
    });
    const started = performance.now();
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    if (!response?.ok()) throw Error("a4_mobile_navigation_failed");
    await page.getByTestId("graph-stage").waitFor({ state: "visible" });
    const first = page.locator("[data-event-point-id]").first();
    await first.waitFor({ state: "visible", timeout: 20_000 });
    const graphReadyMs = performance.now() - started;
    const htmlBytes = (await response.body()).byteLength;
    const drawerStarted = performance.now();
    await first.click();
    await page.getByTestId("event-drawer-sheet").waitFor({ state: "visible" });
    const drawerMs = performance.now() - drawerStarted;
    navigations.push({
      graph_ready_ms: +graphReadyMs.toFixed(2),
      drawer_ms: +drawerMs.toFixed(2),
      html_bytes: htmlBytes,
      graph_response_bytes: await Promise.all(
        graphResponses.map(async (graphResponse) => {
          try {
            return (await graphResponse.body()).byteLength;
          } catch (error) {
            errors.push(`graph_response_unreadable:${String(error)}`);
            return 0;
          }
        })
      ),
      errors
    });

    if (index !== 19) {
      await context.close();
      continue;
    }
    await page.getByTestId("event-drawer-close").click();
    const stage = page.getByTestId("graph-stage");
    const bounds = await stage.boundingBox();
    if (!bounds) throw Error("a4_mobile_graph_bounds_missing");
    const pointBefore = await first.boundingBox();
    if (!pointBefore) throw Error("a4_mobile_point_bounds_missing");
    const frameSample = async (name: string, gesture: () => Promise<void>) => {
      const pending = page.evaluate(async () => {
        // Let the sampler's evaluation and the previous UI action settle
        // before counting frames. Gesture work remains inside the 600 samples.
        for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame);
        const intervals: number[] = [];
        let last = performance.now();
        for (let i = 0; i < 600; i++) {
          const now = await new Promise<number>(requestAnimationFrame);
          intervals.push(now - last);
          last = now;
        }
        const longFrames = intervals.flatMap((ms, index) =>
          ms > 33.4 ? [{ index, ms }] : []
        );
        intervals.sort((a, b) => a - b);
        return {
          samples: intervals.length,
          p95_ms: intervals[Math.ceil(intervals.length * 0.95) - 1]!,
          max_ms: intervals.at(-1)!,
          dom_nodes: document.querySelectorAll("*").length,
          long_frames: longFrames.slice(0, 30)
        };
      });
      await page.waitForTimeout(250);
      try {
        await gesture();
      } catch (error) {
        failures.push(`${name}_gesture_error:${String(error)}`);
      }
      try {
        gestures[name] = await pending;
      } catch (error) {
        failures.push(`${name}_frame_error:${String(error)}`);
      }
    };
    await frameSample("pan", async () => {
      // Match the empty-canvas drag used by the URDR mobile regression.
      await page.mouse.move(25, 450);
      await page.mouse.down();
      await page.mouse.move(65, 510, { steps: 20 });
      await page.mouse.up();
    });
    const pointAfter = await first.boundingBox();
    if (!pointAfter || pointAfter.x < pointBefore.x + 30)
      failures.push("pan_ineffective");
    const zoomBefore = new URL(page.url()).searchParams.get("gsViewport");
    await frameSample("zoom", async () => {
      // iPhone WebKit automation has one native touch. Combine it with a
      // held pointer, using the established pinch regression path.
      await page.evaluate(() => {
        document.addEventListener(
          "pointerdown",
          (event) => {
            if (event.pointerType !== "touch") return;
            (event.target as Element).dispatchEvent(
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
    });
    if (new URL(page.url()).searchParams.get("gsViewport") === zoomBefore)
      failures.push("zoom_ineffective");
    await page.getByRole("button", { name: "소스 쿼리 열기" }).first().click();
    await page.getByText("탐색 범위와 시간 기준", { exact: true }).click();
    const checkbox = page.getByRole("checkbox", {
      name: "조선 전기 연표",
      exact: true
    });
    await frameSample("collection_toggle", async () => {
      await checkbox.uncheck();
      await checkbox.check();
    });
    await context.close();
  }
} catch (error) {
  failures.push(`measurement_error:${String(error)}`);
} finally {
  await browser.close();
}

const graphP95 = p95(navigations.map((n) => n.graph_ready_ms));
const drawerP95 = p95(navigations.map((n) => n.drawer_ms));
if (graphP95 > 3000) failures.push("graph_ready_p95");
if (drawerP95 > 1000) failures.push("drawer_p95");
if (navigations.length !== 20) failures.push("navigation_sample_count");
if (navigations.some((n) => n.errors.length)) failures.push("page_error");
if (navigations.some((n) => n.html_bytes > 1048576))
  failures.push("html_bytes");
if (navigations.some((n) => n.graph_response_bytes.some((b) => b > 1048576)))
  failures.push("graph_response_bytes");
for (const [name, sample] of Object.entries(gestures))
  if (sample.samples !== 600 || sample.p95_ms > 33.4 || sample.max_ms > 100)
    failures.push(`${name}_frames`);
for (const name of ["pan", "zoom", "collection_toggle"])
  if (!gestures[name]) failures.push(`${name}_missing`);
process.stdout.write(
  JSON.stringify({
    device: "iPhone 14 WebKit emulation, no throttling",
    world_id: worldId,
    navigations,
    gestures,
    graph_ready_p95_ms: graphP95,
    drawer_p95_ms: drawerP95,
    failures
  }) + "\n"
);
