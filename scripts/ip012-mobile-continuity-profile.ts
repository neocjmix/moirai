/** Repeatable production/browser observation. Hybrid captured-pointer RAF pan,
 * not physical-device evidence. No canonical writes or assertion relaxation. */
import { devices, webkit, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

type Inspection = {
  loadState: string;
  cache: Record<string, number>;
  counts: Record<string, number>;
  [key: string]: unknown;
};
type ProfileWindow = Window & {
  __ip012Contact?: number;
  __ip012Bounds?: { calls: number; totalMs: number; maxMs: number };
};

const baseURL =
  process.env.PUBLIC_INTEGRATION_URL ??
  "https://moirai-production-8ed1.up.railway.app";
const world =
  process.env.IP012_WORLD_ID ?? "01995c2a-7b00-7000-8000-000000000101";
const output =
  process.env.IP012_PROFILE_OUTPUT ?? "/tmp/moirai-continuity-profile.json";
const delay = Number(process.env.IP012_FETCH_DELAY_MS ?? 0);
const visits = Number(process.env.IP012_VISITS ?? 30);
const frames = Number(process.env.IP012_FRAMES ?? 602);
const readyTimeout = Number(process.env.IP012_READY_TIMEOUT_MS ?? 30_000);
const disableBlend = process.env.IP012_DISABLE_BLEND === "1";
const staticControl = process.env.IP012_STATIC_CONTROL === "1";
const profileCpu = process.env.IP012_TIMING === "1";
const measureBounds = process.env.IP012_MEASURE_BOUNDS === "1";
const svgControl = process.env.IP012_SVG_CONTROL ?? "visible";
const hullControl = process.env.IP012_HULL_CONTROL ?? "visible";
const textControl = process.env.IP012_TEXT_CONTROL ?? "visible";
if (!["visible", "hidden", "none"].includes(svgControl))
  throw Error("invalid_svg_control");
if (
  !["visible", "hidden"].includes(hullControl) ||
  !["visible", "hidden"].includes(textControl)
)
  throw Error("invalid_paint_control");
const deviceScaleFactor = process.env.IP012_DEVICE_SCALE_FACTOR
  ? Number(process.env.IP012_DEVICE_SCALE_FACTOR)
  : devices["iPhone 14"].deviceScaleFactor;
const proxy = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
const browser = await webkit.launch();
const context = await browser.newContext({
  ...devices["iPhone 14"],
  deviceScaleFactor,
  baseURL,
  ...(proxy && !baseURL.includes("127.0.0.1")
    ? { proxy: { server: proxy } }
    : {})
});
await context.addInitScript(
  "globalThis.__name = (target, value) => Object.defineProperty(target, 'name', { value, configurable: true });"
);
if (measureBounds)
  await context.addInitScript(`(() => {
  const original = Element.prototype.getBoundingClientRect;
  window.__ip012Bounds = {calls: 0, totalMs: 0, maxMs: 0};
  Element.prototype.getBoundingClientRect = function() {
    if (this.getAttribute('data-testid') !== 'graph-stage') return original.call(this);
    const start = performance.now();
    try { return original.call(this); }
    finally {
      const duration = performance.now() - start;
      const metrics = window.__ip012Bounds;
      metrics.calls++; metrics.totalMs += duration;
      metrics.maxMs = Math.max(metrics.maxMs, duration);
    }
  };
})();`);
const page = await context.newPage();
const errors: string[] = [];
const network: {
  kind: string;
  ms: number;
  headers_ms?: number;
  bytes: number;
  status: number;
  serverTiming?: string;
  transferredBytes?: number;
  phase: string;
  level?: number;
  viewport?: unknown;
}[] = [];
const pending: Promise<void>[] = [];
let phase = "cold";
const started = new WeakMap<
  object,
  { time: number; phase: string; level?: number; viewport?: unknown }
>();
let lastInspection: Inspection | null = null;
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.url().includes("/graph/v5/render")) {
    const request = r.postDataJSON();
    started.set(r, {
      time: performance.now(),
      phase,
      ...(request.level === undefined ? {} : { level: request.level }),
      ...(request.viewport === undefined ? {} : { viewport: request.viewport })
    });
  }
});
page.on("response", (r) => {
  const start = started.get(r.request());
  if (start === undefined) return;
  pending.push(
    (async () => {
      const headersMs = performance.now() - start.time;
      try {
        const bytes = (await r.body()).byteLength;
        const completeMs = performance.now() - start.time;
        network.push({
          kind: r.request().postDataJSON()?.kind ?? "unknown",
          ...start,
          ms: completeMs,
          headers_ms: headersMs,
          bytes,
          serverTiming: r.headers()["server-timing"] ?? "",
          ...(await r
            .request()
            .sizes()
            .then((sizes) => ({ transferredBytes: sizes.responseBodySize }))
            .catch(() => ({}))),
          status: r.status()
        });
      } catch {
        network.push({
          kind: "aborted",
          ...start,
          ms: performance.now() - start.time,
          bytes: 0,
          status: r.status()
        });
      }
    })()
  );
});
if (delay)
  await page.route("**/graph/v5/render", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (route.request().failure()) {
      await route.fallback();
      return;
    }
    try {
      await route.continue();
    } catch (error) {
      if (
        !route.request().failure() ||
        !(error instanceof Error) ||
        !error.message.includes("Route is already handled")
      )
        throw error;
      await route.fallback();
    }
  });
async function inspect(page: Page) {
  return page.evaluate(() => {
    let value: Inspection | null = null;
    const listen = (e: Event) => {
      value = (e as CustomEvent).detail;
    };
    addEventListener("moirai:graph-inspection", listen, { once: true });
    dispatchEvent(new Event("moirai:inspect-graph"));
    removeEventListener("moirai:graph-inspection", listen);
    return value
      ? {
          ...(value as Inspection),
          boundsTiming: (window as ProfileWindow).__ip012Bounds ?? null
        }
      : null;
  });
}
async function settle() {
  const deadline = performance.now() + readyTimeout;
  while (performance.now() < deadline) {
    const state = await inspect(page);
    lastInspection = state;
    if (state?.loadState === "error") throw Error("viewport_load_error");
    if (state?.loadState === "ready" && !state.cache?.pending) {
      await page.waitForTimeout(260);
      const confirmed = await inspect(page);
      if (
        confirmed?.loadState === "ready" &&
        !confirmed.cache?.pending &&
        !confirmed.counts?.exitingRegions
      )
        return confirmed;
    }
    await page.waitForTimeout(100);
  }
  throw Error("viewport_settle_timeout");
}
async function restore(view: number[]) {
  await page.evaluate((view) => {
    const url = new URL(location.href);
    url.searchParams.set("gsViewport", view.join(","));
    history.pushState(history.state, "", url);
    dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  }, view);
  return settle();
}
const quantile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] ??
  null;
async function panSample(name: string) {
  phase = name;
  const before = await settle();
  await page.mouse.move(65, 510);
  await page.evaluate(() => {
    addEventListener(
      "pointerdown",
      (e) => {
        (window as ProfileWindow).__ip012Contact = (
          e as PointerEvent
        ).pointerId;
      },
      { once: true, capture: true }
    );
  });
  await page.mouse.down();
  const intervals = await page.evaluate(
    async ({ count, staticControl }) => {
      const target = document.querySelector('[data-testid="graph-stage"]')!;
      const id = (window as ProfileWindow).__ip012Contact;
      if (id === undefined) throw Error("native_contact_missing");
      const values: number[] = [];
      let last = performance.now();
      for (let i = 0; i < count; i++) {
        const now = await new Promise<number>(requestAnimationFrame);
        values.push(now - last);
        last = now;
        const phase = ((i % 120) / 120) * Math.PI * 2;
        if (!staticControl)
          target.dispatchEvent(
            new PointerEvent("pointermove", {
              bubbles: true,
              pointerId: id,
              pointerType: "mouse",
              buttons: 1,
              clientX: 65 + 35 * Math.sin(phase),
              clientY: 510 + 55 * Math.sin(phase)
            })
          );
      }
      return values;
    },
    { count: frames, staticControl }
  );
  await page.mouse.up();
  const after = await settle();
  console.info(
    JSON.stringify({
      phase: name,
      p95: quantile(intervals, 0.95),
      max: Math.max(...intervals),
      requests: network.length
    })
  );
  return {
    name,
    intervals,
    p50: quantile(intervals, 0.5),
    p95: quantile(intervals, 0.95),
    max: Math.max(...intervals),
    before,
    after,
    dom: await page.locator("*").count()
  };
}
const result: Record<string, unknown> = {
  device:
    "iPhone 14 WebKit emulation; hybrid captured pointer with continuous RAF moves",
  delay_ms: delay,
  visits,
  frames,
  ready_timeout_ms: readyTimeout,
  device_scale_factor: deviceScaleFactor,
  diagnostic: {
    disable_blend: disableBlend,
    static_control: staticControl,
    profile_cpu: profileCpu,
    measure_bounds: measureBounds,
    svg_control: svgControl,
    hull_control: hullControl,
    text_control: textControl
  },
  errors,
  network,
  heap: "not measured"
};
try {
  result.health = await (await context.request.get("/health")).json();
  const initialTime = performance.now();
  await page.goto(
    `/graph/v5?world=${world}&gsViewport=0,209900,1600,36000${profileCpu ? "&gsProfile=1" : ""}`,
    {
      waitUntil: "domcontentloaded"
    }
  );
  await page.getByTestId("graph-stage").waitFor();
  if (svgControl !== "visible")
    await page.addStyleTag({
      content: `svg[aria-label="Projected chart surface"] { ${svgControl === "none" ? "display: none" : "visibility: hidden"} !important; }`
    });
  if (hullControl === "hidden")
    await page.addStyleTag({
      content:
        "[data-composite-paint-id] > path { visibility: hidden !important; mix-blend-mode: normal !important; }"
    });
  if (textControl === "hidden")
    await page.addStyleTag({
      content:
        'svg[aria-label="Projected chart surface"] text { visibility: hidden !important; }'
    });
  if (disableBlend)
    await page.addStyleTag({
      content:
        "[data-composite-paint-id] path { mix-blend-mode: normal !important; }"
    });
  const initial = await settle();
  result.cold_ms = performance.now() - initialTime;
  result.initial = initial;
  result.cold_requests = network.length;
  console.info(
    JSON.stringify({
      phase: "ready",
      cold_ms: result.cold_ms,
      requests: network.length
    })
  );
  const checkpoints: Awaited<ReturnType<typeof panSample>>[] = [];
  result.checkpoints = checkpoints;
  checkpoints.push(await panSample("start"));
  const home = [0, 209900, 1600, 36000];
  const trips: {
    i: number;
    ms: number;
    requests: number;
    away: Record<string, number>;
    back: Record<string, number>;
    cache: Record<string, number>;
  }[] = [];
  result.trips = trips;
  for (let i = 0; i < visits; i++) {
    phase = `visit-${i}`;
    const before = network.length;
    const began = performance.now();
    const spanY = 2400 * 2 ** (i % 4);
    const centerY = 195000 + (i % 10) * 2800;
    const away = await restore([0, centerY, 800, spanY]);
    const back = await restore(home);
    trips.push({
      i,
      ms: performance.now() - began,
      requests: network.length - before,
      away: away.counts,
      back: back.counts,
      cache: back.cache
    });
    if (i === Math.floor(visits / 2) - 1)
      checkpoints.push(await panSample("middle"));
  }
  checkpoints.push(await panSample("return"));
  result.trips = trips;
  result.checkpoints = checkpoints;
  await page.screenshot({ path: output.replace(/\.json$/, ".png") });
  result.final = await settle();
  // Probe only after all frame samples; creating a context is not part of them.
  result.graphics = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return { webgl: false };
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      webgl: true,
      vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : null,
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null
    };
  });
} catch (e) {
  errors.push(String(e));
  result.lastInspection = lastInspection;
} finally {
  await Promise.all(pending);
  await browser.close();
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  console.info(
    JSON.stringify({
      output,
      errors,
      cold_ms: result.cold_ms,
      cold_requests: result.cold_requests,
      requests: network.length,
      checkpoints: (
        result.checkpoints as { name: string; p95: number; max: number }[]
      )?.map(({ name, p95, max }) => ({ name, p95, max }))
    })
  );
}

if (errors.length) process.exitCode = 1;
