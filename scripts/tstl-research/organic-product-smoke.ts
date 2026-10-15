/** Read-only, real-r56 browser evidence for IP-017. Does not certify aesthetics.
 * Usage: tsx scripts/tstl-research/organic-product-smoke.ts BASE_URL OUTPUT_DIR [SHA]
 * ORGANIC_SMOKE_PROFILE selects one profile; ORGANIC_SMOKE_READ_PROXY supports a
 * local diagnostic build reading the unchanged public history service.
 * ORGANIC_SMOKE_INTERACTIONS_ONLY checks controls after separately recorded views.
 * ORGANIC_SMOKE_VISUAL_ONLY and ORGANIC_SMOKE_VIEW isolate a visual diagnostic.
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
const interactionsOnly = process.env.ORGANIC_SMOKE_INTERACTIONS_ONLY === "1";
const visualOnly = process.env.ORGANIC_SMOKE_VISUAL_ONLY === "1";
assert(
  !(interactionsOnly && visualOnly),
  "ORGANIC_SMOKE_INTERACTIONS_ONLY and ORGANIC_SMOKE_VISUAL_ONLY are mutually exclusive"
);
const world = "01a107fb-4018-7fcb-8390-836a40fa91cc";
const views = [
  { name: "imjin", camera: "260,223420,650,1800" },
  { name: "yi-shared", camera: "280,222950,430,500" },
  { name: "world", camera: "0,220900,1900,21000" }
].filter(
  (view) =>
    !process.env.ORGANIC_SMOKE_VIEW ||
    view.name === process.env.ORGANIC_SMOKE_VIEW
);
assert(views.length, "unknown ORGANIC_SMOKE_VIEW");
if (process.env.ORGANIC_SMOKE_VIEW)
  assert.equal(process.env.ORGANIC_SMOKE_VISUAL_ONLY, "1");
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
  sceneJobs?: { pending: number } | undefined;
  workerJobs?: { running: number; pending: number } | null | undefined;
  cache?: { pending?: number | undefined } | null | undefined;
  paintSourceKey?: string | undefined;
  renderer?:
    | { renderer: string; state: string; fallback?: string | undefined }
    | null
    | undefined;
  eventCoordinates?: { id: string; x: number; y: number }[] | undefined;
  geometryDigest?: string | undefined;
  fixedContourPaint?: {
    id: string;
    path: string;
    fillRule?: string;
    ringCount: number;
  }[];
  svgPaint?:
    | {
        expected: number;
        matched: number;
        visible: number;
        painter: string | undefined;
      }
    | undefined;
  geometry: {
    id: string;
    contourMode?: string | undefined;
    fillRule?: string | undefined;
    rings?: TstlExperimentPoint[][];
    ringCount?: number;
    vertexCount?: number;
    anchor?: TstlExperimentPoint | undefined;
  }[];
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const visible = (page: Page, id: string) =>
  page.locator(`[data-testid="${id}"]:visible`).first();
async function inspect(
  page: Page,
  withDigest = false
): Promise<Inspection | null> {
  return page.evaluate(async (withDigest) => {
    let value: Inspection | null = null;
    const receive = (event: Event) => {
      value = (event as CustomEvent<Inspection>).detail;
    };
    addEventListener("moirai:graph-inspection", receive, { once: true });
    dispatchEvent(new Event("moirai:inspect-graph"));
    removeEventListener("moirai:graph-inspection", receive);
    const state = value as Inspection | null;
    if (!state) return null;
    let geometryDigest: string | undefined;
    let svgPaint: Inspection["svgPaint"];
    if (state.renderer?.renderer === "svg") {
      const expected =
        state.fixedContourPaint?.filter((paint) => paint.path) ?? [];
      let matched = 0,
        visible = 0;
      for (const paint of expected) {
        const path = document.querySelector<SVGPathElement>(
          `[data-composite-paint-id="${paint.id}"] > path`
        );
        if (
          path?.getAttribute("d") === paint.path &&
          !/(?:NaN|Infinity)/.test(paint.path) &&
          path.getAttribute("fill-rule") === "evenodd"
        )
          matched++;
        if (path) {
          const style = getComputedStyle(path);
          if (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.fill !== "none" &&
            Number(style.opacity) > 0 &&
            Number(style.fillOpacity) > 0
          )
            visible++;
        }
      }
      svgPaint = {
        expected: expected.length,
        matched,
        visible,
        painter: document.querySelector<SVGElement>(
          'svg[aria-label="Projected chart surface"]'
        )?.dataset.graphicsPainter
      };
    }
    if (withDigest) {
      const geometry = state.geometry
        .filter((shape) => shape.rings?.length)
        .map((shape) => ({ id: shape.id, rings: shape.rings }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const bytes = new TextEncoder().encode(JSON.stringify(geometry));
      geometryDigest = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
      ]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }
    // Never send raw contours, SVG path strings, or the renderer cache through
    // the browser protocol. Polling those million-vertex structures perturbs
    // the very runtime being verified and can exhaust the test process.
    return {
      loadState: state.loadState,
      selectedEventId: state.selectedEventId,
      view: state.view,
      liveView: state.liveView,
      counts: state.counts,
      sceneJobs: state.sceneJobs,
      workerJobs: state.workerJobs,
      cache: { pending: state.cache?.pending },
      paintSourceKey: state.paintSourceKey,
      renderer: state.renderer
        ? {
            renderer: state.renderer.renderer,
            state: state.renderer.state,
            fallback: state.renderer.fallback
          }
        : null,
      eventCoordinates: state.eventCoordinates,
      geometryDigest,
      svgPaint,
      geometry: state.geometry.map((shape) => ({
        id: shape.id,
        contourMode: shape.contourMode,
        fillRule: shape.fillRule,
        anchor: shape.anchor,
        ringCount: shape.rings?.length ?? 0,
        vertexCount:
          shape.rings?.reduce((sum, ring) => sum + ring.length, 0) ?? 0
      }))
    };
  }, withDigest);
}
async function settle(
  page: Page,
  mode?: "anchored" | "organic",
  previousSource?: string
) {
  const deadline = Date.now() + 180_000;
  let previous = "";
  let quietSince = 0;
  let lastDOM: unknown;
  let lastInspection: unknown;
  let lastInspectedAt = 0;
  while (Date.now() < deadline) {
    // GraphShell's full inspection internally structuredClones every contour.
    // Poll only existing DOM paint counters, then inspect once after painting
    // is quiet. No million-vertex clone is allocated by this readiness loop.
    const painted = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="geographic-webgl"]'
      );
      const svg = document.querySelector<SVGElement>(
        'svg[aria-label="Projected chart surface"]'
      );
      const status = document.querySelector('[class*="chartViewportStatus"]');
      const fieldset = document.querySelector<HTMLFieldSetElement>(
        '[data-testid="organic-controls"] fieldset'
      );
      return {
        source: canvas?.dataset.paintSourceKey,
        revision: canvas?.dataset.paintRevision,
        activeTweens: Number(canvas?.dataset.activeTweens ?? 0),
        regions: Number(canvas?.dataset.regionCount ?? 0),
        points: Number(canvas?.dataset.pointCount ?? 0),
        renderer: svg?.dataset.renderer,
        svgRegions: document.querySelectorAll("[data-composite-paint-id]")
          .length,
        busy: Boolean(fieldset?.disabled),
        error: status?.textContent ?? null
      };
    });
    lastDOM = painted;
    assert(!painted.error, `graph loader failed: ${painted.error}`);
    const fallback = painted.renderer === "svg";
    const sourceReady =
      fallback ||
      (Boolean(painted.source) &&
        (!mode || painted.source?.startsWith("tstl:" + mode)) &&
        (!previousSource || painted.source !== previousSource));
    const signature = JSON.stringify(painted);
    if (
      sourceReady &&
      !painted.busy &&
      !painted.activeTweens &&
      (painted.regions > 0 || (fallback && painted.svgRegions > 0))
    ) {
      if (signature !== previous) quietSince = Date.now();
      else if (
        Date.now() - quietSince >= 2_000 &&
        Date.now() - lastInspectedAt >= 10_000
      ) {
        lastInspectedAt = Date.now();
        const state = await inspect(page);
        assert(state, "committed graph inspection exists");
        lastInspection = inspectionSummary(state);
        assert.notEqual(state.loadState, "error", "graph loader failed");
        // A quiet painted frame can precede completion of background geometry.
        // Keep the strict final gates, but retry full snapshots at most once
        // per ten seconds while cheap DOM polling continues in between.
        const ready =
          state.loadState === "ready" &&
          !state.cache?.pending &&
          !state.sceneJobs?.pending &&
          !state.workerJobs?.pending &&
          !state.workerJobs?.running &&
          !state.counts.stageActive &&
          !state.counts.exitingRegions &&
          (state.renderer?.state === "ready" ||
            (state.renderer?.state === "fallback" &&
              state.svgPaint?.painter === "svg")) &&
          (!mode || state.paintSourceKey?.startsWith("tstl:" + mode)) &&
          (!previousSource || state.paintSourceKey !== previousSource) &&
          (["x", "y", "scaleX", "scaleY"] as const).every(
            (key) => state.view[key] === state.liveView[key]
          );
        if (!ready) {
          quietSince = Date.now();
          await page.waitForTimeout(500);
          continue;
        }
        assert.equal(
          state.loadState,
          "ready",
          "graph loader ready after paint"
        );
        assert(!state.cache?.pending, "viewport cache is idle");
        assert(!state.sceneJobs?.pending, "scene scheduler is idle");
        assert(
          !state.workerJobs?.pending && !state.workerJobs?.running,
          "geometry worker is idle"
        );
        assert(
          !state.counts.stageActive && !state.counts.exitingRegions,
          "scene transitions finished"
        );
        assert(
          !mode || state.paintSourceKey?.startsWith("tstl:" + mode),
          "requested source painted"
        );
        assert(
          !previousSource || state.paintSourceKey !== previousSource,
          "new source painted"
        );
        sameCamera(state.view, state.liveView);
        return state;
      }
    } else quietSince = 0;
    previous = signature;
    await page.waitForTimeout(500);
  }
  throw Error(
    "graph paint did not settle: " +
      JSON.stringify({ dom: lastDOM, inspection: lastInspection })
  );
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
async function shapeEvidence(page: Page) {
  const inspected = await inspect(page, true);
  assert(inspected?.geometryDigest, "committed boundary digest is inspectable");
  if (inspected.renderer?.state === "fallback") {
    assert.equal(
      inspected.renderer.renderer,
      "svg",
      "fallback paints complete SVG geometry"
    );
    assert(
      [
        "geographic_path_budget",
        "geographic_vertex_budget",
        "geographic_contour_budget",
        "webgl_mesh_budget",
        "webgl_scene_budget"
      ].includes(inspected.renderer.fallback ?? ""),
      "only existing geometry-budget fallbacks with exact final SVG paint are accepted"
    );
    assert.equal(inspected.svgPaint?.painter, "svg");
    assert(
      inspected.svgPaint.expected > 0 && inspected.svgPaint.visible > 0,
      "fallback has visible final paths"
    );
    assert.equal(
      inspected.svgPaint.matched,
      inspected.svgPaint.expected,
      "every fallback path matches the exact final contour and evenodd fill"
    );
  } else
    assert.equal(
      inspected.renderer?.state,
      "ready",
      "renderer paints the scene"
    );
  assert(
    inspected.geometry.some((shape) => shape.ringCount && shape.vertexCount),
    "boundary digest covers nonempty final contours"
  );
  assert(
    Number(inspected.counts.fixedContourRegions) > 0 &&
      Number(inspected.counts.fixedContourRings) > 0,
    "final contours reach the painted fixed-region scene"
  );
  return {
    geometryDigest: inspected.geometryDigest,
    renderer: inspected.renderer,
    svgPaint: inspected.svgPaint
  };
}
async function shapeDigest(page: Page) {
  return (await shapeEvidence(page)).geometryDigest;
}
function inspectionSummary(state: Inspection | null) {
  if (!state) return null;
  return {
    loadState: state.loadState,
    selectedEventId: state.selectedEventId,
    view: state.view,
    liveView: state.liveView,
    counts: state.counts,
    sceneJobs: state.sceneJobs,
    workerJobs: state.workerJobs,
    source: state.paintSourceKey,
    renderer: state.renderer,
    svgPaint: state.svgPaint,
    eventCoordinates: state.eventCoordinates?.length,
    geometryDigest: state.geometryDigest,
    geometry: state.geometry.map((shape) => ({
      id: shape.id,
      contourMode: shape.contourMode,
      fillRule: shape.fillRule,
      rings: shape.ringCount ?? 0,
      vertices: shape.vertexCount ?? 0
    }))
  };
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
    await control.getByTestId("organic-controls-summary").click();
  return control;
}
async function revealDetails(page: Page, testId: string) {
  // Settings and the graph dock share these controls. Resolve nested details
  // inside the visible outer panel, even while the nested content is closed.
  const target = visible(page, "organic-controls").getByTestId(testId);
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
    await control.getByTestId("organic-controls-summary").click();
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
    incidentalResources: unknown[] = [],
    failedHTTP: unknown[] = [],
    writes: string[] = [],
    assets: Promise<void>[] = [];
  let artifact: TstlExperimentArtifact | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      // The pre-existing browser favicon probe returns 404 on the public site.
      // Record it explicitly; it is unrelated to graph/data/Organic requests.
      if (
        location.url &&
        new URL(location.url).pathname === "/favicon.ico" &&
        message.text().includes("404")
      ) {
        incidentalResources.push({
          kind: "console",
          path: "/favicon.ico",
          message: message.text()
        });
        return;
      }
      consoleErrors.push(
        `${message.text()} (${location.url}:${location.lineNumber ?? 0})`
      );
    }
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
    if (path === "/favicon.ico" && response.status() === 404)
      incidentalResources.push({ kind: "http", path, status: 404 });
    else if (response.status() >= 400)
      failedHTTP.push({ path, status: response.status() });
    // One immutable asset suffices for every comparison. A development HMR
    // navigation can invalidate later protocol response bodies; never leave
    // an unobserved promise from a redundant asset fetch.
    if (
      !artifact &&
      assets.length === 0 &&
      /\/labs\/tstl\/r56.*\.json$/.test(path)
    )
      assets.push(
        (async () => {
          artifact = (await response.json()) as TstlExperimentArtifact;
        })().catch((error: unknown) => {
          errors.push(`fixture response unreadable: ${String(error)}`);
        })
      );
  });
  const report: Record<string, unknown> = {
    profile: profile.name,
    surface: new URL(graphPath, baseURL).href,
    localDiagnostic: Boolean(readProxy || graphPath !== "/graph/v5"),
    readProxyUsed: Boolean(readProxy),
    readProxyOrigin: readProxy ? new URL(readProxy).origin : null,
    selectedViews: interactionsOnly ? [] : views.map((view) => view.name),
    viewport: { width: profile.width, height: profile.height },
    errors,
    consoleErrors,
    incidentalResources,
    failedHTTP,
    writes,
    visualOnly,
    interactionsOnly,
    visualAcceptance:
      "User review pending; browser emulation is not physical iPhone 17 Safari/PWA evidence."
  };
  reports.push(report);
  const phase = (value: string) => {
    report.phase = value;
    writeFileSync(
      resolve(output, `${profile.name}-progress.json`),
      JSON.stringify(report, null, 2) + "\n"
    );
    console.info(JSON.stringify({ profile: profile.name, phase: value }));
  };
  try {
    phase("deployment-and-navigation");
    if (expectedSha) {
      const response = await context.request.get("/__status");
      assert(response.ok());
      const status = await response.json();
      assert.equal(status.application.commit_sha, expectedSha);
      report.observedSHA = expectedSha;
    }
    const path = `${graphPath}?world=${world}&layoutLab=anchored&gsViewport=${views[0]!.camera}`;
    assert((await page.goto(path, { waitUntil: "domcontentloaded" }))?.ok());
    phase("anchored-ready");
    const initial = await settle(page, "anchored");
    await Promise.all(assets);
    assert(artifact);
    report.source = artifact.source;
    report.baselineCoordinates = coordinates(initial, artifact);
    const visual: Record<string, unknown>[] = [];
    report.views = visual;
    for (const view of interactionsOnly ? [] : views) {
      phase(`visual-${view.name}-anchored`);
      const anchor = await switchMode(page, "anchored");
      coordinates(anchor, artifact);
      const camera = await restoreCamera(page, view.camera);
      await screenshot(page, `${profile.name}-anchored-${view.name}`);
      phase(`visual-${view.name}-organic`);
      const organic = await switchMode(page, "organic");
      sameCamera(organic.liveView, camera.liveView);
      const coordinateCheck = coordinates(organic, artifact);
      assert(
        organic.geometry.some((shape) => shape.ringCount),
        "organic surface reaches the actual renderer"
      );
      for (const shape of organic.geometry.filter((shape) => shape.ringCount))
        assert.equal(
          shape.fillRule,
          "evenodd",
          "compound surfaces preserve holes"
        );
      visual.push({
        ...view,
        coordinates: coordinateCheck,
        ...(await shapeEvidence(page)),
        view: organic.liveView
      });
      // Retain the committed scene evidence even if the browser's screenshot
      // process itself crashes before it can return an image.
      await screenshot(page, `${profile.name}-organic-${view.name}`);
      console.info(
        JSON.stringify({
          profile: profile.name,
          phase: "visual",
          view: view.name
        })
      );
    }
    if (visualOnly) {
      assert.deepEqual(errors, []);
      assert.deepEqual(consoleErrors, []);
      assert.deepEqual(failedHTTP, []);
      assert.deepEqual(writes, []);
      report.passed = true;
      continue;
    }
    phase("organic-controls-switch");
    if (interactionsOnly) await switchMode(page, "organic");
    phase("organic-controls-camera");
    await restoreCamera(page, views[0]!.camera);
    phase("organic-controls-open");
    const panel = await controls(page);
    await revealDetails(page, "organic-inspector-composite");
    await panel
      .getByTestId("organic-inspector-composite")
      .selectOption(historicalCases[1]!.id);
    const before = await settle(page, "organic");
    const displays: Record<
      string,
      {
        geometryDigest: string;
        traces: number;
        diagnostics: string | null;
        renderer: Inspection["renderer"];
        svgPaint: Inspection["svgPaint"];
      }
    > = {};
    for (const mode of ["base", "padded", "overlay"] as const) {
      phase("display-" + mode);
      const previousSource = (await settle(page, "organic")).paintSourceKey;
      await panel.getByTestId(`organic-display-${mode}`).click();
      const state = await settle(page, "organic", previousSource);
      sameCamera(state.liveView, before.liveView);
      coordinates(state, artifact);
      const traces = Number(state.counts.fixedTraces ?? 0);
      if (mode === "overlay")
        assert(traces > 0, "overlay paints base-boundary traces");
      else assert.equal(traces, 0, `${mode} hides overlay traces`);
      displays[mode] = {
        ...(await shapeEvidence(page)),
        traces,
        diagnostics: await panel
          .getByTestId("organic-diagnostics")
          .textContent()
      };
      await closeControls(page);
      await screenshot(page, `${profile.name}-${mode}-surface`);
      await controls(page);
      await panel.getByTestId("organic-inspector-svg").scrollIntoViewIfNeeded();
      await screenshot(page, `${profile.name}-${mode}-inspection`);
    }
    assert.notEqual(
      displays.base!.geometryDigest,
      displays.padded!.geometryDigest,
      "default independent padding changes final contours"
    );
    assert.equal(
      displays.overlay!.geometryDigest,
      displays.padded!.geometryDigest,
      "overlay keeps the padded fill and adds the base outline"
    );
    report.displays = displays;
    phase("export");
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
    await settle(page, "organic");
    const originalShape = await shapeDigest(page);
    phase("recompute");
    const radius = panel.getByTestId("organic-parameter-radiusX");
    const radiusBefore = Number(await radius.inputValue());
    await radius.fill(String(radiusBefore + 2));
    const beforeRecompute = (await settle(page, "organic")).paintSourceKey;
    await panel.getByTestId("organic-recompute").click();
    await settle(page, "organic", beforeRecompute);
    const tunedShape = await shapeDigest(page);
    assert.notEqual(
      tunedShape,
      originalShape,
      "radius tuning changes final geometry"
    );
    await panel.getByTestId("organic-copy").click();
    assert.notEqual(
      await reproduction.inputValue(),
      exported,
      "tuned parameters are exported"
    );
    phase("import-replay");
    await reproduction.fill(exported);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      panel.getByTestId("organic-import").click()
    ]);
    const replay = await settle(page, "organic");
    sameCamera(replay.liveView, before.liveView);
    assert.equal(
      await shapeDigest(page),
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
      tunedGeometryDigest: tunedShape,
      replayExact: true
    };
    await closeControls(page);
    const selectedCases: Record<string, unknown>[] = [];
    for (const target of historicalCases) {
      phase("selection-" + target.id);
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
    report.failureInspection = inspectionSummary(
      await inspect(page).catch(() => null)
    );
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
