/** Read-only acceptance for the optional TSTL experiment in the production shell.
 * Usage: tsx scripts/tstl-research/product-smoke.ts BASE_URL OUTPUT_DIR [BUILD_SHA]
 * Synthetic two-pointer gestures and mobile browser emulation are not physical
 * iPhone 17 Safari or installed-PWA evidence. No historical writes occur.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  chromium,
  webkit,
  request as playwrightRequest,
  type Page
} from "@playwright/test";
import { waitForGraphReadTarget } from "../ip011-a4-browser-contract.js";
import type { TstlExperimentArtifact } from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";

const baseURL = process.argv[2] ?? "http://127.0.0.1:3000";
const output = resolve(process.argv[3] ?? ".artifacts/tstl-product/smoke");
const expectedSha = process.argv[4];
const world = "01a107fb-4018-7fcb-8390-836a40fa91cc";
const initialCamera = "300,223420,1400,1800";
const graphPath = process.env.TSTL_SMOKE_GRAPH_PATH ?? "/graph/v5";
const readProxy = process.env.TSTL_SMOKE_READ_PROXY;
const graph = `${graphPath}?world=${world}&gsViewport=${initialCamera}`;
const fixtureSha256 =
  "5957645873d0484244e317a99c459df025e2d80d07dc5819e79c62569c716b64";
const profiles = [
  {
    name: "desktop-chromium",
    engine: chromium,
    width: 1280,
    height: 800,
    mobile: false
  },
  {
    name: "mobile-chromium",
    engine: chromium,
    width: 390,
    height: 844,
    mobile: true
  },
  {
    name: "mobile-webkit",
    engine: webkit,
    width: 390,
    height: 844,
    mobile: true
  }
].filter(
  (profile) =>
    !process.env.TSTL_SMOKE_PROFILE ||
    profile.name === process.env.TSTL_SMOKE_PROFILE
);
assert(profiles.length, "TSTL_SMOKE_PROFILE must name an existing profile");
mkdirSync(output, { recursive: true });
type View = { x: number; y: number; scaleX: number; scaleY: number };
type Inspection = {
  loadState: string;
  revision: unknown;
  selectedEventId: string | null;
  selection: string[];
  view: View;
  liveView: View;
  counts: Record<string, number>;
  representation: Record<string, number>;
  cache: Record<string, number> | null;
  activeIds: { points: string[]; regions: string[]; edges: string[] };
  geometry: {
    id: string;
    contourMode?: string;
    rings?: { x: number; y: number }[][];
  }[];
  fixedContourPaint: {
    id: string;
    path: string;
    ringCount: number;
    pathTransform: string | null;
    paintView: View;
    paintViewport: { width: number; height: number };
  }[];
};
async function inspect(page: Page): Promise<Inspection | null> {
  return page.evaluate(() => {
    let value: Inspection | null = null;
    const receive = (event: Event) => {
      value = (event as CustomEvent<Inspection>).detail;
    };
    addEventListener("moirai:graph-inspection", receive, { once: true });
    dispatchEvent(new Event("moirai:inspect-graph"));
    removeEventListener("moirai:graph-inspection", receive);
    return value;
  });
}
async function settle(page: Page, mode?: string) {
  if (mode)
    await page.waitForFunction(
      (expected) =>
        document
          .querySelector('[data-testid="tstl-layout-status"]')
          ?.getAttribute("data-mode") === expected,
      mode
    );
  const deadline = performance.now() + 30_000;
  while (performance.now() < deadline) {
    const state = await inspect(page);
    assert.notEqual(state?.loadState, "error", "graph loader failed");
    if (
      state?.loadState === "ready" &&
      !state.cache?.pending &&
      !state.counts.exitingRegions
    ) {
      await page.waitForTimeout(260);
      const confirmed = await inspect(page);
      if (
        confirmed?.loadState === "ready" &&
        !confirmed.cache?.pending &&
        !confirmed.counts.exitingRegions
      )
        return confirmed;
    }
    await page.waitForTimeout(100);
  }
  throw Error(`graph did not settle: ${JSON.stringify(await inspect(page))}`);
}
function closeNumber(
  actual: number,
  expected: number,
  label: string,
  tolerance = 1e-7
) {
  assert(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} != ${expected}`
  );
}
function sameCamera(actual: View, expected: View) {
  for (const key of ["x", "y", "scaleX", "scaleY"] as const)
    closeNumber(actual[key], expected[key], `camera.${key}`);
}
function summary(state: Inspection) {
  assert.equal(
    new Set(state.activeIds.points).size,
    state.activeIds.points.length,
    "one Event cannot be duplicated among projected points"
  );
  assert.equal(
    new Set(state.activeIds.regions).size,
    state.activeIds.regions.length,
    "one Composite owner cannot become several Events"
  );
  return {
    revision: state.revision,
    selectedEventId: state.selectedEventId,
    selection: state.selection,
    view: state.view,
    liveView: state.liveView,
    counts: state.counts,
    representation: state.representation,
    cache: state.cache,
    activeIds: state.activeIds,
    fixedPaint: state.fixedContourPaint?.map((paint) => ({
      id: paint.id,
      ringCount: paint.ringCount,
      pathSha256: createHash("sha256").update(paint.path).digest("hex")
    }))
  };
}
async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: resolve(output, `${name}.png`),
    fullPage: true
  });
}
async function assertPaint(
  page: Page,
  state: Inspection,
  artifact: TstlExperimentArtifact
) {
  assert(
    (state.counts.fixedContourRegions ?? 0) > 0,
    "Candidate A must present filled fixed contours"
  );
  assert(
    (state.counts.fixedContourRings ?? 0) >
      (state.counts.fixedContourRegions ?? 0),
    "Candidate A must preserve multiple fragments"
  );
  const fixed = state.geometry.filter(
    (geometry) => geometry.contourMode === "fixed"
  );
  assert(fixed.length > 0);
  for (const geometry of fixed)
    assert.deepEqual(
      geometry.rings,
      artifact.a.contoursByCompositeId[geometry.id],
      `world rings changed for ${geometry.id}`
    );
  assert(
    state.fixedContourPaint.length > 0,
    "fixed contours reached actual presented paths"
  );
  for (const paint of state.fixedContourPaint) {
    assert.equal(
      (paint.path.match(/M/g) ?? []).length,
      paint.ringCount,
      "each fragment has its own closed path"
    );
    assert.equal((paint.path.match(/Z/gi) ?? []).length, paint.ringCount);
    assert(
      !/[CQSA]/i.test(paint.path),
      "fixed contours must not be spline-smoothed"
    );
    const translation = paint.pathTransform?.match(
      /^translate\(([^ ]+) ([^)]+)\)$/
    );
    assert(
      !paint.pathTransform || translation,
      "fixed path can only use cached translation"
    );
    const translateX = Number(translation?.[1] ?? 0),
      translateY = Number(translation?.[2] ?? 0);
    const tokens =
      paint.path.match(/[MLZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ??
      [];
    let cursor = 0;
    for (const ring of artifact.a.contoursByCompositeId[paint.id]!) {
      for (const [index, vertex] of ring.entries()) {
        assert.equal(tokens[cursor++], index === 0 ? "M" : "L");
        const x = Number(tokens[cursor++]) + translateX;
        const y = Number(tokens[cursor++]) + translateY;
        const expectedX =
          paint.paintViewport.width / 2 +
          paint.paintView.x +
          vertex.x * paint.paintView.scaleX;
        const expectedY =
          paint.paintViewport.height / 2 +
          paint.paintView.y +
          vertex.y * paint.paintView.scaleY;
        assert(
          Math.abs(x - expectedX) < 1e-6 && Math.abs(y - expectedY) < 1e-6,
          `painted fixed vertex changed for ${paint.id}`
        );
      }
      assert.equal(tokens[cursor++], "Z");
    }
    assert.equal(
      cursor,
      tokens.length,
      "renderer introduced extra contour commands"
    );
  }
  const painter = await page.evaluate(() => {
    const svg = document.querySelector(
      'svg[aria-label="Projected chart surface"]'
    );
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="geographic-webgl"], [data-testid="geographic-canvas"]'
    );
    return {
      backend: svg?.getAttribute("data-graphics-painter"),
      regions: Number(canvas?.dataset.regionCount ?? 0),
      meshCount: Number(canvas?.dataset.meshCount ?? 0),
      paints: Number(canvas?.dataset.paintRevision ?? 0)
    };
  });
  assert(
    painter.regions > 0 && painter.paints > 0,
    `production background painter must draw areas: ${JSON.stringify(painter)}`
  );
  return painter;
}
async function pinch(page: Page, axis: "x" | "y", factor = 1.25) {
  const before = await settle(page);
  await page.getByTestId("graph-stage").evaluate(
    async (stage, { axis, factor }) => {
      const capture = stage.setPointerCapture;
      stage.setPointerCapture = () => {};
      const center = { x: innerWidth / 2, y: innerHeight * 0.48 };
      const start = [
        { x: center.x - 60, y: center.y - 65 },
        { x: center.x + 60, y: center.y + 65 }
      ];
      const send = (
        type: string,
        index: number,
        point: { x: number; y: number }
      ) =>
        stage.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: 7911 + index,
            pointerType: "touch",
            clientX: point.x,
            clientY: point.y,
            buttons: type === "pointerup" ? 0 : 1
          })
        );
      try {
        start.forEach((point, index) => send("pointerdown", index, point));
        await new Promise(requestAnimationFrame);
        const end = start.map((point) => ({
          ...point,
          [axis]: center[axis] + (point[axis] - center[axis]) * factor
        }));
        end.forEach((point, index) => send("pointermove", index, point));
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        end.forEach((point, index) => send("pointerup", index, point));
      } finally {
        stage.setPointerCapture = capture;
      }
    },
    { axis, factor }
  );
  const after = await settle(page);
  const changed = axis === "x" ? "scaleX" : "scaleY";
  const retained = axis === "x" ? "scaleY" : "scaleX";
  assert(
    Math.abs(after.liveView[changed] - before.liveView[changed]) >
      before.liveView[changed] * 0.05,
    `${axis}-axis pinch must change its scale`
  );
  closeNumber(
    after.liveView[retained],
    before.liveView[retained],
    `${axis}-axis pinch preserves other scale`
  );
  return { before: summary(before), after: summary(after) };
}
async function restoreCamera(page: Page, camera: string) {
  await page.evaluate((camera) => {
    const url = new URL(location.href);
    url.searchParams.set("gsViewport", camera);
    history.replaceState(history.state, "", url);
    dispatchEvent(new PopStateEvent("popstate"));
  }, camera);
  return settle(page);
}
async function compareControls(page: Page) {
  return page.evaluate(() => {
    const ancestry = (element: Element | null) => {
      const values = [];
      while (element) {
        const style = getComputedStyle(element);
        values.push({
          tag: element.tagName,
          class: element.className,
          testId: element.getAttribute("data-testid"),
          position: style.position,
          zIndex: style.zIndex,
          isolation: style.isolation,
          transform: style.transform
        });
        element = element.parentElement;
      }
      return values;
    };
    return [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-testid^="tstl-compare-"]'
      )
    ].map((button) => {
      const box = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const hit = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2
      );
      return {
        testId: button.dataset.testid,
        pressed: button.getAttribute("aria-pressed"),
        box: box.toJSON(),
        background: style.backgroundColor,
        color: style.color,
        reachable: hit === button || button.contains(hit),
        buttonAncestors: ancestry(button),
        hitAncestors: ancestry(hit)
      };
    });
  });
}
async function openGraphTab(page: Page) {
  const button = page.getByRole("button", { name: "공개 그래프", exact: true });
  const box = await button.boundingBox();
  assert(box);
  // The Next development indicator covers the center of this first mobile
  // tab in the local mount. Use an uncovered point inside the real button;
  // no forced click or suppression of runtime errors is needed.
  await button.click({ position: { x: box.width - 12, y: box.height / 2 } });
}
async function switchMode(page: Page, mode: "A" | "B0") {
  await page.getByTestId(`tstl-compare-${mode}`).click();
  const state = await settle(page, mode);
  assert.equal(
    await page.getByTestId(`tstl-compare-${mode}`).getAttribute("aria-pressed"),
    "true"
  );
  return state;
}
const results: Record<string, unknown>[] = [];
let failures = 0;
for (const profile of profiles) {
  const browser = await profile.engine.launch();
  const proxy = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  const context = await browser.newContext({
    baseURL,
    viewport: { width: profile.width, height: profile.height },
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    locale: "ko-KR",
    deviceScaleFactor: 1,
    ...(proxy && !/127\.0\.0\.1|localhost/.test(baseURL)
      ? { proxy: { server: proxy } }
      : {})
  });
  await context.addInitScript(
    "globalThis.__name = (target) => target; localStorage.setItem('urdr:app-language-override', 'ko');"
  );
  const remoteReads = readProxy
    ? await playwrightRequest.newContext({
        ...(proxy ? { proxy: { server: proxy } } : {})
      })
    : undefined;
  if (remoteReads && readProxy)
    await context.route(/\/graph\/v5\/(shell|render)(\?|$)/, async (route) => {
      const source = route.request();
      const headers = {
        ...source.headers(),
        origin: readProxy,
        referer: `${readProxy}/graph/v5`
      };
      delete (headers as Record<string, string>).host;
      const response = await remoteReads.fetch(
        `${readProxy}${new URL(source.url()).pathname}`,
        {
          method: source.method(),
          headers,
          data: source.postDataBuffer() ?? undefined
        }
      );
      await route.fulfill({ response });
    });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors: string[] = [];
  const failedResponses: { path: string; status: number }[] = [];
  const requests: string[] = [];
  const pending: Promise<void>[] = [];
  let artifact: TstlExperimentArtifact | undefined;
  let artifactSha: string | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).origin === new URL(baseURL).origin)
      requests.push(new URL(request.url()).pathname);
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.status() >= 400)
      failedResponses.push({ path, status: response.status() });
    if (/\/labs\/tstl\/r56.*\.json$/.test(path))
      pending.push(
        (async () => {
          const bytes = await response.body();
          artifactSha = createHash("sha256").update(bytes).digest("hex");
          artifact = JSON.parse(bytes.toString()) as TstlExperimentArtifact;
        })()
      );
  });
  const result: Record<string, unknown> = {
    profile: profile.name,
    viewport: { width: profile.width, height: profile.height },
    evidenceType: "browser emulation with synthetic active-pointer gestures",
    errors,
    failedResponses
  };
  results.push(result);
  try {
    if (expectedSha) {
      const statusResponse = await context.request.get("/__status");
      assert(statusResponse.ok(), "public status unavailable");
      const status = (await statusResponse.json()) as {
        application: { commit_sha: string };
      };
      assert.equal(
        status.application.commit_sha,
        expectedSha,
        "public build SHA does not match reviewed deployment"
      );
      result.status = status;
    }
    const defaultResponse = await page.goto(graph, {
      waitUntil: "domcontentloaded"
    });
    assert(defaultResponse?.ok(), "default history graph route unavailable");
    await page.getByTestId("graph-stage").waitFor({ state: "visible" });
    const defaultCurrent = await settle(page);
    assert.equal(
      defaultCurrent.counts.fixedContourRegions,
      0,
      "fresh browser keeps current layout"
    );
    assert.equal(
      requests.filter((path) => /\/labs\/tstl\/r56.*\.json$/.test(path)).length,
      0,
      "fresh default does not download experimental data"
    );
    await page.getByRole("button", { name: "설정", exact: true }).click();
    assert.equal(
      await page
        .getByTestId("tstl-layout-current")
        .getAttribute("aria-pressed"),
      "true"
    );
    result.defaultCurrent = summary(defaultCurrent);
    const coldStarted = performance.now();
    const response = await page.goto(`${graph}&layoutLab=A`, {
      waitUntil: "domcontentloaded"
    });
    assert(response?.ok(), "history graph route unavailable");
    await page.getByTestId("graph-stage").waitFor({ state: "visible" });
    const initial = await settle(page, "A");
    const currentStartupRenderRequests = requests.filter(
      (path) => path === "/graph/v5/render"
    ).length;
    result.coldMs = performance.now() - coldStarted;
    await Promise.all(pending);
    assert(artifact, "frozen r56 artifact must be fetched");
    assert.equal(artifact.source.fixtureSha256, fixtureSha256);
    assert.equal(artifact.stats.events, 539);
    assert.equal(artifact.stats.composites, 109);
    assert.equal(artifact.stats.candidateAreaComposites, 105);
    assert.equal(artifact.a.noAreaCompositeIds.length, 4);
    result.artifactSha256 = artifactSha;
    result.source = artifact.source;
    result.painter = await assertPaint(page, initial, artifact);
    result.initialA = summary(initial);
    result.compareControls = await compareControls(page);
    await screenshot(page, `${profile.name}-A-imjin`);
    const b0 = await switchMode(page, "B0");
    sameCamera(b0.liveView, initial.liveView);
    assert.equal(
      b0.counts.fixedContourRegions,
      0,
      "B0 must not retain A paint"
    );
    result.B0 = summary(b0);
    await screenshot(page, `${profile.name}-B0-imjin`);
    const againA = await switchMode(page, "A");
    sameCamera(againA.liveView, initial.liveView);
    await assertPaint(page, againA, artifact);
    result.xPinch = await pinch(page, "x");
    result.yPinch = await pinch(page, "y");
    const target = await waitForGraphReadTarget(page);
    await page.mouse.click(target.x, target.y);
    const drawer = page.getByTestId("event-drawer-sheet");
    await drawer.waitFor({ state: "visible" });
    const selectedA = await settle(page, "A");
    assert.equal(
      selectedA.selectedEventId,
      target.id,
      "drawer preserves the single selected Event identity"
    );
    result.drawerCompareControls = await compareControls(page);
    const selectedB0 = await switchMode(page, "B0");
    assert.equal(selectedB0.selectedEventId, target.id);
    sameCamera(selectedB0.liveView, selectedA.liveView);
    assert(await drawer.isVisible(), "mode switch retains drawer");
    await switchMode(page, "A");
    await screenshot(page, `${profile.name}-selected-event`);
    result.selectedEvent = target;
    await page.getByTestId("event-drawer-close").click();
    await page.getByTestId("graph-collection-trigger").click();
    const dialog = page.getByRole("dialog", { name: "컬렉션", exact: true });
    await dialog.waitFor({ state: "visible" });
    const checkbox = dialog.getByRole("checkbox", {
      name: "한국사",
      exact: true
    });
    assert(await checkbox.isChecked(), "Korean history begins enabled");
    const selectedCollections = () =>
      page.evaluate(() =>
        (new URL(location.href).searchParams.get("collections") ?? "")
          .split(",")
          .filter(Boolean)
          .sort()
      );
    const allSelected = await selectedCollections();
    await checkbox.uncheck();
    const filtered = await settle(page);
    assert.equal(
      (await selectedCollections()).length,
      allSelected.length - 1,
      "Collection toggle changes existing production selection"
    );
    const afterOff = await selectedCollections();
    await checkbox.check();
    await settle(page);
    assert.deepEqual(await selectedCollections(), allSelected);
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    result.collectionToggle = {
      before: allSelected,
      afterOff,
      filtered: summary(filtered)
    };
    assert.equal(
      requests.filter((path) => /\/labs\/tstl\/r56.*\.json$/.test(path)).length,
      1,
      "B0/A, camera and Collections reuse one artifact fetch"
    );
    assert.equal(
      requests.filter((path) => path === "/graph/v5/render").length,
      currentStartupRenderRequests,
      "active experiment must not fetch viewport publication tiles"
    );
    const wide = await restoreCamera(page, "300,220900,1500,21000");
    result.wideA = summary(wide);
    assert.notDeepEqual(
      wide.activeIds.points,
      initial.activeIds.points,
      "zoom changes admitted and visible points through production density"
    );
    await screenshot(page, `${profile.name}-A-world`);
    await switchMode(page, "B0");
    await screenshot(page, `${profile.name}-B0-world`);
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page
      .getByTestId("tstl-layout-settings")
      .waitFor({ state: "visible" });
    await page.getByTestId("tstl-layout-A").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="tstl-layout-A"]')
          ?.getAttribute("aria-pressed") === "true"
    );
    await settle(page);
    await screenshot(page, `${profile.name}-settings`);
    await openGraphTab(page);
    const persistedCamera = (await settle(page, "A")).liveView;
    const savedUrl = new URL(page.url());
    if (process.env.TSTL_SMOKE_GRAPH_PATH) savedUrl.pathname = graphPath;
    savedUrl.searchParams.delete("layoutLab");
    await page.goto(savedUrl.toString(), { waitUntil: "domcontentloaded" });
    const restored = await settle(page, "A");
    sameCamera(restored.liveView, persistedCamera);
    result.savedModeReload = summary(restored);
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page.getByTestId("tstl-layout-current").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="tstl-layout-current"]')
          ?.getAttribute("aria-pressed") === "true"
    );
    await openGraphTab(page);
    const returnedCurrent = await settle(page);
    assert.equal(
      await page.getByTestId("tstl-layout-status").count(),
      0,
      "current mode removes experiment compare badge"
    );
    assert.equal(
      returnedCurrent.counts.fixedContourRegions,
      0,
      "returning to current must discard experimental contour paint"
    );
    result.returnedCurrent = summary(returnedCurrent);
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }));
    assert(
      overflow.document <= overflow.width && overflow.body <= overflow.width,
      "mobile page must not overflow horizontally"
    );
    result.overflow = overflow;
    assert.deepEqual(errors, [], "browser runtime errors");
    assert.deepEqual(failedResponses, [], "failed HTTP responses");
    result.passed = true;
  } catch (error) {
    failures++;
    result.passed = false;
    result.failure =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : String(error);
    result.compareControlsAtFailure = await compareControls(page).catch(
      () => null
    );
    result.lastInspection = await inspect(page)
      .then((value) => (value ? summary(value) : null))
      .catch(() => null);
    await screenshot(page, `${profile.name}-failure`).catch(() => {});
  } finally {
    await Promise.allSettled(pending);
    result.requestCounts = Object.fromEntries(
      [...new Set(requests)].map((path) => [
        path,
        requests.filter((item) => item === path).length
      ])
    );
    await context.close();
    await remoteReads?.dispose();
    await browser.close();
    writeFileSync(
      resolve(output, "report.json"),
      `${JSON.stringify({ baseURL, graphPath, readProxy, expectedSha, physicalDevice: "not tested", results }, null, 2)}\n`
    );
    console.info(
      JSON.stringify({
        profile: profile.name,
        passed: result.passed,
        failure: result.failure
      })
    );
  }
}
if (failures) process.exitCode = 1;
