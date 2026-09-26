/** Diagnostic-only ABBA comparison against a deployed, revision-pinned v5 graph. */
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
  frames_over_100_ms: Array<{ index: number; ms: number }>;
  history_calls: Array<{
    changed_collection: boolean;
    suppressed: boolean;
    duration_ms: number;
  }>;
  checked_after_off: boolean;
  checked_after_on: boolean;
  page_errors: string[];
}> = [];

try {
  for (const mode of [
    "suppress_collection_history",
    "normal",
    "normal",
    "suppress_collection_history"
  ] as const) {
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
    }, mode === "suppress_collection_history");

    const frames = page.evaluate(async () => {
      for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame);
      const intervals: number[] = [];
      let last = performance.now();
      for (let i = 0; i < 600; i++) {
        const now = await new Promise<number>(requestAnimationFrame);
        intervals.push(now - last);
        last = now;
      }
      const longFrames = intervals.flatMap((ms, index) =>
        ms > 100 ? [{ index, ms }] : []
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
    await checkbox.uncheck();
    const checkedAfterOff = await checkbox.isChecked();
    await checkbox.check();
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
    results.push({
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
    order: "BAAB",
    intervention:
      "only suppress history.replaceState when the collections query parameter changes; local React state and graph loading are otherwise untouched",
    results
  }) + "\n"
);
if (
  results.length !== 4 ||
  results.some(
    (r) =>
      r.samples !== 600 ||
      r.checked_after_off ||
      !r.checked_after_on ||
      r.page_errors.length
  )
)
  process.exitCode = 1;
