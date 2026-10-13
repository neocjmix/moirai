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
import {
  tstlCandidate,
  type TstlCandidateMode,
  type TstlExperimentArtifact,
  type TstlExperimentMode,
  type TstlExperimentPoint,
  type TstlExperimentTrace
} from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";

const baseURL = process.argv[2] ?? "http://127.0.0.1:3000";
const output = resolve(process.argv[3] ?? ".artifacts/tstl-product/smoke");
const expectedSha = process.argv[4];
const world = "01a107fb-4018-7fcb-8390-836a40fa91cc";
const initialCamera = "300,223420,1400,1800";
const wideCamera = "300,220900,1500,21000";
const candidateModes = ["A", "B", "C"] as const;
const historicalCases = [
  { id: "01a123a1-0000-751e-9e64-e7c7b6b89fbc", title: "한국사" },
  { id: "01a123a1-0000-77c0-8401-4f9db460625b", title: "일본사" },
  { id: "01a1240c-0000-73dd-bea1-64db15136c48", title: "중국사" },
  {
    id: "01a10a3f-05d2-7981-94f4-08f3ea6433ec",
    title: "임진왜란: 두 차례 침략과 강화 교섭"
  },
  { id: "1f10a329-835d-79b1-a9c3-ae1835934b8b", title: "이순신의 생애" }
];
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
  counts: {
    [key: string]: number | boolean | undefined;
    stageActive?: boolean;
    exitingRegions?: number;
    fixedContourRegions?: number;
    fixedContourRings?: number;
    fixedTraceRegions?: number;
    fixedTraces?: number;
  };
  sceneJobs?: { pending: number };
  workerJobs?: { running: number; pending: number } | null;
  representation: Record<string, number>;
  cache: Record<string, number> | null;
  activeIds: { points: string[]; regions: string[]; edges: string[] };
  geometry: {
    id: string;
    contourMode?: string;
    rings?: { x: number; y: number }[][];
    traces?: TstlExperimentTrace[];
  }[];
  fixedContourPaint: {
    id: string;
    path: string;
    ringCount: number;
    pathTransform: string | null;
    paintView: View;
    paintViewport: { width: number; height: number };
  }[];
  fixedTracePaint: {
    id: string;
    traces: { kind: string; eventId?: string; path: string }[];
    traceCount: number;
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
function isCommittedScene(state: Inspection | null): state is Inspection {
  return Boolean(
    state?.loadState === "ready" &&
    !state.cache?.pending &&
    !state.counts.exitingRegions &&
    !state.counts.stageActive &&
    !state.sceneJobs?.pending &&
    !state.workerJobs?.running &&
    !state.workerJobs?.pending &&
    (["x", "y", "scaleX", "scaleY"] as const).every(
      (key) => state.view[key] === state.liveView[key]
    )
  );
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
    if (isCommittedScene(state)) {
      // A ready data response may still be waiting for the eventual scene,
      // worker geometry or representation animation to finish committing.
      await page.waitForTimeout(260);
      const confirmed = await inspect(page);
      if (isCommittedScene(confirmed)) return confirmed;
    }
    await page.waitForTimeout(100);
  }
  const last = await inspect(page);
  throw Error(
    `graph did not settle: ${JSON.stringify(last ? summary(last) : null)}`
  );
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
    sceneJobs: state.sceneJobs,
    workerJobs: state.workerJobs,
    activeIds: state.activeIds,
    fixedPaint: state.fixedContourPaint?.map((paint) => ({
      id: paint.id,
      ringCount: paint.ringCount,
      pathSha256: createHash("sha256").update(paint.path).digest("hex")
    })),
    tracePaint: state.fixedTracePaint?.map((paint) => ({
      id: paint.id,
      traceCount: paint.traceCount,
      traces: paint.traces.map((trace) => ({
        kind: trace.kind,
        eventId: trace.eventId,
        pathSha256: createHash("sha256").update(trace.path).digest("hex")
      }))
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
  artifact: TstlExperimentArtifact,
  mode: TstlCandidateMode = "A"
) {
  const candidate = tstlCandidate(artifact, mode);
  if (mode === "A") {
    assert(
      (state.counts.fixedContourRegions ?? 0) > 0,
      "Candidate A must present filled fixed contours"
    );
    assert(
      (state.counts.fixedContourRings ?? 0) >
        (state.counts.fixedContourRegions ?? 0),
      "Candidate A must preserve multiple fragments"
    );
  }
  const fixed = state.geometry.filter(
    (geometry) => geometry.contourMode === "fixed"
  );
  if (mode === "A") assert(fixed.length > 0);
  for (const geometry of fixed)
    assert.deepEqual(
      geometry.rings ?? [],
      candidate.contoursByCompositeId[geometry.id] ?? [],
      `world rings changed for ${geometry.id}`
    );
  if (mode === "A")
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
    for (const ring of candidate.contoursByCompositeId[paint.id] ?? []) {
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
  if (state.fixedContourPaint.some((paint) => paint.ringCount > 0))
    assert(
      painter.regions > 0 && painter.paints > 0,
      `production background painter must draw areas: ${JSON.stringify(painter)}`
    );
  const traces =
    mode === "A" ? null : await assertTraces(page, state, artifact, mode);
  return { ...painter, traces };
}
function assertOpenPath(
  path: string,
  points: TstlExperimentPoint[],
  paint: Inspection["fixedTracePaint"][number]
) {
  assert(
    !/[ZCQSA]/i.test(path),
    "identity traces must remain open straight paths"
  );
  const translation = paint.pathTransform?.match(
    /^translate\(([^ ]+) ([^)]+)\)$/
  );
  assert(!paint.pathTransform || translation, "trace cache can only translate");
  const dx = Number(translation?.[1] ?? 0),
    dy = Number(translation?.[2] ?? 0);
  const tokens =
    path.match(/[ML]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let cursor = 0;
  for (const [index, point] of points.entries()) {
    assert.equal(tokens[cursor++], index === 0 ? "M" : "L");
    const x = Number(tokens[cursor++]) + dx,
      y = Number(tokens[cursor++]) + dy;
    const expectedX =
      paint.paintViewport.width / 2 +
      paint.paintView.x +
      point.x * paint.paintView.scaleX;
    const expectedY =
      paint.paintViewport.height / 2 +
      paint.paintView.y +
      point.y * paint.paintView.scaleY;
    assert(
      Math.abs(x - expectedX) < 1e-6 && Math.abs(y - expectedY) < 1e-6,
      `painted open trace vertex changed for ${paint.id}`
    );
  }
  assert.equal(
    cursor,
    tokens.length,
    "renderer introduced extra trace commands"
  );
}
async function assertTraces(
  page: Page,
  state: Inspection,
  artifact: TstlExperimentArtifact,
  mode: "B" | "C"
) {
  const candidate = tstlCandidate(artifact, mode);
  assert(
    (state.counts.fixedTraceRegions ?? 0) > 0,
    `Candidate ${mode} must render identity traces`
  );
  assert((state.counts.fixedTraces ?? 0) > 0);
  const sourceTraces = candidate.tracesByCompositeId;
  assert(sourceTraces);
  for (const geometry of state.geometry) {
    if (!geometry.traces?.length) continue;
    assert.deepEqual(
      geometry.traces,
      sourceTraces[geometry.id],
      `world traces changed for ${geometry.id}`
    );
  }
  assert(state.fixedTracePaint.length > 0, "traces reached presented paths");
  for (const paint of state.fixedTracePaint) {
    const expected: TstlExperimentTrace[] | undefined = sourceTraces[paint.id];
    assert(expected);
    assert.equal(paint.traceCount, expected.length);
    assert.equal(paint.traces.length, expected.length);
    for (const [index, trace] of paint.traces.entries()) {
      const source: TstlExperimentTrace = expected[index]!;
      assert.equal(trace.kind, source.kind);
      assert.equal(trace.eventId, source.eventId);
      assertOpenPath(trace.path, source.points, paint);
    }
  }
  const visible = await page
    .locator("path[data-composite-trace-owner]")
    .evaluateAll((paths) =>
      paths.map((path) => {
        const style = getComputedStyle(path);
        let opacity = 1;
        for (
          let parent: Element | null = path;
          parent;
          parent = parent.parentElement
        )
          opacity *= Number(getComputedStyle(parent).opacity);
        const box = path.getBoundingClientRect();
        const matrix = (path as SVGPathElement).getScreenCTM();
        const start = (path as SVGPathElement).getPointAtLength(0);
        const screenStart = matrix ? start.matrixTransform(matrix) : null;
        const rootMatrix = (
          path as SVGPathElement
        ).ownerSVGElement?.getScreenCTM();
        return {
          owner: path.getAttribute("data-composite-trace-owner"),
          kind: path.getAttribute("data-composite-trace-kind"),
          path: path.getAttribute("d") ?? "",
          fill: style.fill,
          stroke: style.stroke,
          strokeWidth: Number.parseFloat(style.strokeWidth),
          pointerEvents: style.pointerEvents,
          opacity,
          onScreen:
            box.right > 0 &&
            box.bottom > 0 &&
            box.left < innerWidth &&
            box.top < innerHeight,
          screenStart: screenStart
            ? { x: screenStart.x, y: screenStart.y }
            : null,
          rootMatrix: rootMatrix
            ? {
                a: rootMatrix.a,
                b: rootMatrix.b,
                c: rootMatrix.c,
                d: rootMatrix.d,
                e: rootMatrix.e,
                f: rootMatrix.f
              }
            : null
        };
      })
    );
  assert(visible.length > 0, "open traces must reach native production SVG");
  assert(
    visible.some((trace) => trace.opacity > 0 && trace.onScreen),
    "some identity strokes must be visible inside the actual viewport"
  );
  const inspectedPaths = new Set(
    state.fixedTracePaint.flatMap((paint) =>
      paint.traces.map((trace) =>
        JSON.stringify([paint.id, trace.kind, trace.path])
      )
    )
  );
  for (const trace of visible) {
    assert(
      trace.owner && sourceTraces[trace.owner],
      "trace has a real Composite owner"
    );
    assert.equal(
      trace.fill,
      "none",
      "an open identity trace must not fabricate a filled corridor"
    );
    assert.equal(
      trace.pointerEvents,
      "none",
      "trace crossings must not become relation hit targets"
    );
    assert(
      trace.stroke !== "none" && trace.strokeWidth > 0,
      "identity trace has visible stroke"
    );
    assert(
      !/[ZCQSA]/i.test(trace.path),
      "actual trace path must be open and unsmoothed"
    );
    assert(
      inspectedPaths.has(JSON.stringify([trace.owner, trace.kind, trace.path])),
      "actual SVG trace must match the source-checked inspected path"
    );
    const paint = state.fixedTracePaint.find(
      (paint) => paint.id === trace.owner
    )!;
    const index = paint.traces.findIndex(
      (entry) => entry.kind === trace.kind && entry.path === trace.path
    );
    const first = sourceTraces[paint.id]![index]!.points[0]!;
    assert(
      trace.rootMatrix && trace.screenStart,
      "actual trace has an SVG screen transform"
    );
    const liveX =
      paint.paintViewport.width / 2 +
      state.liveView.x +
      first.x * state.liveView.scaleX;
    const liveY =
      paint.paintViewport.height / 2 +
      state.liveView.y +
      first.y * state.liveView.scaleY;
    const matrix = trace.rootMatrix;
    const expectedX = matrix.a * liveX + matrix.c * liveY + matrix.e;
    const expectedY = matrix.b * liveX + matrix.d * liveY + matrix.f;
    assert(
      Math.abs(trace.screenStart.x - expectedX) < 0.01 &&
        Math.abs(trace.screenStart.y - expectedY) < 0.01,
      "actual SVG trace stays attached to its source under the live camera"
    );
  }
  return {
    regions: state.counts.fixedTraceRegions,
    inspectedPaths: state.counts.fixedTraces,
    actualPaths: visible.length
  };
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
async function openHistoricalCase(page: Page, eventId: string) {
  await page.evaluate((id) => {
    const url = new URL(location.href);
    url.searchParams.set("gsEvent", id);
    url.searchParams.set("gsStage", "peek");
    history.replaceState(null, "", url);
    dispatchEvent(new PopStateEvent("popstate", { state: null }));
  }, eventId);
  await page.getByTestId("event-drawer-sheet").waitFor({ state: "visible" });
  const state = await settle(page);
  assert.equal(
    state.selectedEventId,
    eventId,
    "shared Event URL opens its exact identity"
  );
  return state;
}
async function checkMembershipList(
  page: Page,
  artifact: TstlExperimentArtifact,
  mode: "B" | "C"
) {
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByTestId(`tstl-layout-${mode}`).click();
  await settle(page);
  const expected =
    tstlCandidate(artifact, mode).memberships?.filter(
      (entry) => entry.status === "list"
    ) ?? [];
  assert(
    expected.length,
    `Candidate ${mode} discloses omitted membership routes`
  );
  const panel = page.getByTestId("tstl-membership-fallback");
  assert.equal(await panel.getAttribute("data-mode"), mode);
  assert.equal(
    Number(await panel.getAttribute("data-count")),
    expected.length,
    "list count is exact, not a synthetic Event count"
  );
  await page.getByTestId("tstl-membership-summary").click();
  const owners = [...new Set(expected.map((entry) => entry.compositeId))].sort(
    (a, b) =>
      expected.filter((entry) => entry.compositeId === b).length -
        expected.filter((entry) => entry.compositeId === a).length ||
      a.localeCompare(b)
  );
  const owner = owners[0]!;
  await page.getByTestId("tstl-membership-owner").selectOption(owner);
  const expectedOwner = expected.filter((entry) => entry.compositeId === owner);
  const rows = () =>
    page.getByTestId("tstl-membership-row").evaluateAll((nodes) =>
      nodes.map((node) => ({
        compositeId: node.getAttribute("data-composite-id"),
        eventId: node.getAttribute("data-event-id")
      }))
    );
  const firstPage = await rows();
  assert.equal(firstPage.length, Math.min(30, expectedOwner.length));
  const knownPairs = new Set(
    expectedOwner.map((entry) => `${entry.compositeId}:${entry.eventId}`)
  );
  for (const row of firstPage)
    assert(
      knownPairs.has(`${row.compositeId}:${row.eventId}`),
      "list must disclose actual source membership"
    );
  assert.equal(
    new Set(firstPage.map((row) => row.eventId)).size,
    firstPage.length,
    "list does not clone Events"
  );
  if (expectedOwner.length > 30) {
    await page.getByTestId("tstl-membership-next").click();
    const secondPage = await rows();
    assert.equal(secondPage.length, Math.min(30, expectedOwner.length - 30));
    for (const row of secondPage) {
      assert(knownPairs.has(`${row.compositeId}:${row.eventId}`));
      assert(
        !firstPage.some((first) => first.eventId === row.eventId),
        "membership pages must be disjoint"
      );
    }
    await page.getByTestId("tstl-membership-previous").click();
    assert.deepEqual(await rows(), firstPage);
  }
  const link = page.getByTestId("tstl-membership-event").first();
  const href = await link.getAttribute("href");
  assert(href);
  const target = new URL(href, page.url());
  assert.equal(target.searchParams.get("layoutLab"), mode);
  assert.equal(target.searchParams.get("gsEvent"), firstPage[0]!.eventId);
  const before = await settle(page);
  if (process.env.TSTL_SMOKE_GRAPH_PATH) {
    // Only the local diagnostic substitutes its public-bootstrap mount.
    // Public acceptance follows the actual production link unchanged.
    target.pathname = graphPath;
    await page.goto(target.toString(), { waitUntil: "domcontentloaded" });
  } else await link.click();
  const selected = await settle(page, mode);
  assert.equal(selected.selectedEventId, firstPage[0]!.eventId);
  sameCamera(selected.liveView, before.liveView);
  await page.getByTestId("event-drawer-sheet").waitFor({ state: "visible" });
  await page.getByTestId("event-drawer-close").click();
  return {
    totalListMemberships: expected.length,
    owner,
    ownerMemberships: expectedOwner.length,
    firstPage,
    revealedEventId: selected.selectedEventId
  };
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
function assertActiveControl(
  controls: Awaited<ReturnType<typeof compareControls>>,
  mode: TstlExperimentMode
) {
  const active = controls.filter((control) => control.pressed === "true");
  assert.equal(active.length, 1, "exactly one compare mode is active");
  assert.equal(active[0]!.testId, `tstl-compare-${mode}`);
  assert.notEqual(
    active[0]!.background,
    "rgba(0, 0, 0, 0)",
    "active mode has a visible background outside the settings theme"
  );
  for (const control of controls.filter(
    (control) => control.pressed !== "true"
  ))
    assert.notEqual(
      active[0]!.background,
      control.background,
      "active mode is visually distinguishable from every other option"
    );
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
async function switchMode(page: Page, mode: TstlExperimentMode) {
  await page.getByTestId(`tstl-compare-${mode}`).click();
  const state = await settle(page, mode);
  assert.equal(
    await page.getByTestId(`tstl-compare-${mode}`).getAttribute("aria-pressed"),
    "true"
  );
  assertActiveControl(await compareControls(page), mode);
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
      defaultCurrent.counts.fixedTraces ?? 0,
      0,
      "fresh default has no experimental traces"
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
    assertActiveControl(
      result.compareControls as Awaited<ReturnType<typeof compareControls>>,
      "A"
    );
    assert(
      (
        result.compareControls as Awaited<ReturnType<typeof compareControls>>
      ).every((control) => control.reachable),
      "all mode controls remain reachable on this viewport"
    );
    await screenshot(page, `${profile.name}-A-imjin`);
    const b0 = await switchMode(page, "B0");
    sameCamera(b0.liveView, initial.liveView);
    assert.equal(
      b0.counts.fixedContourRegions,
      0,
      "B0 must not retain A paint"
    );
    assert.equal(
      b0.counts.fixedTraces ?? 0,
      0,
      "B0 must not retain experimental traces"
    );
    result.B0 = summary(b0);
    await screenshot(page, `${profile.name}-B0-imjin`);
    const initialCandidates: Record<string, unknown> = { A: summary(initial) };
    const candidatePainters: Record<string, unknown> = { A: result.painter };
    for (const mode of ["B", "C"] as const) {
      const candidate = await switchMode(page, mode);
      sameCamera(candidate.liveView, initial.liveView);
      initialCandidates[mode] = summary(candidate);
      candidatePainters[mode] = await assertPaint(
        page,
        candidate,
        artifact,
        mode
      );
      await screenshot(page, `${profile.name}-${mode}-imjin`);
    }
    result.initialCandidates = initialCandidates;
    result.candidatePainters = candidatePainters;
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
    assert(
      (
        result.drawerCompareControls as Awaited<
          ReturnType<typeof compareControls>
        >
      ).every((control) => control.reachable),
      "mode controls remain reachable over the Event drawer"
    );
    const selectedB0 = await switchMode(page, "B0");
    assert.equal(selectedB0.selectedEventId, target.id);
    sameCamera(selectedB0.liveView, selectedA.liveView);
    assert(await drawer.isVisible(), "mode switch retains drawer");
    const selectedModes: Record<string, unknown> = {
      A: summary(selectedA),
      B0: summary(selectedB0)
    };
    for (const mode of ["B", "C"] as const) {
      const selected = await switchMode(page, mode);
      assert.equal(selected.selectedEventId, target.id);
      sameCamera(selected.liveView, selectedA.liveView);
      assert(
        await drawer.isVisible(),
        `Candidate ${mode} retains selected Event drawer`
      );
      await assertPaint(page, selected, artifact, mode);
      selectedModes[mode] = summary(selected);
    }
    result.selectedModes = selectedModes;
    await switchMode(page, "A");
    await screenshot(page, `${profile.name}-selected-event`);
    result.selectedEvent = target;
    await page.getByTestId("event-drawer-close").click();
    const selectedCollections = () =>
      page.evaluate(() =>
        (new URL(location.href).searchParams.get("collections") ?? "")
          .split(",")
          .filter(Boolean)
          .sort()
      );
    const collectionToggles: Record<string, unknown> = {};
    for (const mode of candidateModes) {
      await switchMode(page, mode);
      await page.getByTestId("graph-collection-trigger").click();
      const dialog = page.getByRole("dialog", { name: "컬렉션", exact: true });
      await dialog.waitFor({ state: "visible" });
      const checkbox = dialog.getByRole("checkbox", {
        name: "한국사",
        exact: true
      });
      assert(await checkbox.isChecked(), "Korean history begins enabled");
      const allSelected = await selectedCollections();
      await checkbox.uncheck();
      const filtered = await settle(page);
      assert.equal(
        (await selectedCollections()).length,
        allSelected.length - 1,
        `${mode} Collection toggle changes existing production selection`
      );
      const afterOff = await selectedCollections();
      await checkbox.check();
      await settle(page);
      assert.deepEqual(await selectedCollections(), allSelected);
      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
      collectionToggles[mode] = {
        before: allSelected,
        afterOff,
        filtered: summary(filtered)
      };
    }
    result.collectionToggles = collectionToggles;
    assert.equal(
      requests.filter((path) => /\/labs\/tstl\/r56.*\.json$/.test(path)).length,
      1,
      "B0/A/B/C, camera and Collections reuse one artifact fetch"
    );
    assert.equal(
      requests.filter((path) => path === "/graph/v5/render").length,
      currentStartupRenderRequests,
      "active experiment must not fetch viewport publication tiles"
    );
    await switchMode(page, "A");
    const wide = await restoreCamera(page, wideCamera);
    result.wideA = summary(wide);
    assert.notDeepEqual(
      wide.activeIds.points,
      initial.activeIds.points,
      "zoom changes admitted and visible points through production density"
    );
    await screenshot(page, `${profile.name}-A-world`);
    await switchMode(page, "B0");
    await screenshot(page, `${profile.name}-B0-world`);
    const wideCandidates: Record<string, unknown> = { A: summary(wide) };
    const candidateGestures: Record<string, unknown> = {};
    for (const mode of ["B", "C"] as const) {
      const candidate = await switchMode(page, mode);
      sameCamera(candidate.liveView, wide.liveView);
      await assertPaint(page, candidate, artifact, mode);
      wideCandidates[mode] = summary(candidate);
      const imjin = initialCandidates[mode] as ReturnType<typeof summary>;
      assert.notDeepEqual(
        candidate.activeIds.points,
        imjin.activeIds.points,
        `${mode} uses production progressive visibility`
      );
      await screenshot(page, `${profile.name}-${mode}-world`);
      candidateGestures[mode] = {
        x: await pinch(page, "x"),
        y: await pinch(page, "y")
      };
      await restoreCamera(page, wideCamera);
    }
    result.wideCandidates = wideCandidates;
    result.candidateGestures = candidateGestures;
    const caseComparisons: Record<string, unknown>[] = [];
    for (const historicalCase of historicalCases) {
      const source: TstlExperimentArtifact["b0Primitives"][number] | undefined =
        artifact.b0Primitives.find(
          (primitive) => primitive.entity.id === historicalCase.id
        );
      assert.equal(
        source?.label,
        historicalCase.title,
        "historical acceptance uses the exact r56 Event"
      );
      await openHistoricalCase(page, historicalCase.id);
      const modes: Record<string, unknown> = {};
      for (const mode of ["B0", ...candidateModes] as const) {
        const state = await switchMode(page, mode);
        assert.equal(state.selectedEventId, historicalCase.id);
        sameCamera(state.liveView, wide.liveView);
        assert(
          await drawer.isVisible(),
          "historical case remains directly readable across layouts"
        );
        await page
          .getByTestId("event-drawer-sheet")
          .getByText(historicalCase.title, { exact: true })
          .first()
          .waitFor({ state: "visible" });
        modes[mode] = summary(state);
      }
      caseComparisons.push({
        ...historicalCase,
        parentCompositeIds: source?.parentCompositeIds,
        modes
      });
      await page.getByTestId("event-drawer-close").click();
    }
    result.historicalCases = caseComparisons;
    result.membershipLists = {
      B: await checkMembershipList(page, artifact, "B"),
      C: await checkMembershipList(page, artifact, "C")
    };
    const savedModeReloads: Record<string, unknown> = {};
    for (const mode of candidateModes) {
      await page.getByRole("button", { name: "설정", exact: true }).click();
      await page
        .getByTestId("tstl-layout-settings")
        .waitFor({ state: "visible" });
      for (const option of candidateModes)
        assert(
          await page.getByTestId(`tstl-layout-${option}`).isVisible(),
          `${option} is a real settings option`
        );
      await page.getByTestId(`tstl-layout-${mode}`).click();
      await page.waitForFunction(
        (mode) =>
          document
            .querySelector(`[data-testid="tstl-layout-${mode}"]`)
            ?.getAttribute("aria-pressed") === "true",
        mode
      );
      await settle(page);
      if (mode === "C") await screenshot(page, `${profile.name}-settings`);
      await openGraphTab(page);
      const persistedCamera = (await settle(page, mode)).liveView;
      const savedUrl = new URL(page.url());
      if (process.env.TSTL_SMOKE_GRAPH_PATH) savedUrl.pathname = graphPath;
      savedUrl.searchParams.delete("layoutLab");
      await page.goto(savedUrl.toString(), { waitUntil: "domcontentloaded" });
      const restored = await settle(page, mode);
      sameCamera(restored.liveView, persistedCamera);
      savedModeReloads[mode] = summary(restored);
    }
    result.savedModeReloads = savedModeReloads;
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
    assert.equal(
      returnedCurrent.counts.fixedTraces ?? 0,
      0,
      "returning to current discards experimental traces"
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
