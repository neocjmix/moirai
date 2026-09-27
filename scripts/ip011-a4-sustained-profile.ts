/** Additional R3 gate, not a replacement for the original native-input profile.
 * One browser document; 30 data-bearing areas via browser history + native pans.
 * 600 continuous moves at each checkpoint use a native captured mouse contact
 * and RAF-driven PointerEvents (explicitly hybrid, not real-device touch).
 */
import { devices, webkit, type Page } from "@playwright/test";

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
type Inspection = {
  revision: number;
  view: { x: number; y: number; scaleX: number; scaleY: number };
  viewportSize: { width: number; height: number };
  navigationBounds: Bounds;
  loadState: string;
  activeIds: { points: string[]; regions: string[]; edges: string[] };
  geometry: unknown[];
  counts: Record<string, number>;
  cache: Record<string, number>;
  work: Record<string, number>;
};
const failures: string[] = [];
const visits: unknown[] = [];
const checkpoints: unknown[] = [];
const returnStates: unknown[] = [];
const network: { bbox: unknown; status: number; bytes: number }[] = [];
const pendingBodies: Promise<void>[] = [];
const p95 = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] ??
  Infinity;
const baseURL = process.env.PUBLIC_INTEGRATION_URL ?? "http://127.0.0.1:3000";
const world = process.env.A4_WORLD_ID ?? "019f5000-1300-7000-8000-000000000001";
const browser = await webkit.launch();
let viewportRequest: Record<string, unknown> | undefined;

async function inspect(page: Page): Promise<Inspection> {
  return page.evaluate(() => {
    let value: unknown;
    const listener = (event: Event) => {
      value = (event as CustomEvent).detail;
    };
    window.addEventListener("moirai:graph-inspection", listener, {
      once: true
    });
    window.dispatchEvent(new Event("moirai:inspect-graph"));
    window.removeEventListener("moirai:graph-inspection", listener);
    if (!value) throw Error("graph_inspection_missing");
    return value as Inspection;
  });
}
async function settled(page: Page) {
  // Includes debounce, release spring and opacity transitions; outside the
  // active-frame sampler. The sampler itself never waits for network idle.
  await page.waitForTimeout(400);
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await inspect(page);
    if (state.loadState === "error") throw Error("viewport_load_error");
    if (
      state.loadState === "ready" &&
      state.cache.pending === 0 &&
      state.counts.exitingRegions === 0
    )
      return state;
    await page.waitForTimeout(100);
  }
  throw Error("viewport_did_not_settle");
}
function checkBounds(state: Inspection, name: string) {
  const c = state.cache;
  if (
    c.entries! > c.maxEntries! ||
    c.bytes! > c.maxBytes! ||
    c.pending! > c.maxPending!
  )
    failures.push(`${name}:cache_bound`);
  if (state.counts.exitingRegions !== 0)
    failures.push(`${name}:uncollected_exit`);
}
async function restore(page: Page, href: string) {
  await page.evaluate((url) => {
    history.pushState(history.state, "", url);
    dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  }, href);
  return settled(page);
}
async function sample(page: Page, name: string) {
  const before = await settled(page);
  await page.mouse.move(65, 510);
  await page.evaluate(() => {
    const w = window as typeof window & {
      __a4Contact?: { id: number; target: Element };
    };
    document.addEventListener(
      "pointerdown",
      (event) => {
        w.__a4Contact = {
          id: event.pointerId,
          target: document.querySelector('[data-testid="graph-stage"]')!
        };
      },
      { once: true, capture: true }
    );
    const timing = {
      intervals: [] as number[],
      last: performance.now(),
      frame: 0
    };
    const tick = (now: number) => {
      timing.intervals.push(now - timing.last);
      timing.last = now;
      timing.frame = requestAnimationFrame(tick);
    };
    timing.frame = requestAnimationFrame(tick);
    (window as typeof window & { __a4Whole?: typeof timing }).__a4Whole =
      timing;
  });
  await page.mouse.down();
  const frames = await page.evaluate(async () => {
    const contact = (
      window as typeof window & {
        __a4Contact?: { id: number; target: Element };
      }
    ).__a4Contact;
    if (!contact) throw Error("native_contact_missing");
    const intervals: number[] = [];
    let previous = performance.now();
    for (let i = 0; i < 602; i++) {
      const now = await new Promise<number>(requestAnimationFrame);
      intervals.push(now - previous);
      previous = now;
      // Every measured frame advances the held pointer, including the first
      // and last transitions. No idle-filled 600-frame window.
      const phase = ((i % 120) / 120) * Math.PI * 2;
      contact.target.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: contact.id,
          pointerType: "mouse",
          buttons: 1,
          clientX: 65 + 35 * Math.sin(phase),
          clientY: 510 + 55 * Math.sin(phase)
        })
      );
    }
    return intervals;
  });
  await page.mouse.up();
  const after = await settled(page);
  const whole = await page.evaluate(() => {
    const timing = (
      window as typeof window & {
        __a4Whole?: { intervals: number[]; frame: number };
      }
    ).__a4Whole!;
    cancelAnimationFrame(timing.frame);
    return timing.intervals;
  });
  checkBounds(after, name);
  const result = {
    name,
    intervals: frames,
    p95_ms: p95(frames),
    max_ms: Math.max(...frames),
    whole_intervals: whole,
    whole_p95_ms: p95(whole),
    whole_max_ms: Math.max(...whole),
    before,
    after,
    dom_nodes: await page.locator("*").count(),
    work_delta: Object.fromEntries(
      Object.keys(after.work).map((key) => [
        key,
        after.work[key]! - before.work[key]!
      ])
    )
  };
  checkpoints.push(result);
  if (frames.length < 600 || result.p95_ms > 33.4 || result.max_ms > 100)
    failures.push(`${name}:frames`);
  if (result.whole_p95_ms > 33.4 || result.whole_max_ms > 100)
    failures.push(`${name}:whole_frames`);
  if (result.work_delta.pointTransforms! === 0)
    failures.push(`${name}:ineffective_pan`);
  return result;
}

try {
  const context = await browser.newContext({
    ...devices["iPhone 14"],
    baseURL
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`page_error:${error.message}`));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname !== "/graph/v5/shell") return;
    const body = response.request().postDataJSON() as Record<string, unknown>;
    if (body.kind !== "viewport") return;
    viewportRequest = body;
    pendingBodies.push(
      (async () => {
        try {
          network.push({
            bbox: body.viewport,
            status: response.status(),
            bytes: (await response.body()).byteLength
          });
        } catch {
          network.push({
            bbox: body.viewport,
            status: response.status(),
            bytes: -1
          });
        }
      })()
    );
  });
  await page.goto(`/graph/v5?world=${world}`, {
    waitUntil: "domcontentloaded"
  });
  await page
    .locator("[data-event-point-id]")
    .first()
    .waitFor({ state: "visible" });
  const initial = await settled(page);
  if (!viewportRequest) throw Error("viewport_request_missing");
  // Query the synthetic fixture once outside the page/cache to choose 30 real,
  // data-bearing neighborhoods. This is setup, not a profiled reader request.
  const setup = await context.request.post("/graph/v5/shell", {
    data: {
      ...viewportRequest,
      viewport: {
        ...(viewportRequest.viewport as object),
        bbox: initial.navigationBounds
      }
    }
  });
  if (!setup.ok()) throw Error("fixture_neighborhood_query_failed");
  const fixture = (await setup.json()) as {
    regions: { id: string; worldBounds: Bounds }[];
  };
  const regions = fixture.regions
    .sort((a, b) => a.worldBounds.minY - b.worldBounds.minY)
    .slice(0, 30);
  if (regions.length !== 30)
    throw Error(`need_30_region_neighborhoods:${regions.length}`);
  const baselineUrl = new URL(page.url());
  const targetUrl = (region: (typeof regions)[number], scale = 1) => {
    const next = new URL(baselineUrl);
    const b = region.worldBounds;
    next.searchParams.set(
      "gsViewport",
      [
        (b.minX + b.maxX) / 2,
        (b.minY + b.maxY) / 2,
        initial.viewportSize.width / scale,
        initial.viewportSize.height / scale
      ].join(",")
    );
    return next.href;
  };
  const home = targetUrl(regions[0]!);
  const start = await restore(page, home);
  const startDom = await page.locator("*").count();
  await sample(page, "start");
  // Two different routes; checkpoint at the same exact home camera, not at a
  // newly loaded page. Each destination is visited and returned from.
  const order = [
    ...Array.from({ length: 15 }, (_, i) => i + 1),
    ...Array.from({ length: 14 }, (_, i) => 29 - i),
    0
  ];
  const seen = new Set<string>();
  for (let i = 0; i < order.length; i++) {
    const region = regions[order[i]!]!;
    await restore(page, targetUrl(region, i % 5 === 0 ? 1.2 : 1));
    await page.mouse.move(65, 510);
    await page.mouse.down();
    await page.mouse.move(35, 460, { steps: 20 });
    await page.mouse.up();
    const state = await settled(page);
    checkBounds(state, `visit_${i}`);
    seen.add(region.id);
    if (!state.activeIds.points.length && !state.activeIds.regions.length)
      failures.push(`visit_${i}:empty`);
    visits.push({
      index: i,
      target: region.id,
      state,
      dom_nodes: await page.locator("*").count()
    });
    const returned = await restore(page, home);
    returnStates.push({
      index: i,
      state: returned,
      dom_nodes: await page.locator("*").count()
    });
    checkBounds(returned, `return_${i}`);
    if (JSON.stringify(returned.activeIds) !== JSON.stringify(start.activeIds))
      failures.push(`return_${i}:active_ids`);
    if (JSON.stringify(returned.geometry) !== JSON.stringify(start.geometry))
      failures.push(`return_${i}:geometry`);
    if (i === 14) await sample(page, "middle");
  }
  if (seen.size !== 30) failures.push("distinct_neighborhoods");
  const final = await restore(page, home);
  if (JSON.stringify(final.view) !== JSON.stringify(start.view))
    failures.push("return_camera");
  if (final.revision !== start.revision) failures.push("return_revision");
  if (final.counts.projectedPoints! > start.counts.projectedPoints!)
    failures.push("return_projection_growth");
  for (const key of ["sourceEntities", "sourceRegions", "sourceEdges"])
    if (final.counts[key]! > start.counts[key]!)
      failures.push(`return_${key}_growth`);
  const finalDom = await page.locator("*").count();
  if (finalDom > startDom) failures.push("return_dom_growth");
  await sample(page, "return");
  // Toggle after the no-reset history test so a loader replacement cannot hide
  // growth from the preceding 30 visits.
  await page.getByRole("button", { name: "소스 쿼리 열기" }).first().click();
  await page.getByText("탐색 범위와 시간 기준", { exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: "a", exact: true });
  await checkbox.scrollIntoViewIfNeeded();
  await checkbox.uncheck();
  const off = await settled(page);
  if (Object.values(off.activeIds).some((ids) => ids.length))
    failures.push("all_off_not_empty");
  await checkbox.check();
  await page.getByRole("button", { name: "소스 쿼리 접기" }).click();
  const toggled = await restore(page, home);
  if (JSON.stringify(toggled.activeIds) !== JSON.stringify(start.activeIds))
    failures.push("toggle_restore_ids");
  if (JSON.stringify(toggled.geometry) !== JSON.stringify(start.geometry))
    failures.push("toggle_restore_geometry");
  await Promise.all(pendingBodies);
  await context.close();
} catch (error) {
  failures.push(`measurement_error:${String(error)}`);
} finally {
  await browser.close();
}
process.stdout.write(
  JSON.stringify({
    device: "iPhone 14 WebKit emulation, no throttling",
    interaction:
      "history navigation and native pans; continuous RAF moves on native captured contact (hybrid)",
    heap: "unmeasured: WebKit has no comparable exposed heap counter",
    visits,
    returns: returnStates,
    checkpoints,
    network,
    failures
  }) + "\n"
);
if (failures.length) process.exitCode = 1;
