/** Real-r56 visual acceptance for smooth filled regions on exact B0 coordinates.
 * Usage: tsx scripts/tstl-research/smooth-product-smoke.ts BASE_URL OUTPUT_DIR [SHA]
 * TSTL_SMOOTH_VISUAL_ONLY=1 captures the comparison before interaction tests.
 * With that flag, TSTL_SMOOTH_VIEW=yi-shared isolates the recovery regression.
 * Browser emulation and synthetic gestures are not physical iPhone/PWA evidence.
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
  type TstlExperimentArtifact,
  type TstlExperimentPoint
} from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";
const baseURL = process.argv[2] ?? "http://127.0.0.1:3000";
const output = resolve(process.argv[3] ?? ".artifacts/tstl-smooth/smoke");
const expectedSha = process.argv[4];
const graphPath = process.env.TSTL_SMOKE_GRAPH_PATH ?? "/graph/v5";
const readProxy = process.env.TSTL_SMOKE_READ_PROXY;
const world = "01a107fb-4018-7fcb-8390-836a40fa91cc";
const initialCamera = "300,223420,1400,1800";
const graph = graphPath + "?world=" + world + "&gsViewport=" + initialCamera;
const placement = process.env.TSTL_PLACEMENT_SMOKE === "1";
const smoothModes = placement
  ? (["lanes", "aligned", "anchored"] as const)
  : (["bubble", "ribbon"] as const);
const modes = ["B0", ...smoothModes] as const;
type Mode = (typeof modes)[number];
type SmoothMode = Exclude<Mode, "B0">;
const cases = [
  { id: "01a123a1-0000-751e-9e64-e7c7b6b89fbc", title: "한국사" },
  { id: "01a123a1-0000-77c0-8401-4f9db460625b", title: "일본사" },
  { id: "01a1240c-0000-73dd-bea1-64db15136c48", title: "중국사" },
  {
    id: "01a10a3f-05d2-7981-94f4-08f3ea6433ec",
    title: "임진왜란: 두 차례 침략과 강화 교섭"
  },
  { id: "1f10a329-835d-79b1-a9c3-ae1835934b8b", title: "이순신의 생애" }
];
const views = [
  { name: "reference-imjin", camera: initialCamera },
  { name: "imjin", camera: "260,223420,650,1800" },
  { name: "world", camera: "0,220900,1050,21000" },
  { name: "yi-shared", camera: "280,222950,430,500" }
];
if (placement) {
  views.push({ name: "world-wide", camera: "0,220900,1900,21000" });
}
const historicalCases = [
  ...cases,
  ...(placement
    ? [
        {
          id: "01a10817-869d-76e5-aa79-dae0d2b8bb05",
          title: "순천 왜교성 앞바다의 봉쇄"
        }
      ]
    : [])
];
const visualViews = process.env.TSTL_SMOOTH_VIEW
  ? views.filter((view) => view.name === process.env.TSTL_SMOOTH_VIEW)
  : views;
assert(visualViews.length, "unknown TSTL_SMOOTH_VIEW");
if (process.env.TSTL_SMOOTH_VIEW)
  assert.equal(process.env.TSTL_SMOOTH_VISUAL_ONLY, "1");
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
  (p) =>
    !process.env.TSTL_SMOKE_PROFILE || p.name === process.env.TSTL_SMOKE_PROFILE
);
assert(profiles.length, "unknown TSTL_SMOKE_PROFILE");
mkdirSync(output, { recursive: true });
type View = { x: number; y: number; scaleX: number; scaleY: number };
type Inspection = {
  loadState: string;
  revision: unknown;
  selectedEventId: string | null;
  selection: string[];
  view: View;
  liveView: View;
  viewportSize: { width: number; height: number };
  counts: Record<string, number | boolean | undefined>;
  sceneJobs?: { pending: number };
  workerJobs?: { running: number; pending: number } | null;
  cache: Record<string, number> | null;
  representation: Record<string, number>;
  renderer?: { renderer: string; state: string; fallback?: string } | null;
  paintSourceKey?: string;
  browserGraphics?: {
    backend: string | null;
    paintSourceKey: string | undefined;
    paintRevision: number;
  };
  activeIds: { points: string[]; regions: string[]; edges: string[] };
  eventCoordinates?: { id: string; x: number; y: number }[];
  geometry: {
    id: string;
    contourMode?: string;
    fillRule?: string;
    rings?: TstlExperimentPoint[][];
    anchor?: TstlExperimentPoint;
  }[];
  fixedContourPaint: {
    id: string;
    path: string;
    ringCount: number;
    fillRule?: string;
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
    const inspected = value as Inspection | null;
    if (!inspected) return null;
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="geographic-webgl"]'
    );
    return {
      ...inspected,
      browserGraphics: {
        backend:
          document
            .querySelector('svg[aria-label="Projected chart surface"]')
            ?.getAttribute("data-graphics-painter") ?? null,
        paintSourceKey: canvas?.dataset.paintSourceKey,
        paintRevision: Number(canvas?.dataset.paintRevision ?? 0)
      }
    };
  });
}
async function settleGraphics(page: Page, mode: Mode) {
  const coherent = (state: Inspection | null): state is Inspection => {
    if (!isCommittedScene(state) || state.paintSourceKey !== "tstl:" + mode)
      return false;
    if (state.browserGraphics?.backend === "webgl")
      return (
        state.renderer?.state === "ready" &&
        state.renderer.renderer === "custom-webgl2" &&
        state.browserGraphics.paintSourceKey === "tstl:" + mode &&
        state.browserGraphics.paintRevision > 0
      );
    return (
      mode === "B0" &&
      state.browserGraphics?.backend === "svg" &&
      state.renderer?.state === "fallback" &&
      state.renderer.fallback === "non_simple_geographic_path"
    );
  };
  const deadline = performance.now() + 30_000;
  let last: Inspection | null = null;
  while (performance.now() < deadline) {
    last = await inspect(page);
    assert.notEqual(last?.loadState, "error", "graph loader failed");
    if (coherent(last)) {
      await page.waitForTimeout(100);
      const confirmed = await inspect(page);
      if (coherent(confirmed)) return confirmed;
    }
    await page.waitForTimeout(100);
  }
  throw Error(
    "graphics did not settle: " +
      JSON.stringify({
        mode,
        source: last?.paintSourceKey,
        renderer: last?.renderer,
        actual: last?.browserGraphics
      })
  );
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
async function openGraphTab(page: Page) {
  const button = page.getByRole("button", { name: "공개 그래프", exact: true });
  const box = await button.boundingBox();
  assert(box);
  // The Next development indicator covers the center of this first mobile
  // tab in the local mount. Use an uncovered point inside the real button;
  // no forced click or suppression of runtime errors is needed.
  await button.click({ position: { x: box.width - 12, y: box.height / 2 } });
}
function summary(state: Inspection) {
  assert.equal(
    new Set(state.activeIds.points).size,
    state.activeIds.points.length,
    "one point per Event"
  );
  assert.equal(
    new Set(state.activeIds.regions).size,
    state.activeIds.regions.length,
    "one owner per Composite"
  );
  return {
    revision: state.revision,
    selectedEventId: state.selectedEventId,
    view: state.view,
    counts: state.counts,
    representation: state.representation,
    activeIds: state.activeIds,
    sceneJobs: state.sceneJobs,
    workerJobs: state.workerJobs,
    renderer: state.renderer,
    browserGraphics: state.browserGraphics,
    paintSourceKey: state.paintSourceKey
  };
}
async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: resolve(output, name + ".png"),
    fullPage: true
  });
}
async function switchMode(page: Page, mode: Mode) {
  await page.getByTestId("tstl-compare-" + mode).click();
  await settle(page, mode);
  const state = await settleGraphics(page, mode);
  const controls = await page
    .locator('[data-testid^="tstl-compare-"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const s = getComputedStyle(node),
          b = node.getBoundingClientRect(),
          hit = document.elementFromPoint(
            b.x + b.width / 2,
            b.y + b.height / 2
          );
        return {
          id: node.getAttribute("data-testid"),
          pressed: node.getAttribute("aria-pressed"),
          background: s.backgroundColor,
          reachable: hit === node || node.contains(hit)
        };
      })
    );
  const active = controls.filter((c) => c.pressed === "true");
  assert.equal(active.length, 1);
  assert.equal(active[0]!.id, "tstl-compare-" + mode);
  assert(
    controls.every((c) => c.reachable),
    "all primary choices are reachable"
  );
  for (const c of controls.filter((c) => c.pressed !== "true"))
    assert.notEqual(
      c.background,
      active[0]!.background,
      "active mode is visually distinct"
    );
  return state;
}
async function checkMembershipList(
  page: Page,
  artifact: TstlExperimentArtifact,
  mode: SmoothMode
) {
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByTestId(`tstl-layout-${mode}`).click();
  await settle(page);
  const expected =
    tstlCandidate(artifact, mode).memberships?.filter(
      (entry) => entry.status === "list"
    ) ?? [];
  if (!placement)
    assert(
      expected.length,
      `Candidate ${mode} discloses memberships not represented by area`
    );
  const panel = page.getByTestId("tstl-membership-fallback");
  assert.equal(await panel.getAttribute("data-mode"), mode);
  assert.equal(
    Number(await panel.getAttribute("data-count")),
    expected.length,
    "list count is exact, not a synthetic Event count"
  );
  if (!expected.length) {
    await openGraphTab(page);
    await settle(page, mode);
    return {
      count: 0,
      sourceMemberships: tstlCandidate(artifact, mode).memberships!.length
    };
  }
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
  await settle(page, mode);
  const selected = await settleGraphics(page, mode);
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
function b0Coordinates(artifact: TstlExperimentArtifact) {
  const points = new Map<string, TstlExperimentPoint>();
  for (const p of artifact.b0Primitives) {
    if (p.entity.kind === "composite") {
      assert(p.composite?.anchor);
      points.set(p.entity.id, p.composite.anchor);
    } else if (p.entity.kind === "event" && p.geometry.kind === "point")
      points.set(p.entity.id, p.geometry.xy);
  }
  assert.equal(
    points.size,
    539,
    "all r56 Event points and Composite anchors are represented"
  );
  return points;
}
function assertCoordinates(
  state: Inspection,
  artifact: TstlExperimentArtifact,
  mode: Mode = "B0"
) {
  const expected = b0Coordinates(artifact);
  if (mode !== "B0")
    for (const [id, point] of expected)
      expected.set(id, {
        ...point,
        x: tstlCandidate(artifact, mode).xByEventId[id]!
      });
  assert(
    state.eventCoordinates?.length,
    "source Event coordinates must be inspectable"
  );
  for (const p of state.eventCoordinates) {
    const xy = expected.get(p.id);
    assert(xy, "unknown Event coordinate");
    assert.equal(p.x, xy.x, "Event X matches the selected offline candidate");
    assert.equal(p.y, xy.y, "Event Y remains exactly B0");
  }
  for (const geometry of state.geometry.filter((g) => g.anchor)) {
    assert.deepEqual(
      geometry.anchor,
      expected.get(geometry.id),
      "Composite anchor matches candidate X and original Y"
    );
  }
  return {
    events: state.eventCoordinates.length,
    anchors: state.geometry.filter((g) => g.anchor).length
  };
}
function contains(ring: TstlExperimentPoint[], p: TstlExperimentPoint) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function boundaryMetrics(rings: TstlExperimentPoint[][]) {
  const edges = new Map<string, number>();
  let diagonalEdges = 0,
    totalEdges = 0,
    sharedRingEdges = 0;
  rings.forEach((ring, ri) =>
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length]!;
      if (p.x === q.x && p.y === q.y) return;
      totalEdges++;
      if (p.x !== q.x && p.y !== q.y) diagonalEdges++;
      const key = [JSON.stringify(p), JSON.stringify(q)].sort().join("|");
      if (edges.has(key) && edges.get(key) !== ri) sharedRingEdges++;
      else edges.set(key, ri);
    })
  );
  const holes = rings.filter(
    (ring, i) =>
      rings.filter((other, j) => i !== j && contains(other, ring[0]!)).length %
        2 ===
      1
  ).length;
  return {
    rings: rings.length,
    holes,
    outerComponents: rings.length - holes,
    vertices: rings.reduce((n, r) => n + r.length, 0),
    diagonalEdges,
    totalEdges,
    sharedRingEdges
  };
}
function holeProbes(rings: TstlExperimentPoint[][]) {
  const probes: TstlExperimentPoint[] = [];
  for (const [index, ring] of rings.entries()) {
    const depth = rings.filter(
      (other, otherIndex) => otherIndex !== index && contains(other, ring[0]!)
    ).length;
    if (depth % 2 !== 1) continue;
    const xs = ring.map((p) => p.x),
      ys = ring.map((p) => p.y);
    const epsilon = Math.max(
      1e-7,
      Math.min(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys)
      ) / 1000
    );
    const interior = (point: TstlExperimentPoint) =>
      contains(ring, point) &&
      rings.filter((other) => contains(other, point)).length % 2 === 0;
    const centerCandidates = [
      {
        x: xs.reduce((a, b) => a + b, 0) / xs.length,
        y: ys.reduce((a, b) => a + b, 0) / ys.length
      },
      {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2
      }
    ];
    let found: TstlExperimentPoint | undefined =
      centerCandidates.find(interior);
    for (let i = 0; i < ring.length && !found; i++) {
      const a = ring[i]!,
        b = ring[(i + 1) % ring.length]!,
        dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy);
      if (!length) continue;
      for (const sign of [-1, 1]) {
        const point = {
          x: (a.x + b.x) / 2 - ((sign * dy) / length) * epsilon,
          y: (a.y + b.y) / 2 + ((sign * dx) / length) * epsilon
        };
        if (interior(point)) {
          found = point;
          break;
        }
      }
    }
    assert(
      found,
      "each final hole must have an independently sampled interior"
    );
    probes.push(found);
  }
  return probes;
}
function assertArtifact(artifact: TstlExperimentArtifact) {
  assert.equal(
    artifact.source.fixtureSha256,
    "5957645873d0484244e317a99c459df025e2d80d07dc5819e79c62569c716b64"
  );
  const expected = b0Coordinates(artifact);
  const metrics: Record<string, unknown> = {};
  for (const mode of smoothModes) {
    const candidate = tstlCandidate(artifact, mode);
    assert.equal(candidate.fillRule, "evenodd");
    for (const [id, xy] of expected) {
      if (!placement)
        assert.equal(candidate.xByEventId[id], xy.x, mode + " exact B0 X");
      else
        assert(
          Number.isFinite(candidate.xByEventId[id]),
          mode + " finite X for every original ID"
        );
    }
    for (const p of artifact.b0Primitives.filter(
      (p) => p.entity.kind === "composite"
    ))
      if (!placement)
        assert.deepEqual(
          candidate.worldBoundsByCompositeId[p.entity.id],
          p.composite?.worldBounds,
          "unchanged semantic bounds"
        );
      else {
        assert.equal(
          candidate.worldBoundsByCompositeId[p.entity.id]!.minY,
          p.composite!.worldBounds.minY
        );
        assert.equal(
          candidate.worldBoundsByCompositeId[p.entity.id]!.maxY,
          p.composite!.worldBounds.maxY
        );
      }
    const owners = cases.map((c) => {
      const rings = candidate.contoursByCompositeId[c.id];
      assert(rings?.length, mode + " must show a filled historical case");
      const measured = boundaryMetrics(rings);
      assert.equal(
        measured.sharedRingEdges,
        0,
        "final rings must not be internal tile boundaries"
      );
      assert(
        measured.diagonalEdges > 0,
        "smooth region cannot be only axis-aligned boxes"
      );
      return { ...c, ...measured };
    });
    metrics[mode] = {
      algorithmVersion: candidate.algorithmVersion,
      diagnostics: candidate.diagnostics,
      limitations: candidate.limitations,
      owners
    };
  }
  return metrics;
}
async function assertCompoundPaint(
  page: Page,
  state: Inspection,
  artifact: TstlExperimentArtifact,
  mode: SmoothMode
) {
  const candidate = tstlCandidate(artifact, mode);
  assert(
    Number(state.counts.fixedContourRegions) > 0,
    "smooth candidate must paint filled regions"
  );
  assert(state.fixedContourPaint.length > 0, "final contour paths must exist");
  assert.equal(
    state.renderer?.state,
    "ready",
    "actual renderer must be ready, not a stale WebGL DOM attribute after failure"
  );
  assert.equal(state.renderer?.renderer, "custom-webgl2");
  assert.equal(state.paintSourceKey, "tstl:" + mode);
  for (const geometry of state.geometry.filter(
    (g) => g.contourMode === "fixed"
  )) {
    assert.equal(geometry.fillRule, "evenodd");
    assert.deepEqual(
      geometry.rings,
      candidate.contoursByCompositeId[geometry.id],
      "prepared source rings remain exact"
    );
  }
  for (const paint of state.fixedContourPaint) {
    assert.equal(paint.fillRule, "evenodd");
    const rings = candidate.contoursByCompositeId[paint.id] ?? [];
    assert.equal(paint.ringCount, rings.length);
    const tokens =
      paint.path.match(/[MLZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ??
      [];
    assert(
      !/[CQSA]/i.test(paint.path),
      "renderer must use the final offline flattened boundary"
    );
    const translation = paint.pathTransform?.match(
      /^translate\(([^ ]+) ([^)]+)\)$/
    );
    assert(!paint.pathTransform || translation);
    const dx = Number(translation?.[1] ?? 0),
      dy = Number(translation?.[2] ?? 0);
    let cursor = 0;
    for (const ring of rings) {
      for (const [index, p] of ring.entries()) {
        assert.equal(tokens[cursor++], index ? "L" : "M");
        const x = Number(tokens[cursor++]) + dx,
          y = Number(tokens[cursor++]) + dy;
        assert(
          Math.abs(
            x -
              (paint.paintViewport.width / 2 +
                paint.paintView.x +
                p.x * paint.paintView.scaleX)
          ) < 1e-6
        );
        assert(
          Math.abs(
            y -
              (paint.paintViewport.height / 2 +
                paint.paintView.y +
                p.y * paint.paintView.scaleY)
          ) < 1e-6
        );
      }
      assert.equal(tokens[cursor++], "Z");
    }
    assert.equal(cursor, tokens.length);
  }
  const actual = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="geographic-webgl"]'
    );
    return {
      backend: document
        .querySelector('svg[aria-label="Projected chart surface"]')
        ?.getAttribute("data-graphics-painter"),
      meshCount: Number(canvas?.dataset.meshCount ?? 0),
      compoundMeshCount: Number(canvas?.dataset.compoundMeshCount ?? 0),
      paintRevision: Number(canvas?.dataset.paintRevision ?? 0),
      paintSourceKey: canvas?.dataset.paintSourceKey,
      paths: [
        ...document.querySelectorAll(
          "[data-composite-paint-id] > path:first-child"
        )
      ].map((p) => ({
        id: p.parentElement?.getAttribute("data-composite-paint-id"),
        d: p.getAttribute("d"),
        fillRule: p.getAttribute("fill-rule")
      }))
    };
  });
  assert.equal(actual.backend, "webgl");
  assert.equal(
    actual.paintSourceKey,
    "tstl:" + mode,
    "the WebGL backend must have successfully painted this accepted source"
  );
  assert(
    actual.compoundMeshCount > 0 &&
      actual.meshCount >= actual.compoundMeshCount &&
      actual.paintRevision > 0,
    "actual WebGL must paint compound meshes with holes"
  );
  for (const path of actual.paths) {
    const paint = state.fixedContourPaint.find((p) => p.id === path.id);
    if (!paint) continue;
    assert.equal(path.fillRule, "evenodd");
    assert.equal(
      path.d,
      paint.path,
      "actual SVG contour matches the source-checked final path"
    );
  }
  const probes = state.fixedContourPaint.flatMap((paint) => {
    const translation = paint.pathTransform?.match(
      /^translate\(([^ ]+) ([^)]+)\)$/
    );
    return holeProbes(candidate.contoursByCompositeId[paint.id] ?? []).map(
      (point) => ({
        id: paint.id,
        x:
          paint.paintViewport.width / 2 +
          paint.paintView.x +
          point.x * paint.paintView.scaleX -
          Number(translation?.[1] ?? 0),
        y:
          paint.paintViewport.height / 2 +
          paint.paintView.y +
          point.y * paint.paintView.scaleY -
          Number(translation?.[2] ?? 0)
      })
    );
  });
  const holeChecks = await page.evaluate(
    (probes) =>
      probes.map((probe) => {
        const path = document.querySelector<SVGGeometryElement>(
          `[data-composite-paint-id="${probe.id}"] > path:first-child`
        );
        return {
          id: probe.id,
          present: Boolean(path),
          insideFill: path?.isPointInFill(new DOMPoint(probe.x, probe.y))
        };
      }),
    probes
  );
  for (const check of holeChecks) {
    assert(check.present, "source-checked compound SVG path must exist");
    assert.equal(
      check.insideFill,
      false,
      `actual even-odd SVG fill must preserve the hole interior for ${check.id}`
    );
  }
  return {
    backend: actual.backend,
    meshCount: actual.meshCount,
    compoundMeshCount: actual.compoundMeshCount,
    paintRevision: actual.paintRevision,
    paintSourceKey: actual.paintSourceKey,
    svgCompoundPaths: actual.paths.filter((p) => p.fillRule === "evenodd")
      .length,
    actualHoleInteriorsChecked: holeChecks.length,
    coordinates: assertCoordinates(state, artifact, mode)
  };
}
const results: Record<string, unknown>[] = [];
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
    locale: "ko-KR",
    deviceScaleFactor: 1,
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
      const source = route.request(),
        headers = {
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
  page.setDefaultTimeout(30_000);
  const errors: string[] = [],
    failedHTTP: { path: string; status: number }[] = [],
    requests: string[] = [],
    pending: Promise<void>[] = [];
  let artifact: TstlExperimentArtifact | undefined,
    artifactSha256: string | undefined;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).origin === new URL(baseURL).origin)
      requests.push(new URL(r.url()).pathname);
  });
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (r.status() >= 400) failedHTTP.push({ path, status: r.status() });
    if (/\/labs\/tstl\/r56.*\.json$/.test(path))
      pending.push(
        (async () => {
          const bytes = await r.body();
          artifactSha256 = createHash("sha256").update(bytes).digest("hex");
          artifact = JSON.parse(bytes.toString()) as TstlExperimentArtifact;
        })()
      );
  });
  const result: Record<string, unknown> = {
    profile: profile.name,
    viewport: { width: profile.width, height: profile.height },
    errors,
    failedHTTP,
    visualOnly: process.env.TSTL_SMOOTH_VISUAL_ONLY === "1",
    visualViews: visualViews.map((view) => view.name),
    visualReview:
      "Screenshots require a separate human or agent visual review; geometric checks alone do not establish visual quality."
  };
  results.push(result);
  try {
    if (expectedSha) {
      const response = await context.request.get("/__status");
      assert(response.ok());
      const status = await response.json();
      assert.equal(status.application.commit_sha, expectedSha);
      result.observedSHA = status.application.commit_sha;
    }
    assert((await page.goto(graph, { waitUntil: "domcontentloaded" }))?.ok());
    await page.getByTestId("graph-stage").waitFor({ state: "visible" });
    const current = await settle(page);
    assert.equal(current.counts.fixedContourRegions, 0);
    assert.equal(
      requests.filter((p) => /\/labs\/tstl\/r56.*\.json$/.test(p)).length,
      0,
      "default mode does not load experimental artifact"
    );
    result.defaultCurrent = summary(current);
    assert(
      (
        await page.goto(graph + "&layoutLab=B0", {
          waitUntil: "domcontentloaded"
        })
      )?.ok()
    );
    await settle(page, "B0");
    await Promise.all(pending);
    assert(artifact);
    result.artifactSha256 = artifactSha256;
    result.source = artifact.source;
    result.geometryMetrics = assertArtifact(artifact);
    const renderRequests = requests.filter(
      (p) => p === "/graph/v5/render"
    ).length;
    const comparisons: Record<string, unknown>[] = [];
    result.comparisons = comparisons;
    for (const view of visualViews) {
      const first = await restoreCamera(page, view.camera);
      const states: Record<string, unknown> = {};
      comparisons.push({ ...view, modes: states });
      for (const mode of modes) {
        const state = await switchMode(page, mode);
        sameCamera(state.liveView, first.liveView);
        const painted: Record<string, unknown> & {
          backend: string | null | undefined;
        } =
          mode === "B0"
            ? {
                coordinates: assertCoordinates(state, artifact),
                backend: state.browserGraphics?.backend
              }
            : await assertCompoundPaint(page, state, artifact, mode);
        if (mode === "B0" && painted.backend === "webgl") {
          assert.equal(state.renderer?.state, "ready");
          assert.equal(state.renderer?.renderer, "custom-webgl2");
        } else if (mode === "B0") {
          // The unchanged legacy Korea B0 contour self-intersects at this
          // camera. Preserve its honest SVG fallback, then require each
          // smooth layout to recover actual WebGL in the same GraphShell.
          assert.equal(view.name, "yi-shared");
          assert.equal(painted.backend, "svg");
          assert.equal(state.renderer?.fallback, "non_simple_geographic_path");
        }
        states[mode] = { ...summary(state), painted };
        await screenshot(page, profile.name + "-" + mode + "-" + view.name);
        console.info(
          JSON.stringify({
            profile: profile.name,
            phase: "visual",
            view: view.name,
            mode
          })
        );
      }
    }
    if (process.env.TSTL_SMOOTH_VISUAL_ONLY !== "1") {
      const interactions: Record<string, unknown> = {};
      for (const mode of smoothModes) {
        console.info(
          JSON.stringify({ profile: profile.name, phase: "interaction", mode })
        );
        await switchMode(page, mode);
        const imjin = await restoreCamera(page, views[1]!.camera);
        const x = await pinch(page, "x"),
          y = await pinch(page, "y");
        await assertCompoundPaint(
          page,
          await settle(page, mode),
          artifact,
          mode
        );
        const target = await waitForGraphReadTarget(page);
        await page.mouse.click(target.x, target.y);
        await page
          .getByTestId("event-drawer-sheet")
          .waitFor({ state: "visible" });
        const selected = await settle(page, mode);
        assert.equal(selected.selectedEventId, target.id);
        for (const compare of modes) {
          const state = await switchMode(page, compare);
          sameCamera(state.liveView, selected.liveView);
          assert.equal(state.selectedEventId, target.id);
          assert(await page.getByTestId("event-drawer-sheet").isVisible());
        }
        await page.getByTestId("event-drawer-close").click();
        await switchMode(page, mode);
        await page.getByTestId("graph-collection-trigger").click();
        const dialog = page.getByRole("dialog", {
          name: "컬렉션",
          exact: true
        });
        const checkbox = dialog.getByRole("checkbox", {
          name: "한국사",
          exact: true
        });
        assert(await checkbox.isChecked());
        const selections = () =>
          page.evaluate(() =>
            (new URL(location.href).searchParams.get("collections") ?? "")
              .split(",")
              .filter(Boolean)
              .sort()
          );
        const before = await selections();
        await checkbox.uncheck();
        await settle(page);
        const afterOff = await selections();
        assert.equal(afterOff.length, before.length - 1);
        await checkbox.check();
        await settle(page);
        assert.deepEqual(await selections(), before);
        await dialog.getByRole("button", { name: "닫기", exact: true }).click();
        const wide = await restoreCamera(page, views[2]!.camera);
        assert.notDeepEqual(
          wide.activeIds.points,
          imjin.activeIds.points,
          "production density changes visibility at wide scale"
        );
        interactions[mode] = {
          x,
          y,
          selectedEvent: target,
          collection: { before, afterOff },
          imjin: summary(imjin),
          wide: summary(wide)
        };
      }
      result.interactions = interactions;
      const historical: Record<string, unknown>[] = [];
      for (const c of historicalCases) {
        console.info(
          JSON.stringify({
            profile: profile.name,
            phase: "historical-drawer",
            id: c.id
          })
        );
        await openHistoricalCase(page, c.id);
        const camera = (await settle(page)).liveView;
        const selectedIDs: Record<string, string | null> = {};
        for (const mode of modes) {
          const state = await switchMode(page, mode);
          sameCamera(state.liveView, camera);
          assert.equal(state.selectedEventId, c.id);
          await page
            .getByTestId("event-drawer-sheet")
            .getByText(c.title, { exact: true })
            .first()
            .waitFor({ state: "visible" });
          selectedIDs[mode] = state.selectedEventId;
          if (placement && c.title === "이순신의 생애")
            await screenshot(page, profile.name + "-" + mode + "-selected-yi");
        }
        historical.push({ ...c, selectedIDs });
        await page.getByTestId("event-drawer-close").click();
      }
      result.historicalCases = historical;
      assert.equal(
        requests.filter((p) => /\/labs\/tstl\/r56.*\.json$/.test(p)).length,
        1,
        "mode/camera/Collection changes reuse one artifact"
      );
      assert.equal(
        requests.filter((p) => p === "/graph/v5/render").length,
        renderRequests,
        "experiments do not request viewport publications"
      );
      const membershipLists: Record<string, unknown> = {};
      for (const mode of smoothModes)
        membershipLists[mode] = await checkMembershipList(page, artifact, mode);
      result.membershipLists = membershipLists;
      const reloads: Record<string, unknown> = {};
      for (const mode of smoothModes) {
        console.info(
          JSON.stringify({ profile: profile.name, phase: "reload", mode })
        );
        await page.getByRole("button", { name: "설정", exact: true }).click();
        await page.getByTestId("tstl-layout-" + mode).click();
        await settle(page);
        if (mode === smoothModes.at(-1))
          await screenshot(page, profile.name + "-settings");
        await openGraphTab(page);
        await settle(page, mode);
        const before = await settleGraphics(page, mode);
        const url = new URL(page.url());
        if (process.env.TSTL_SMOKE_GRAPH_PATH) url.pathname = graphPath;
        url.searchParams.delete("layoutLab");
        await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
        await settle(page, mode);
        const after = await settleGraphics(page, mode);
        sameCamera(after.liveView, before.liveView);
        reloads[mode] = summary(after);
      }
      result.reloads = reloads;
      await page.getByRole("button", { name: "설정", exact: true }).click();
      await page.getByTestId("tstl-layout-current").click();
      await openGraphTab(page);
      const restored = await settle(page);
      assert.equal(await page.getByTestId("tstl-layout-status").count(), 0);
      assert.equal(restored.counts.fixedContourRegions, 0);
      result.returnedCurrent = summary(restored);
    }
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }));
    assert(
      overflow.document <= overflow.width && overflow.body <= overflow.width
    );
    result.overflow = overflow;
    assert.deepEqual(errors, []);
    assert.deepEqual(failedHTTP, []);
    result.passed = true;
  } catch (error) {
    failures++;
    result.passed = false;
    result.failure =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : String(error);
    result.lastInspection = await inspect(page)
      .then((s) => (s ? summary(s) : null))
      .catch(() => null);
    await screenshot(page, profile.name + "-failure").catch(() => {});
  } finally {
    await Promise.allSettled(pending);
    result.requestCounts = Object.fromEntries(
      [...new Set(requests)].map((p) => [
        p,
        requests.filter((x) => x === p).length
      ])
    );
    if (remote) await context.unrouteAll({ behavior: "wait" });
    await context.close();
    await remote?.dispose();
    await browser.close();
    writeFileSync(
      resolve(output, "report.json"),
      JSON.stringify(
        {
          baseURL,
          graphPath,
          readProxy,
          expectedSha,
          physicalDevice: "not tested",
          results
        },
        null,
        2
      ) + "\n"
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
