/** Read-only, real-r56 browser evidence for IP-017. Does not certify aesthetics.
 * Usage: tsx scripts/tstl-research/organic-product-smoke.ts BASE_URL OUTPUT_DIR [SHA]
 * ORGANIC_SMOKE_PROFILE selects one profile; ORGANIC_SMOKE_READ_PROXY supports a
 * local diagnostic build reading the unchanged public history service.
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
import {
  tstlCandidate,
  type TstlExperimentArtifact,
  type TstlExperimentPoint
} from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";

const baseURL = process.argv[2] ?? "http://127.0.0.1:3000";
const output = resolve(process.argv[3] ?? ".artifacts/organic-surface/smoke");
const expectedSha = process.argv[4];
const readProxy = process.env.ORGANIC_SMOKE_READ_PROXY;
const graphPath = process.env.ORGANIC_SMOKE_GRAPH_PATH ?? "/graph/v5";
const world = "01a107fb-4018-7fcb-8390-836a40fa91cc";
const views = [
  { name: "imjin", camera: "260,223420,650,1800" },
  { name: "yi-shared", camera: "280,222950,430,500" },
  { name: "world", camera: "0,220900,1900,21000" }
];
const historicalCases = [
  { id: "01a123a1-0000-751e-9e64-e7c7b6b89fbc", title: "한국사" },
  {
    id: "01a10a3f-05d2-7981-94f4-08f3ea6433ec",
    title: "임진왜란: 두 차례 침략과 강화 교섭"
  },
  { id: "1f10a329-835d-79b1-a9c3-ae1835934b8b", title: "이순신의 생애" }
];
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
    !process.env.ORGANIC_SMOKE_PROFILE ||
    profile.name === process.env.ORGANIC_SMOKE_PROFILE
);
assert(profiles.length, "unknown ORGANIC_SMOKE_PROFILE");
mkdirSync(output, { recursive: true });

type View = { x: number; y: number; scaleX: number; scaleY: number };
type Inspection = {
  loadState: string;
  selectedEventId: string | null;
  view: View;
  liveView: View;
  counts: Record<string, number | boolean | undefined>;
  sceneJobs?: { pending: number };
  workerJobs?: { running: number; pending: number } | null;
  cache?: { pending?: number } | null;
  paintSourceKey?: string;
  renderer?: { renderer: string; state: string; fallback?: string } | null;
  eventCoordinates?: { id: string; x: number; y: number }[];
  geometry: {
    id: string;
    contourMode?: string;
    fillRule?: string;
    rings?: TstlExperimentPoint[][];
    anchor?: TstlExperimentPoint;
  }[];
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const visible = (page: Page, id: string) =>
  page.locator(`[data-testid="${id}"]:visible`).first();
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
async function settle(
  page: Page,
  mode?: "anchored" | "organic",
  previousSource?: string
) {
  const deadline = Date.now() + 180_000;
  let last: Inspection | null = null;
  while (Date.now() < deadline) {
    last = await inspect(page);
    assert.notEqual(last?.loadState, "error", "graph loader failed");
    if (
      last?.loadState === "ready" &&
      !last.cache?.pending &&
      !last.sceneJobs?.pending &&
      !last.workerJobs?.pending &&
      !last.workerJobs?.running &&
      !last.counts.stageActive &&
      !last.counts.exitingRegions &&
      (!mode || last.paintSourceKey?.startsWith("tstl:" + mode)) &&
      (!previousSource || last.paintSourceKey !== previousSource) &&
      (["x", "y", "scaleX", "scaleY"] as const).every(
        (key) => last!.view[key] === last!.liveView[key]
      )
    )
      return last;
    await page.waitForTimeout(150);
  }
  throw Error("graph did not settle: " + JSON.stringify(last));
}
function sameCamera(actual: View, expected: View) {
  for (const key of ["x", "y", "scaleX", "scaleY"] as const)
    assert(
      Math.abs(actual[key] - expected[key]) <=
        1e-7 * Math.max(1, Math.abs(expected[key])),
      `camera.${key} changed`
    );
}
function coordinates(state: Inspection, artifact: TstlExperimentArtifact) {
  const expected = new Map<string, TstlExperimentPoint>();
  const anchored = tstlCandidate(artifact, "anchored");
  for (const primitive of artifact.b0Primitives) {
    const xy =
      primitive.entity.kind === "composite"
        ? primitive.composite?.anchor
        : primitive.entity.kind === "event" &&
            primitive.geometry.kind === "point"
          ? primitive.geometry.xy
          : undefined;
    if (xy)
      expected.set(primitive.entity.id, {
        x: anchored.xByEventId[primitive.entity.id]!,
        y: xy.y
      });
  }
  assert.equal(
    expected.size,
    539,
    "frozen r56 contains every Event and Composite anchor"
  );
  assert(state.eventCoordinates?.length, "inspectable Event coordinates");
  for (const point of state.eventCoordinates)
    assert.deepEqual(
      { x: point.x, y: point.y },
      expected.get(point.id),
      `fixed XY: ${point.id}`
    );
  for (const shape of state.geometry)
    if (shape.anchor)
      assert.deepEqual(
        shape.anchor,
        expected.get(shape.id),
        `fixed Composite anchor: ${shape.id}`
      );
  return {
    events: state.eventCoordinates.length,
    anchors: state.geometry.filter((shape) => shape.anchor).length
  };
}
function shapeDigest(state: Inspection) {
  return digest(
    state.geometry
      .filter((shape) => shape.rings?.length)
      .map((shape) => ({ id: shape.id, rings: shape.rings }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );
}
async function switchMode(page: Page, mode: "anchored" | "organic") {
  const drawer = visible(page, "tstl-drawer-layout");
  if (await drawer.isVisible()) await drawer.selectOption(mode);
  else await visible(page, "tstl-compare-" + mode).click();
  return settle(page, mode);
}
async function controls(page: Page) {
  const control = visible(page, "organic-controls");
  if (!(await control.evaluate((node) => (node as HTMLDetailsElement).open)))
    await control.locator("summary").click();
  return control;
}
async function revealDetails(page: Page, testId: string) {
  const target = page.getByTestId(testId).first();
  const details = target.locator("xpath=ancestor::details[1]");
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
    await details.locator(":scope > summary").click();
}
async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: resolve(output, name + ".png"),
    fullPage: true
  });
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
async function closeControls(page: Page) {
  const control = visible(page, "organic-controls");
  if (
    (await control.isVisible()) &&
    (await control.evaluate((node) => (node as HTMLDetailsElement).open))
  )
    await control.locator("summary").click();
}
const reports: Record<string, unknown>[] = [];
let failures = 0;
for (const profile of profiles) {
  const browser = await profile.engine.launch(
    profile.engine === chromium ? { channel: "chromium" } : {}
  );
  const proxy = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  const context = await browser.newContext({
    baseURL,
    viewport: { width: profile.width, height: profile.height },
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    deviceScaleFactor: 1,
    locale: "ko-KR",
    ...(proxy && !/127\.0\.0\.1|localhost/.test(baseURL)
      ? { proxy: { server: proxy } }
      : {})
  });
  await context.addInitScript(
    "globalThis.__name=(target)=>target;localStorage.setItem('urdr:app-language-override','ko');"
  );
  const remote = readProxy
    ? await playwrightRequest.newContext(
        proxy ? { proxy: { server: proxy } } : {}
      )
    : undefined;
  if (remote && readProxy)
    await context.route(/\/graph\/v5\/(shell|render)(\?|$)/, async (route) => {
      const source = route.request();
      const headers = {
        ...source.headers(),
        origin: readProxy,
        referer: readProxy + "/graph/v5"
      };
      delete (headers as Record<string, string>).host;
      const response = await remote.fetch(
        readProxy + new URL(source.url()).pathname,
        {
          method: source.method(),
          headers,
          data: source.postDataBuffer() ?? undefined
        }
      );
      await route.fulfill({ response });
    });
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  const errors: string[] = [],
    consoleErrors: string[] = [],
    failedHTTP: unknown[] = [],
    writes: string[] = [],
    assets: Promise<void>[] = [];
  let artifact: TstlExperimentArtifact | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
      !/^\/graph\/(v5\/(shell|render|read|viewport)|query)$/.test(url.pathname)
    )
      writes.push(`${request.method()} ${url.pathname}`);
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.status() >= 400)
      failedHTTP.push({ path, status: response.status() });
    if (/\/labs\/tstl\/r56.*\.json$/.test(path))
      assets.push(
        (async () => {
          artifact = (await response.json()) as TstlExperimentArtifact;
        })()
      );
  });
  const report: Record<string, unknown> = {
    profile: profile.name,
    viewport: { width: profile.width, height: profile.height },
    errors,
    consoleErrors,
    failedHTTP,
    writes,
    visualAcceptance:
      "User review pending; browser emulation is not physical iPhone 17 Safari/PWA evidence."
  };
  reports.push(report);
  try {
    if (expectedSha) {
      const response = await context.request.get("/__status");
      assert(response.ok());
      const status = await response.json();
      assert.equal(status.application.commit_sha, expectedSha);
      report.observedSHA = expectedSha;
    }
    const path = `${graphPath}?world=${world}&layoutLab=anchored&gsViewport=${views[0]!.camera}`;
    assert((await page.goto(path, { waitUntil: "domcontentloaded" }))?.ok());
    const initial = await settle(page, "anchored");
    await Promise.all(assets);
    assert(artifact);
    report.source = artifact.source;
    report.baselineCoordinates = coordinates(initial, artifact);
    const visual: Record<string, unknown>[] = [];
    report.views = visual;
    for (const view of views) {
      const anchor = await switchMode(page, "anchored");
      coordinates(anchor, artifact);
      const camera = await restoreCamera(page, view.camera);
      await screenshot(page, `${profile.name}-anchored-${view.name}`);
      const organic = await switchMode(page, "organic");
      sameCamera(organic.liveView, camera.liveView);
      const coordinateCheck = coordinates(organic, artifact);
      assert(
        organic.geometry.some((shape) => shape.rings?.length),
        "organic surface reaches the actual renderer"
      );
      for (const shape of organic.geometry.filter(
        (shape) => shape.rings?.length
      ))
        assert.equal(
          shape.fillRule,
          "evenodd",
          "compound surfaces preserve holes"
        );
      await screenshot(page, `${profile.name}-organic-${view.name}`);
      visual.push({
        ...view,
        coordinates: coordinateCheck,
        geometryDigest: shapeDigest(organic),
        renderer: organic.renderer,
        view: organic.liveView
      });
      console.info(
        JSON.stringify({
          profile: profile.name,
          phase: "visual",
          view: view.name
        })
      );
    }
    await restoreCamera(page, views[0]!.camera);
    const panel = await controls(page);
    await revealDetails(page, "organic-inspector-composite");
    await panel
      .getByTestId("organic-inspector-composite")
      .selectOption(historicalCases[1]!.id);
    const before = await settle(page, "organic");
    const displays: Record<string, unknown> = {};
    for (const mode of ["base", "padded", "overlay"] as const) {
      const previousSource = (await settle(page, "organic")).paintSourceKey;
      await panel.getByTestId(`organic-display-${mode}`).click();
      const state = await settle(page, "organic", previousSource);
      sameCamera(state.liveView, before.liveView);
      coordinates(state, artifact);
      displays[mode] = {
        geometryDigest: shapeDigest(state),
        diagnostics: await panel
          .getByTestId("organic-diagnostics")
          .textContent()
      };
      await screenshot(page, `${profile.name}-${mode}-inspection`);
    }
    report.displays = displays;
    const beforePadded = (await settle(page, "organic")).paintSourceKey;
    await panel.getByTestId("organic-display-padded").click();
    await settle(page, "organic", beforePadded);
    await revealDetails(page, "organic-reproduction-json");
    await panel.getByTestId("organic-copy").click();
    const reproduction = panel.getByTestId("organic-reproduction-json");
    const exported = await reproduction.inputValue();
    const parsed = JSON.parse(exported) as unknown;
    writeFileSync(
      resolve(output, `${profile.name}-reproduction.json`),
      exported + "\n"
    );
    const originalShape = shapeDigest(await settle(page, "organic"));
    const radius = panel.getByTestId("organic-parameter-radiusX");
    const radiusBefore = Number(await radius.inputValue());
    await radius.fill(String(radiusBefore + 2));
    const beforeRecompute = (await settle(page, "organic")).paintSourceKey;
    await panel.getByTestId("organic-recompute").click();
    await settle(page, "organic", beforeRecompute);
    await panel.getByTestId("organic-copy").click();
    assert.notEqual(
      await reproduction.inputValue(),
      exported,
      "tuned parameters are exported"
    );
    await reproduction.fill(exported);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      panel.getByTestId("organic-import").click()
    ]);
    const replay = await settle(page, "organic");
    sameCamera(replay.liveView, before.liveView);
    assert.equal(
      shapeDigest(replay),
      originalShape,
      "export/import reproduces exact serialized boundaries"
    );
    await controls(page);
    await revealDetails(page, "organic-reproduction-json");
    await panel.getByTestId("organic-copy").click();
    assert.deepEqual(
      JSON.parse(await reproduction.inputValue()),
      parsed,
      "stable reproduction parameters replay exactly"
    );
    report.reproduction = {
      exportDigest: digest(parsed),
      geometryDigest: originalShape,
      replayExact: true
    };
    await closeControls(page);
    const selectedCases: Record<string, unknown>[] = [];
    for (const target of historicalCases) {
      await page.evaluate((id) => {
        const url = new URL(location.href);
        url.searchParams.set("gsEvent", id);
        url.searchParams.set("gsStage", "peek");
        history.replaceState(null, "", url);
        dispatchEvent(new PopStateEvent("popstate", { state: null }));
      }, target.id);
      await page
        .getByTestId("event-drawer-sheet")
        .waitFor({ state: "visible" });
      const selected = await settle(page, "organic");
      assert.equal(selected.selectedEventId, target.id);
      for (const mode of ["anchored", "organic"] as const) {
        const switched = await switchMode(page, mode);
        assert.equal(switched.selectedEventId, target.id);
        sameCamera(switched.liveView, selected.liveView);
        assert(await page.getByTestId("event-drawer-sheet").isVisible());
        coordinates(switched, artifact);
      }
      await screenshot(page, `${profile.name}-selected-${target.id}`);
      selectedCases.push({ ...target, selectionAndCameraPreserved: true });
      await page.getByTestId("event-drawer-close").click();
    }
    report.historicalCases = selectedCases;
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(failedHTTP, []);
    assert.deepEqual(
      writes,
      [],
      "Lab tuning makes no authoring or publication writes"
    );
    report.passed = true;
  } catch (error) {
    failures++;
    report.passed = false;
    report.error = error instanceof Error ? error.stack : String(error);
    report.failureInspection = await inspect(page).catch(() => null);
    await screenshot(page, `${profile.name}-failure`).catch(() => {});
  } finally {
    writeFileSync(
      resolve(output, "report.json"),
      JSON.stringify(
        { schema: "organic-product-browser-evidence/1", reports },
        null,
        2
      ) + "\n"
    );
    await context.close();
    await remote?.dispose();
    await browser.close();
    console.info(
      JSON.stringify({
        profile: profile.name,
        passed: report.passed,
        error: report.error
      })
    );
  }
}
if (failures) process.exitCode = 1;
