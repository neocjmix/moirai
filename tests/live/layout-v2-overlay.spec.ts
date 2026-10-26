import { expect, test, type Page } from "@playwright/test";

const worldId =
  process.env.MOIRAI_OVERLAY_WORLD ?? "01a107fb-4018-7fcb-8390-836a40fa91cc";
const revision = Number(process.env.MOIRAI_OVERLAY_REVISION ?? "56");
const nodeCount = Number(process.env.MOIRAI_OVERLAY_NODES ?? "430");
const viewport = process.env.MOIRAI_OVERLAY_CAMERA ?? "0,223420,1050,1800";
const eventId =
  process.env.MOIRAI_OVERLAY_EVENT ?? "01a107ff-8b3c-7208-953d-53cc93fddb55";
const graph = `/graph/v5?world=${worldId}&event=${eventId}&layoutLab=force-v2&gsViewport=${viewport}&gsProfile=1`;

type State = {
  algorithm: string;
  tick: number;
  alpha: number;
  nodes: { id: string; x: number; y: number; vx: number }[];
};
type LabInspection = {
  mode: string;
  requestedTick: number;
  running: boolean;
  pending: boolean;
  error: string | null;
  state?: State;
  paintedState?: State;
  source?: unknown;
};
type GraphInspection = {
  paintSourceKey: string;
  revision: number;
  view: unknown;
  liveView: unknown;
  loadState: string;
  selection: string[];
  selectedEventId: string | null;
  geometry: { id: string; points: { x: number; y: number }[] }[];
  counts: { sourceEntities: number; sourceRegions: number };
};

async function lab(page: Page): Promise<LabInspection> {
  return page.evaluate(() => {
    let value: unknown;
    window.addEventListener(
      "moirai:layout-v2-inspection",
      (event) => {
        value = (event as CustomEvent).detail;
      },
      { once: true }
    );
    window.dispatchEvent(new Event("moirai:inspect-layout-v2"));
    if (!value) throw Error("Layout Lab v2 inspection is unavailable");
    return value as LabInspection;
  });
}
async function scene(page: Page): Promise<GraphInspection> {
  return page.evaluate(() => {
    let value: unknown;
    window.addEventListener(
      "moirai:graph-inspection",
      (event) => {
        value = (event as CustomEvent).detail;
      },
      { once: true }
    );
    window.dispatchEvent(new Event("moirai:inspect-graph"));
    if (!value) throw Error("GraphShell inspection is unavailable");
    return value as GraphInspection;
  });
}
async function painted(page: Page, tick: number): Promise<State> {
  await expect(page.getByTestId("layout-v2-overlay")).toHaveAttribute(
    "data-tick",
    String(tick),
    { timeout: 120_000 }
  );
  await expect
    .poll(async () => (await lab(page)).paintedState?.tick, {
      timeout: 120_000
    })
    .toBe(tick);
  const state = (await lab(page)).paintedState;
  expect(state).toBeDefined();
  return state!;
}
async function seek(page: Page, tick: number): Promise<State> {
  const control = page.getByLabel("Iteration", { exact: true });
  await control.fill(String(tick));
  await control.press("Enter");
  return painted(page, tick);
}
const ys = (state: State) => state.nodes.map(({ id, y }) => ({ id, y }));
const xs = (state: State) => state.nodes.map(({ id, x }) => ({ id, x }));

// This deliberately observes an actual immutable public World. It never seeds
// or writes history. Local synthetic regression may override the scope above.
test("actual GraphShell overlay replays exact ticks while preserving history, camera and selection", async ({
  page,
  request
}, testInfo) => {
  const errors: string[] = [];
  const mutations: string[] = [];
  let snapshotReads = 0;
  let detailReads = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (req) => {
    const path = new URL(req.url()).pathname;
    if (
      path === "/graph/v5/shell" &&
      req.method() === "POST" &&
      req.postDataJSON()?.kind === "detail"
    )
      detailReads++;
    if (path.includes("layout-v2") && path.endsWith("/snapshot"))
      snapshotReads++;
    if (
      !["GET", "HEAD"].includes(req.method()) &&
      ![
        "/graph/v5/read",
        "/graph/v5/shell",
        "/graph/v5/viewport",
        "/graph/v5/render",
        "/graph/query"
      ].includes(path)
    )
      mutations.push(`${req.method()} ${path}`);
  });
  await page.addInitScript(() =>
    localStorage.setItem("urdr:app-language-override", "ko")
  );
  const pointerBefore = await request.get(`/worlds/${worldId}/current.json`);
  expect(pointerBefore.ok()).toBe(true);
  const canonicalBefore = await pointerBefore.text();
  expect(JSON.parse(canonicalBefore).served_revision).toBe(revision);
  await page.goto(graph);
  const overlay = page.getByTestId("layout-v2-overlay");
  await expect(overlay).toBeVisible();
  const initial = await painted(page, 0);
  expect(initial.nodes).toHaveLength(nodeCount);
  expect(new Set(initial.nodes.map((node) => node.id)).size).toBe(nodeCount);
  await expect.poll(async () => (await scene(page)).loadState).toBe("ready");
  const initialScene = await scene(page);
  expect(initialScene.counts.sourceEntities).toBeGreaterThan(0);
  expect(initialScene.counts.sourceRegions).toBeGreaterThan(0);
  const camera = initialScene.liveView;
  const selection = initialScene.selection;
  expect(initialScene.selectedEventId).toBe(eventId);
  await expect(page.getByTestId("event-drawer-sheet")).toBeVisible();
  const geometry = JSON.stringify(initialScene.geometry);
  const initialSnapshotReads = snapshotReads;
  const initialDetailReads = detailReads;

  // Dispatch native range inputs while the pointer remains held: observing
  // tick20 before pointerup catches implementations that update only on release.
  const slider = page.getByLabel("Iteration 슬라이더", { exact: true });
  await slider.dispatchEvent("pointerdown", {
    pointerId: 77,
    pointerType: "touch"
  });
  await slider.evaluate((element) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, "20");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const duringDrag = await painted(page, 20);
  expect(xs(duringDrag)).not.toEqual(xs(initial));
  expect(ys(duringDrag)).toEqual(ys(initial));
  await expect
    .poll(async () => JSON.stringify((await scene(page)).geometry))
    .not.toBe(geometry);
  // Three requests without waiting must resolve to the most recent target.
  await slider.evaluate((element) => {
    const input = element as HTMLInputElement;
    for (const value of [80, 30, 100]) {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await slider.dispatchEvent("pointerup", {
    pointerId: 77,
    pointerType: "touch"
  });
  const hundred = await painted(page, 100);
  const hundredScene = await scene(page);
  expect(hundredScene.liveView).toEqual(camera);
  expect(hundredScene.selection).toEqual(selection);
  expect(hundredScene.selectedEventId).toBe(eventId);
  expect(ys(hundred)).toEqual(ys(initial));
  const hundredBytes = JSON.stringify(hundred);
  await seek(page, 1000);
  const replay = await seek(page, 100);
  expect(JSON.stringify(replay)).toBe(hundredBytes);
  expect((await scene(page)).liveView).toEqual(camera);
  expect((await scene(page)).selection).toEqual(selection);
  expect((await scene(page)).selectedEventId).toBe(eventId);
  expect(snapshotReads).toBe(initialSnapshotReads);
  expect(detailReads).toBe(initialDetailReads);

  await overlay.getByRole("button", { name: "시작", exact: true }).click();
  await expect
    .poll(async () => Number(await overlay.getAttribute("data-tick")))
    .toBeGreaterThan(100);
  await overlay.getByRole("button", { name: "정지", exact: true }).click();
  await expect.poll(async () => (await lab(page)).running).toBe(false);
  // Stop is a Worker command; its last computed scene may still await paint.
  // Observe its explicit acknowledgement before checking that motion ended.
  await expect
    .poll(async () => (await lab(page)).pending, { timeout: 120_000 })
    .toBe(false);
  const settled = await lab(page);
  expect(settled.error).toBeNull();
  expect(settled.paintedState?.tick).toBe(settled.requestedTick);
  const stoppedState = JSON.stringify(settled.paintedState);
  const stopped = await overlay.getAttribute("data-tick");
  await page.waitForTimeout(300);
  await expect(overlay).toHaveAttribute("data-tick", stopped!);
  expect(JSON.stringify((await lab(page)).paintedState)).toBe(stoppedState);
  expect((await lab(page)).pending).toBe(false);
  await overlay.getByRole("button", { name: "재시작", exact: true }).click();
  expect(JSON.stringify(await painted(page, 0))).toBe(JSON.stringify(initial));
  await seek(page, 100);
  await page.screenshot({
    path: testInfo.outputPath("graph-overlay-tick100.png"),
    fullPage: true
  });

  // Switching back to the served baseline and entering v2 again preserves
  // the same camera/selection, but starts a fresh deterministic simulation.
  await overlay.getByRole("button", { name: "현재 운영", exact: true }).click();
  await expect(overlay).toHaveCount(0);
  await expect.poll(async () => (await scene(page)).loadState).toBe("ready");
  expect((await scene(page)).selectedEventId).toBe(eventId);
  expect((await scene(page)).liveView).toEqual(camera);
  await page.getByRole("button", { name: "Lab v2", exact: true }).click();
  expect(JSON.stringify(await painted(page, 0))).toBe(JSON.stringify(initial));
  expect((await scene(page)).selectedEventId).toBe(eventId);
  expect((await scene(page)).liveView).toEqual(camera);
  expect(snapshotReads).toBe(initialSnapshotReads);

  // No Collections is a valid empty scene. It must acknowledge its frame,
  // permit continued iteration, and resume painting when filters return.
  await page.getByTestId("event-drawer-close").click();
  await page.getByRole("button", { name: /^컬렉션/ }).click();
  const checkboxes = page.getByRole("checkbox");
  const checked: number[] = [];
  for (let index = 0; index < (await checkboxes.count()); index++) {
    if (await checkboxes.nth(index).isChecked()) checked.push(index);
  }
  expect(checked.length).toBeGreaterThan(0);
  for (const index of checked) await checkboxes.nth(index).uncheck();
  await expect
    .poll(async () => (await scene(page)).counts.sourceEntities)
    .toBe(0);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await seek(page, 20);
  expect((await scene(page)).counts.sourceEntities).toBe(0);
  await page.getByRole("button", { name: /^컬렉션/ }).click();
  for (const index of checked) await checkboxes.nth(index).check();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect
    .poll(async () => (await scene(page)).counts.sourceEntities)
    .toBeGreaterThan(0);
  await seek(page, 100);
  expect(JSON.stringify((await lab(page)).paintedState)).toBe(hundredBytes);
  expect((await scene(page)).selection).toEqual(selection);
  expect((await scene(page)).liveView).toEqual(camera);
  expect(snapshotReads).toBe(initialSnapshotReads);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  const pointerAfter = await request.get(`/worlds/${worldId}/current.json`);
  expect(await pointerAfter.text()).toBe(canonicalBefore);
  expect(errors).toEqual([]);
  expect(mutations).toEqual([]);
  await testInfo.attach("layout-v2-overlay-observation", {
    body: JSON.stringify(
      {
        worldId,
        revision,
        nodes: nodeCount,
        initialSnapshotReads,
        initialDetailReads,
        finalDetailReads: detailReads,
        finalSnapshotReads: snapshotReads,
        camera,
        selection,
        hundredState: hundred,
        sceneAt100: hundredScene,
        errors,
        mutations
      },
      null,
      2
    ),
    contentType: "application/json"
  });
});
