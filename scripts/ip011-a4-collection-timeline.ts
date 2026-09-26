/** Diagnostic-only timing comparison against a deployed, revision-pinned v5 graph. */
import { devices, webkit } from "@playwright/test";

const baseURL =
  process.env.PUBLIC_INTEGRATION_URL ??
  "https://moirai-production-8ed1.up.railway.app";
const worldId = "01995c2a-7b00-7000-8000-000000000101";
const browser = await webkit.launch();
const results: Array<{
  mode: "normal" | "suppress_collection_history";
  samples: number;
  p95_ms: number;
  max_ms: number;
  frames_over_100_ms: Array<{ index: number; ms: number; end_ms: number }>;
  history_calls: Array<{
    changed_collection: boolean;
    suppressed: boolean;
    duration_ms: number;
  }>;
  checked_after_off: boolean;
  checked_after_on: boolean;
  page_errors: string[];
  timeline: Array<{ label: string; at_ms: number; count?: number }>;
  shell_resources: Array<{
    start_ms: number;
    response_end_ms: number;
    duration_ms: number;
  }>;
}> = [];

try {
  for (const mode of ["normal", "normal"] as const) {
    const context = await browser.newContext({
      ...devices["iPhone 14"],
      baseURL
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/graph/v5?world=" + worldId, {
      waitUntil: "domcontentloaded"
    });
    await page
      .locator("[data-event-point-id]")
      .first()
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: "소스 쿼리 열기" }).first().click();
    await page.getByText("탐색 범위와 시간 기준", { exact: true }).click();
    const checkbox = page.getByRole("checkbox", {
      name: "조선 전기 연표",
      exact: true
    });
    if (!(await checkbox.isChecked()))
      throw Error("initial_collection_unchecked");

    await page.evaluate((suppress) => {
      const calls: Array<{
        changed_collection: boolean;
        suppressed: boolean;
        duration_ms: number;
      }> = [];
      (
        window as typeof window & { __a4HistoryCalls?: typeof calls }
      ).__a4HistoryCalls = calls;
      const original = window.history.replaceState.bind(window.history);
      window.history.replaceState = (data, unused, url) => {
        const previous = new URL(window.location.href);
        const next = new URL(
          url == null ? window.location.href : String(url),
          window.location.href
        );
        const changed =
          previous.searchParams.get("collections") !==
          next.searchParams.get("collections");
        if (suppress && changed) {
          calls.push({
            changed_collection: true,
            suppressed: true,
            duration_ms: 0
          });
          return;
        }
        const started = performance.now();
        const returned = original(data, unused, url);
        calls.push({
          changed_collection: changed,
          suppressed: false,
          duration_ms: performance.now() - started
        });
        return returned;
      };
    }, false);

    await page.evaluate(() => {
      const trace: Array<{ label: string; at_ms: number; count?: number }> = [];
      (window as typeof window & { __a4Trace?: typeof trace }).__a4Trace =
        trace;
      const point = document.querySelector("[data-event-point-id]");
      const graph = point?.closest("svg");
      if (!graph) throw Error("graph_observer_target_missing");
      new MutationObserver((records) => {
        if (trace.length < 200)
          trace.push({
            label: "graph_dom_mutation",
            at_ms: performance.now(),
            count: records.length
          });
      }).observe(graph, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["style", "class", "transform"]
      });
    });
    const frames = page.evaluate(async () => {
      for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame);
      const intervals: number[] = [];
      const ends: number[] = [];
      let last = performance.now();
      for (let i = 0; i < 600; i++) {
        const now = await new Promise<number>(requestAnimationFrame);
        intervals.push(now - last);
        ends.push(now);
        last = now;
      }
      const longFrames = intervals.flatMap((ms, index) =>
        ms > 100 ? [{ index, ms, end_ms: ends[index]! }] : []
      );
      intervals.sort((a, b) => a - b);
      return {
        samples: intervals.length,
        p95_ms: intervals[Math.ceil(intervals.length * 0.95) - 1]!,
        max_ms: intervals.at(-1)!,
        frames_over_100_ms: longFrames
      };
    });
    await page.waitForTimeout(250);
    await page.evaluate(() =>
      (
        window as typeof window & {
          __a4Trace?: Array<{ label: string; at_ms: number }>;
        }
      ).__a4Trace?.push({ label: "off_start", at_ms: performance.now() })
    );
    await checkbox.uncheck();
    await page.evaluate(() =>
      (
        window as typeof window & {
          __a4Trace?: Array<{ label: string; at_ms: number }>;
        }
      ).__a4Trace?.push({ label: "off_done", at_ms: performance.now() })
    );
    const checkedAfterOff = await checkbox.isChecked();
    await page.evaluate(() =>
      (
        window as typeof window & {
          __a4Trace?: Array<{ label: string; at_ms: number }>;
        }
      ).__a4Trace?.push({ label: "on_start", at_ms: performance.now() })
    );
    await checkbox.check();
    await page.evaluate(() =>
      (
        window as typeof window & {
          __a4Trace?: Array<{ label: string; at_ms: number }>;
        }
      ).__a4Trace?.push({ label: "on_done", at_ms: performance.now() })
    );
    const checkedAfterOn = await checkbox.isChecked();
    const sample = await frames;
    const historyCalls = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __a4HistoryCalls?: Array<{
              changed_collection: boolean;
              suppressed: boolean;
              duration_ms: number;
            }>;
          }
        ).__a4HistoryCalls ?? []
    );
    const timing = await page.evaluate(() => ({
      timeline:
        (
          window as typeof window & {
            __a4Trace?: Array<{ label: string; at_ms: number; count?: number }>;
          }
        ).__a4Trace ?? [],
      shell_resources: performance
        .getEntriesByType("resource")
        .filter((entry) => entry.name.includes("/graph/v5/shell"))
        .map((entry) => ({
          start_ms: entry.startTime,
          response_end_ms: (entry as PerformanceResourceTiming).responseEnd,
          duration_ms: entry.duration
        }))
    }));
    results.push({
      ...timing,
      mode,
      ...sample,
      history_calls: historyCalls,
      checked_after_off: checkedAfterOff,
      checked_after_on: checkedAfterOn,
      page_errors: pageErrors
    });
    await context.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(
  JSON.stringify({
    device: "iPhone 14 WebKit emulation, no throttling",
    production_sha: process.env.EXPECTED_COMMIT_SHA,
    world_id: worldId,
    order: "normal cold then normal warm",
    intervention:
      "none; passive graph DOM MutationObserver and resource timing after graph ready",
    results
  }) + "\n"
);
if (
  results.length !== 2 ||
  results.some(
    (r) =>
      r.samples !== 600 ||
      r.checked_after_off ||
      !r.checked_after_on ||
      r.page_errors.length
  )
)
  process.exitCode = 1;
