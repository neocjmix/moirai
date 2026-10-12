/** Read-only browser acceptance for the independent TSTL preview.
 * Usage: tsx scripts/tstl-research/smoke.ts URL OUTPUT_DIR [EXPECTED_SOURCE_SHA]
 * Physical iPhone Safari/PWA and browser rasterizer exactness are not claimed.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  chromium,
  webkit,
  type Browser,
  type BrowserContextOptions,
  type Page
} from "@playwright/test";
import type { LabSnapshot } from "../../apps/atropos-web/src/labs/layout/types.js";
import type { TstlRenderCommands } from "../../packages/graph-presentation/src/tstl-validator.js";

interface SmokeState {
  ready: boolean;
  selectedMode: "A" | "B0";
  hashes: { A: string; B0: string };
  camera: { x: number; y: number; spanX: number; spanY: number };
  selectedEventId: string | null;
  activeCollectionIds: string[];
  collapsedPathKeys: string[];
  visibleIds: string[];
  omitted: {
    eventId: string;
    reason: string;
    reasons?: string[];
    revealRoute: string;
  }[];
  scopeCompositeIds: string[];
  signatureCounts: { signature: string[]; count: number; eventIds: string[] }[];
  renderCommands: TstlRenderCommands;
  diagnosticRenderCommands: TstlRenderCommands;
  renderedEventIds: string[];
  renderedRegionIds: string[];
  semanticFillCount: number;
  temporalStatus: string;
  sourceCommit: string;
}
interface FrameProbe {
  active: boolean;
  frames: number[];
  longTasks: number[];
  last: number | null;
  observer?: PerformanceObserver;
}
type SmokeWindow = Window & {
  moiraiTstl: SmokeState;
  tstlSmokeFrames: FrameProbe;
};
const url = process.argv[2] ?? "http://127.0.0.1:8766/";
const outputDirectory = resolve(process.argv[3] ?? ".artifacts/tstl-smoke");
const expectedSha = process.argv[4] ?? process.env.TSTL_EXPECTED_SOURCE_SHA;
mkdirSync(outputDirectory, { recursive: true });
const snapshot = JSON.parse(
  readFileSync("scripts/layout-research/data/history-r56.json", "utf8")
) as LabSnapshot;
const sorted = (ids: readonly string[]) => [...ids].sort();
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Independent reachability oracle, deliberately without the TSTL projection,
// candidate solver or their membership/signature helpers.
const children = new Map(
  snapshot.events.map((event) => [event.id, [] as string[]])
);
const parents = new Map(
  snapshot.events.map((event) => [event.id, [] as string[]])
);
for (const relation of snapshot.relations.filter(
  (r) => r.type === "contains"
)) {
  children.get(relation.sourceId)!.push(relation.targetId);
  parents.get(relation.targetId)!.push(relation.sourceId);
}
const descendants = new Map<string, Set<string>>();
for (const source of snapshot.events) {
  const queue = [...children.get(source.id)!];
  const visited = new Set<string>();
  for (const next of queue) {
    if (visited.has(next)) continue;
    visited.add(next);
    queue.push(...children.get(next)!);
  }
  assert(!visited.has(source.id), "source contains must be a DAG");
  descendants.set(source.id, visited);
}
const leafIds = snapshot.events
  .filter((event) => children.get(event.id)!.length === 0)
  .map((event) => event.id);
const idByTitle = (title: string) => {
  const event = snapshot.events.find((event) => event.title === title);
  assert(event, `missing source case: ${title}`);
  return event.id;
};
const korea = idByTitle("한국사");
const japan = idByTitle("일본사");
const china = idByTitle("중국사");
const imjin = idByTitle("임진왜란: 두 차례 침략과 강화 교섭");
const yi = idByTitle("이순신의 생애");
const shared = idByTitle("격전 중 이순신이 전사하다");
assert.equal(snapshot.events.length, 539);
assert.equal(leafIds.length, 430);
assert.deepEqual(sorted(parents.get(imjin)!), sorted([korea, japan]));
assert.equal(
  leafIds.filter(
    (id) => descendants.get(imjin)!.has(id) && descendants.get(china)!.has(id)
  ).length,
  29
);
assert(descendants.get(imjin)!.has(shared) && descendants.get(yi)!.has(shared));

function expectedSignatures(scope: string[]) {
  const buckets = new Map<string, string[]>();
  for (const id of leafIds) {
    const signature = sorted(
      scope.filter((owner) => descendants.get(owner)!.has(id))
    );
    const key = JSON.stringify(signature);
    buckets.set(key, [...(buckets.get(key) ?? []), id]);
  }
  return [...buckets]
    .map(([key, eventIds]) => ({
      signature: JSON.parse(key) as string[],
      count: eventIds.length,
      eventIds: sorted(eventIds)
    }))
    .sort((a, b) =>
      JSON.stringify(a.signature).localeCompare(JSON.stringify(b.signature))
    );
}
function assertSignatures(state: SmokeState) {
  const actual = state.signatureCounts
    .map((bucket) => ({
      signature: sorted(bucket.signature),
      count: bucket.count,
      eventIds: sorted(bucket.eventIds)
    }))
    .sort((a, b) =>
      JSON.stringify(a.signature).localeCompare(JSON.stringify(b.signature))
    );
  assert.deepEqual(actual, expectedSignatures(state.scopeCompositeIds));
}
const getState = (page: Page) =>
  page.evaluate(() => {
    const state = (window as unknown as SmokeWindow).moiraiTstl;
    // The public debug getter also contains the full immutable artifact. Keep
    // repeated automation snapshots small rather than serializing it per click.
    return {
      ready: state.ready,
      selectedMode: state.selectedMode,
      hashes: state.hashes,
      camera: state.camera,
      selectedEventId: state.selectedEventId,
      activeCollectionIds: state.activeCollectionIds,
      collapsedPathKeys: state.collapsedPathKeys,
      visibleIds: state.visibleIds,
      omitted: state.omitted,
      scopeCompositeIds: state.scopeCompositeIds,
      signatureCounts: state.signatureCounts,
      renderCommands: state.renderCommands,
      diagnosticRenderCommands: state.diagnosticRenderCommands,
      renderedEventIds: state.renderedEventIds,
      renderedRegionIds: state.renderedRegionIds,
      semanticFillCount: state.semanticFillCount,
      temporalStatus: state.temporalStatus,
      sourceCommit: state.sourceCommit
    };
  });
async function settled(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as SmokeWindow).moiraiTstl?.ready
  );
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      )
  );
}
async function click(page: Page, testId: string) {
  await page.getByTestId(testId).first().click();
  await settled(page);
}
async function fetchJson(page: Page, path: string) {
  const response = await page.evaluate(async (path) => {
    const response = await fetch(path, { cache: "no-store" });
    return {
      status: response.status,
      data: (await response.json()) as unknown
    };
  }, path);
  assert.equal(response.status, 200, `JSON unavailable: ${path}`);
  return response.data;
}
async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
  assert(
    dimensions.scrollWidth <= dimensions.innerWidth,
    JSON.stringify(dimensions)
  );
  assert(
    dimensions.bodyWidth <= dimensions.innerWidth,
    JSON.stringify(dimensions)
  );
  return dimensions;
}
async function screenshot(page: Page, profile: string, suffix: string) {
  const path = resolve(outputDirectory, `${profile}-${suffix}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}
async function visibleSelectedGlyph(page: Page, eventId: string) {
  const glyph = page.getByTestId(`event-${eventId}`);
  assert.equal(
    await glyph.count(),
    1,
    "one shared Event has exactly one glyph"
  );
  assert(await glyph.isVisible());
  const glyphBox = await glyph.boundingBox();
  const viewport = await page.getByTestId("graph").boundingBox();
  assert(glyphBox && viewport);
  assert(
    glyphBox.x + glyphBox.width > viewport.x &&
      glyphBox.x < viewport.x + viewport.width &&
      glyphBox.y + glyphBox.height > viewport.y &&
      glyphBox.y < viewport.y + viewport.height,
    "selected Event's actual glyph must intersect the graph viewport"
  );
}

async function verifyDom(page: Page) {
  const state = await getState(page);
  const dom = await page.getByTestId("graph").evaluate((svg) => ({
    glyphs: [
      ...svg.querySelectorAll<SVGRectElement>("rect[data-event-id]")
    ].map((rect) => ({
      eventId: rect.getAttribute("data-event-id"),
      hitTargetId: rect.getAttribute("data-hit-target-id"),
      x: Number(rect.getAttribute("x")),
      y: Number(rect.getAttribute("y")),
      width: Number(rect.getAttribute("width")),
      height: Number(rect.getAttribute("height")),
      strokeWidth: Number(rect.getAttribute("stroke-width") ?? 0)
    })),
    ports: [...svg.querySelectorAll("[data-port-event-id]")].map((port) => ({
      eventId: port.getAttribute("data-port-event-id")!,
      compositeId: port.getAttribute("data-port-composite-id")!
    })),
    contains: [...svg.querySelectorAll('[data-relation-type="contains"]')].map(
      (line) => ({
        parentId: line.getAttribute("data-parent-id")!,
        childId: line.getAttribute("data-child-id")!
      })
    ),
    regions: [
      ...svg.querySelectorAll<SVGPolygonElement>("polygon[data-region-id]")
    ].map((polygon) => ({
      id: polygon.getAttribute("data-region-id"),
      points: [...polygon.points].map((point) => ({ x: point.x, y: point.y })),
      serializedPoints: polygon.getAttribute("points"),
      fill: getComputedStyle(polygon).fill,
      strokeWidth: Number(polygon.getAttribute("stroke-width") ?? 0)
    }))
  }));
  assert.equal(
    state.semanticFillCount,
    0,
    "r56 has no lossless temporal support for semantic fill"
  );
  assert.equal(
    new Set(dom.glyphs.map((glyph) => glyph.eventId)).size,
    dom.glyphs.length
  );
  assert.deepEqual(
    sorted(dom.glyphs.map((glyph) => glyph.eventId!)),
    sorted(state.renderedEventIds)
  );
  assert.deepEqual(sorted(state.renderedEventIds), sorted(state.visibleIds));
  assert.deepEqual(
    sorted([...state.visibleIds, ...state.omitted.map((item) => item.eventId)]),
    sorted(snapshot.events.map((event) => event.id)),
    "every source Event is drawn once or has an explicit omission and reveal route"
  );
  assert.deepEqual(
    sorted(dom.regions.map((region) => region.id!)),
    sorted(state.renderedRegionIds)
  );
  const commandGlyphs = new Map(
    state.renderCommands.glyphs.map((glyph) => [glyph.eventId, glyph])
  );
  for (const glyph of dom.glyphs) {
    const command = commandGlyphs.get(glyph.eventId!);
    assert(command, `unserialized DOM glyph ${glyph.eventId}`);
    assert.equal(glyph.hitTargetId, command.hitTargetId);
    assert.equal(glyph.x, command.body.minX);
    assert.equal(glyph.y, command.body.minY);
    assert.equal(glyph.width, command.body.maxX - command.body.minX);
    assert.equal(glyph.height, command.body.maxY - command.body.minY);
    assert.equal(glyph.strokeWidth, command.strokeWidth);
  }
  assert.equal(
    new Set(dom.ports.map((port) => JSON.stringify(port))).size,
    dom.ports.length
  );
  for (const port of dom.ports)
    assert(
      descendants.get(port.compositeId)?.has(port.eventId),
      "rendered port must name a real ancestor membership"
    );
  for (const relation of dom.contains)
    assert(
      parents.get(relation.childId)?.includes(relation.parentId),
      "rendered contains line must name a direct source edge"
    );
  for (const region of dom.regions) {
    const command = state.diagnosticRenderCommands.regions.find(
      (command) => command.regionId === region.id
    );
    assert(command, `unserialized DOM region ${region.id}`);
    // Attribute text preserves serialized doubles; SVGPointList may round to float32.
    assert.deepEqual(
      region
        .serializedPoints!.trim()
        .split(/\s+/)
        .map((pair) => {
          const [x, y] = pair.split(",").map(Number);
          return { x, y };
        }),
      command.points
    );
    assert.equal(command.fill, "none");
    assert.equal(region.fill, "none");
    assert.equal(region.strokeWidth, command.strokeWidth);
  }
  for (const omission of state.omitted) {
    assert(snapshot.events.some((event) => event.id === omission.eventId));
    assert(
      omission.reason.trim(),
      `missing omission reason ${omission.eventId}`
    );
    assert(
      omission.revealRoute.includes(omission.eventId),
      `missing ID-bound reveal route ${omission.eventId}`
    );
  }
  assert.equal(
    new Set(state.omitted.map((omission) => omission.eventId)).size,
    state.omitted.length
  );
  return {
    glyphs: dom.glyphs.length,
    diagnosticContours: dom.regions.length,
    semanticFills: 0,
    omitted: state.omitted.length
  };
}

async function beginFrames(page: Page) {
  // Native browser source avoids tsx/esbuild's function-name helper becoming an
  // out-of-scope reference when Playwright serializes a recursive callback.
  await page.evaluate(`(() => {
    const probe = { active: true, frames: [], longTasks: [], last: null };
    window.tstlSmokeFrames = probe;
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      probe.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) probe.longTasks.push(entry.duration);
      });
      probe.observer.observe({ type: "longtask", buffered: false });
    }
    const sample = (now) => {
      if (!probe.active) return;
      if (probe.last !== null) probe.frames.push(now - probe.last);
      probe.last = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })()`);
}
const summarize = (values: number[]) => {
  const samples = [...values].sort((a, b) => a - b);
  const percentile = (p: number) =>
    samples[Math.max(0, Math.ceil(samples.length * p) - 1)] ?? null;
  return {
    count: samples.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: samples.at(-1) ?? null
  };
};
async function endFrames(page: Page, mobile: boolean) {
  const result = await page.evaluate(() => {
    const probe = (window as unknown as SmokeWindow).tstlSmokeFrames;
    probe.active = false;
    probe.observer?.disconnect();
    return {
      frames: probe.frames,
      longTasks: probe.longTasks,
      longTaskSupported:
        PerformanceObserver.supportedEntryTypes.includes("longtask")
    };
  });
  return {
    framesMs: summarize(result.frames),
    longTasksMs: summarize(result.longTasks),
    longTaskSupported: result.longTaskSupported,
    overTargetFrameCount: result.frames.filter(
      (duration) => duration > (mobile ? 33.3 : 16.7)
    ).length,
    over50msFrameCount: result.frames.filter((duration) => duration > 50)
      .length,
    note: "rAF intervals during automated gesture trace; shared cloud CPU, no physical-device or GPU parity claim"
  };
}
async function pan(page: Page) {
  const box = await page.getByTestId("graph").boundingBox();
  assert(box);
  const before = await getState(page);
  const x = box.x + box.width * 0.47,
    y = box.y + box.height * 0.38;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 36, y + 28, { steps: 24 });
  await page.mouse.up();
  await settled(page);
  const after = await getState(page);
  assert.notDeepEqual(
    after.camera,
    before.camera,
    "pan must change the camera"
  );
  assert.deepEqual(after.hashes, before.hashes);
  return box;
}
async function pinch(page: Page, engine: "chromium" | "webkit") {
  const box = await page.getByTestId("graph").boundingBox();
  assert(box);
  const before = await getState(page);
  const points = [
    { x: box.x + box.width * 0.35, y: box.y + box.height * 0.4 },
    { x: box.x + box.width * 0.65, y: box.y + box.height * 0.6 }
  ];
  if (engine === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: points
    });
    for (let step = 1; step <= 6; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: points[0]!.x - step * 3, y: points[0]!.y - step * 2 },
          { x: points[1]!.x + step * 3, y: points[1]!.y + step * 2 }
        ]
      });
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: []
    });
    await cdp.detach();
  } else {
    // WebKit has no CDP multi-touch API. Explicitly label synthetic pointer
    // integration separately from Chromium's browser-dispatched touch trace.
    const send = async (
      type: string,
      index: number,
      dx: number,
      dy: number
    ) => {
      await page.getByTestId("graph").dispatchEvent(type, {
        pointerId: index + 20,
        pointerType: "touch",
        isPrimary: index === 0,
        clientX: points[index]!.x + dx,
        clientY: points[index]!.y + dy,
        buttons: type === "pointerup" ? 0 : 1
      });
    };
    await send("pointerdown", 0, 0, 0);
    await send("pointerdown", 1, 0, 0);
    for (let step = 1; step <= 6; step++) {
      await send("pointermove", 0, -step * 3, -step * 2);
      await send("pointermove", 1, step * 3, step * 2);
    }
    await send("pointerup", 0, -18, -12);
    await send("pointerup", 1, 18, 12);
  }
  await settled(page);
  const after = await getState(page);
  assert(after.camera.spanX < before.camera.spanX, "pinch-out must zoom in");
  assert.deepEqual(after.hashes, before.hashes);
  return engine === "chromium"
    ? "Chromium CDP multi-touch"
    : "WebKit synthetic PointerEvent integration (not native multi-touch)";
}

const profiles: {
  name: string;
  engine: "chromium" | "webkit";
  mobile: boolean;
  options: BrowserContextOptions;
}[] = [
  {
    name: "desktop-chromium",
    engine: "chromium",
    mobile: false,
    options: {
      viewport: { width: 1280, height: 800 },
      hasTouch: true,
      deviceScaleFactor: 1
    }
  },
  {
    name: "mobile-chromium",
    engine: "chromium",
    mobile: true,
    options: {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 3
    }
  },
  {
    name: "mobile-webkit",
    engine: "webkit",
    mobile: true,
    options: {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 3
    }
  }
];
const evidence: Record<string, unknown>[] = [];
let failure: unknown = null;
for (const profile of profiles) {
  let browser: Browser | undefined;
  let page: Page | undefined;
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const report: Record<string, unknown> = {
    profile: profile.name,
    url,
    viewport: profile.options.viewport,
    mobileEmulation: profile.mobile,
    realIPhone: false,
    errors,
    consoleErrors,
    failedRequests
  };
  evidence.push(report);
  try {
    browser = await (profile.engine === "chromium" ? chromium : webkit).launch({
      headless: true
    });
    page = await browser.newPage(profile.options);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) =>
      failedRequests.push(
        `${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`
      )
    );
    const start = performance.now();
    const response = await page.goto(url, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200);
    await settled(page);
    report.coldReadyMs = performance.now() - start;
    report.loadTimingScope =
      "Navigation through networkidle (500 ms quiet period) and two animation frames; not isolated server latency";
    // Use the real browser's network route. The cloud host may have working
    // browser egress while Node's separate request context resolves unreachable IPv6.
    const build = (await fetchJson(page, "build.json")) as {
      sourceCommit: string;
      assets: Record<string, { sha256: string; bytes: number }>;
    };
    const verifiedAssets: string[] = [];
    for (const [name, asset] of Object.entries(build.assets)) {
      const downloaded: { status: number; bytes: number; sha256: string } =
        await page.evaluate(async (path) => {
          const response = await fetch(path, { cache: "no-store" });
          const body = await response.arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", body);
          return {
            status: response.status,
            bytes: body.byteLength,
            sha256: [...new Uint8Array(digest)]
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join("")
          };
        }, name);
      assert.equal(downloaded.status, 200, `asset unavailable: ${name}`);
      assert.equal(
        downloaded.bytes,
        asset.bytes,
        `asset size mismatch: ${name}`
      );
      assert.equal(
        downloaded.sha256,
        asset.sha256,
        `asset digest mismatch: ${name}`
      );
      if (name === "data/history-r56.json")
        assert.equal(
          downloaded.sha256,
          createHash("sha256")
            .update(
              readFileSync("scripts/layout-research/data/history-r56.json")
            )
            .digest("hex"),
          "served fixture must exactly match independent source bytes"
        );
      verifiedAssets.push(name);
    }
    assert(verifiedAssets.includes("preview.json"));
    const health = (await fetchJson(page, "health.json")) as {
      sourceCommit: string;
      previewSha256: string;
    };
    assert.equal(health.sourceCommit, build.sourceCommit);
    assert.equal(health.previewSha256, build.assets["preview.json"]!.sha256);
    report.verifiedAssets = verifiedAssets;
    const initial = await getState(page);
    assert.match(build.sourceCommit, /^[0-9a-f]{40}$/);
    assert.equal(initial.sourceCommit, build.sourceCommit);
    if (expectedSha) assert.equal(build.sourceCommit, expectedSha);
    assert.equal(initial.temporalStatus, "legacy-scalar-only");
    report.sourceCommit = build.sourceCommit;
    report.browserVersion = browser.version();
    report.browserEnvironment = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      devicePixelRatio,
      viewport: { width: innerWidth, height: innerHeight }
    }));
    report.initialDom = await verifyDom(page);
    report.overviewScreenshot = await screenshot(
      page,
      profile.name,
      "overview"
    );
    assertSignatures(initial);
    assert.equal(
      initial.signatureCounts.find(
        (bucket) =>
          JSON.stringify(sorted(bucket.signature)) ===
          JSON.stringify(sorted([korea, japan]))
      )?.count,
      112
    );
    await click(page, "signatures-open");
    const kjRow = `signature-${sorted([korea, japan]).join("+")}`;
    assert.equal(
      await page.getByTestId(kjRow).locator("strong").innerText(),
      "112"
    );
    report.threeCountryScreenshot = await screenshot(
      page,
      profile.name,
      "country-signatures"
    );
    await click(page, `composite-${china}`);
    const noChina = await getState(page);
    assertSignatures(noChina);
    assert.equal(
      noChina.signatureCounts.find(
        (bucket) =>
          JSON.stringify(sorted(bucket.signature)) ===
          JSON.stringify(sorted([korea, japan]))
      )?.count,
      141
    );
    assert.equal(
      await page.getByTestId(kjRow).locator("strong").innerText(),
      "141"
    );
    await click(page, kjRow);
    const listIds = await page
      .getByTestId("drawer")
      .locator('[data-testid^="reveal-"]')
      .evaluateAll((buttons) =>
        buttons.map((button) =>
          button.getAttribute("data-testid")!.slice("reveal-".length)
        )
      );
    assert.deepEqual(
      sorted(listIds),
      expectedSignatures([korea, japan]).find(
        (bucket) => bucket.signature.length === 2
      )!.eventIds
    );
    report.twoCountryListScreenshot = await screenshot(
      page,
      profile.name,
      "country-shared-list"
    );
    await page
      .getByRole("button", { name: "공유 집합 비교로 돌아가기", exact: true })
      .click();
    await settled(page);
    assert.deepEqual(noChina.hashes, initial.hashes);
    await click(page, `composite-${china}`);
    await click(page, "drawer-close");

    await click(page, "case-imjin");
    assert.equal((await getState(page)).selectedEventId, imjin);
    assert(await page.getByTestId("drawer").isVisible());
    const imjinText = await page.getByTestId("drawer").innerText();
    assert(imjinText.includes("한국사") && imjinText.includes("일본사"));
    assert(
      imjinText.includes("29"),
      "Imjin/China shared descendant count must be visible"
    );
    assert.equal(await page.getByTestId(`path-${korea}-${imjin}`).count(), 1);
    assert.equal(await page.getByTestId(`path-${japan}-${imjin}`).count(), 1);
    assert.equal(await page.getByTestId(`path-${china}-${imjin}`).count(), 0);
    assert.match(
      await page.getByTestId(`shared-${imjin}-${china}`).innerText(),
      /29/
    );
    const beforeCollapse = await getState(page);
    await click(page, `path-${korea}-${imjin}`);
    const collapsed = await getState(page);
    assert(
      collapsed.collapsedPathKeys.includes(JSON.stringify([korea, imjin]))
    );
    assert.deepEqual(
      sorted(collapsed.visibleIds),
      sorted(beforeCollapse.visibleIds),
      "Japan's open path must preserve every Event after Korea's Imjin path is collapsed"
    );
    assert.deepEqual(collapsed.hashes, beforeCollapse.hashes);
    assert.deepEqual(collapsed.camera, beforeCollapse.camera);
    await verifyDom(page);
    await click(page, `path-${korea}-${imjin}`);
    assert.deepEqual(
      (await getState(page)).collapsedPathKeys,
      beforeCollapse.collapsedPathKeys
    );
    report.alternatePathCollapse = {
      parentId: korea,
      childId: imjin,
      alternateParentId: japan,
      visibleIdsPreserved: true
    };
    report.imjinScreenshot = await screenshot(page, profile.name, "imjin");
    await click(page, "drawer-close");
    await click(page, "case-yi");
    assert.equal((await getState(page)).selectedEventId, yi);
    await click(page, "drawer-close");
    await click(page, "case-shared");
    const selected = await getState(page);
    assert(
      descendants.get(imjin)!.has(selected.selectedEventId!) &&
        descendants.get(yi)!.has(selected.selectedEventId!)
    );
    assert(await page.getByTestId("drawer").isVisible());
    await visibleSelectedGlyph(page, selected.selectedEventId!);
    await click(page, "drawer-expand");
    await noOverflow(page);
    await click(page, "drawer-expand");
    const beforeSwitch = await getState(page);
    const modes: Record<string, TstlRenderCommands> = {};
    for (const mode of ["B0", "A", "B0", "A"] as const) {
      await click(page, mode === "A" ? "mode-a" : "mode-b0");
      const state = await getState(page);
      assert.equal(state.selectedMode, mode);
      assert.equal(state.selectedEventId, beforeSwitch.selectedEventId);
      assert.deepEqual(state.camera, beforeSwitch.camera);
      assert.deepEqual(state.hashes, beforeSwitch.hashes);
      if (modes[mode])
        assert.equal(hash(modes[mode]), hash(state.renderCommands));
      else if (mode === "B0")
        report.baselineSharedScreenshot = await screenshot(
          page,
          profile.name,
          "shared-b0"
        );
      modes[mode] = state.renderCommands;
      await verifyDom(page);
    }
    const baselineYs = new Map(
      modes.B0!.glyphs.map((glyph) => [
        glyph.eventId,
        (glyph.body.minY + glyph.body.maxY) / 2
      ])
    );
    for (const glyph of modes.A!.glyphs)
      assert.equal(
        (glyph.body.minY + glyph.body.maxY) / 2,
        baselineYs.get(glyph.eventId)
      );
    report.sharedIdentity = {
      eventId: beforeSwitch.selectedEventId,
      singleGlyph: await page
        .getByTestId(`event-${beforeSwitch.selectedEventId}`)
        .count(),
      switchStable: true,
      sourceTimeYStable: true
    };
    report.sharedScreenshot = await screenshot(page, profile.name, "shared");
    await noOverflow(page);
    await click(page, `hide-${beforeSwitch.selectedEventId}`);
    const hidden = await getState(page);
    assert(
      hidden.omitted.some(
        (item) =>
          item.eventId === beforeSwitch.selectedEventId &&
          item.reasons?.includes("user-hidden")
      )
    );
    assert.equal(
      await page.getByTestId(`event-${beforeSwitch.selectedEventId}`).count(),
      0
    );
    await click(page, `focus-${beforeSwitch.selectedEventId}`);
    await visibleSelectedGlyph(page, beforeSwitch.selectedEventId!);
    assert.equal(
      (await getState(page)).selectedEventId,
      beforeSwitch.selectedEventId
    );
    await click(page, "drawer-close");

    await click(page, "collections-open");
    const beforeCollection = await getState(page);
    const koreaCollection = snapshot.collections.find(
      (collection) => collection.title === "한국사"
    )!;
    await click(page, `collection-${koreaCollection.id}`);
    const collectionOff = await getState(page);
    assert(!collectionOff.activeCollectionIds.includes(koreaCollection.id));
    assert.deepEqual(collectionOff.hashes, beforeCollection.hashes);
    assert.deepEqual(collectionOff.camera, beforeCollection.camera);
    assert.equal(
      collectionOff.selectedEventId,
      beforeCollection.selectedEventId
    );
    await verifyDom(page);
    await click(page, `collection-${koreaCollection.id}`);
    await click(page, "collections-all-off");
    const allOff = await getState(page);
    assert.equal(allOff.activeCollectionIds.length, 0);
    assert.equal(
      allOff.visibleIds.length,
      0,
      "Collection all-off is an empty query"
    );
    assert.equal(allOff.renderedEventIds.length, 0);
    assert.equal(
      await page.getByTestId("graph").locator("[data-event-id]").count(),
      0
    );
    assert.equal(
      allOff.omitted.length,
      539,
      "every hidden source Event has an omission/reveal record"
    );
    await verifyDom(page);
    report.emptySelectionScreenshot = await screenshot(
      page,
      profile.name,
      "empty"
    );
    await page.locator("#collections-close").click();
    await settled(page);

    await click(page, "search-open");
    await page.getByTestId("search-input").fill(shared);
    await settled(page);
    await click(page, `reveal-${shared}`);
    assert.equal((await getState(page)).selectedEventId, shared);
    assert(await page.getByTestId("drawer").isVisible());
    await visibleSelectedGlyph(page, shared);
    await noOverflow(page);
    report.revealScreenshot = await screenshot(page, profile.name, "reveal");
    await click(page, "drawer-close");
    await click(page, "collections-open");
    await click(page, "collections-all-on");
    const restored = await getState(page);
    assert.deepEqual(
      sorted(restored.activeCollectionIds),
      sorted(initial.activeCollectionIds)
    );
    assert.deepEqual(restored.hashes, initial.hashes);
    await page.locator("#collections-close").click();
    await settled(page);
    await click(page, "fit");
    await beginFrames(page);
    await pan(page);
    const beforeZoom = await getState(page);
    await click(page, "zoom-in");
    assert((await getState(page)).camera.spanX < beforeZoom.camera.spanX);
    await click(page, "zoom-out");
    report.pinch = await pinch(page, profile.engine);
    report.gesture = await endFrames(page, profile.mobile);
    assert.deepEqual((await getState(page)).hashes, initial.hashes);
    report.finalDom = await verifyDom(page);
    report.dimensions = await noOverflow(page);
    const warmStart = performance.now();
    await page.reload({ waitUntil: "networkidle" });
    await settled(page);
    report.warmReadyMs = performance.now() - warmStart;
    assert.deepEqual((await getState(page)).hashes, initial.hashes);
    report.resources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return {
          path: new URL(resource.name).pathname,
          durationMs: resource.duration,
          transferBytes: resource.transferSize,
          decodedBodyBytes: resource.decodedBodySize
        };
      })
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(failedRequests, []);
    report.passed = true;
    rmSync(resolve(outputDirectory, `${profile.name}-failure.png`), {
      force: true
    });
  } catch (error) {
    failure = error;
    report.passed = false;
    report.failure = error instanceof Error ? error.message : String(error);
    if (page) {
      await screenshot(page, profile.name, "failure").catch(() => undefined);
      const last = await getState(page).catch(() => null);
      report.failureState = last
        ? {
            ready: last.ready,
            selectedMode: last.selectedMode,
            camera: last.camera,
            selectedEventId: last.selectedEventId,
            activeCollectionIds: last.activeCollectionIds,
            collapsedPathKeys: last.collapsedPathKeys,
            hashes: last.hashes,
            visibleCount: last.visibleIds.length,
            omittedCount: last.omitted.length,
            renderedEvents: last.renderedEventIds.length,
            sourceCommit: last.sourceCommit
          }
        : null;
    }
  } finally {
    await browser?.close();
    writeFileSync(
      resolve(outputDirectory, "smoke.json"),
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          url,
          evidence,
          limitations: [
            "Browser emulation is not physical iPhone 17 Safari or installed PWA evidence.",
            "DOM serialized contour/body/stroke equivalence does not certify browser rasterizer or GPU exactness."
          ]
        },
        null,
        2
      )
    );
    console.log(
      JSON.stringify({
        profile: profile.name,
        passed: report.passed,
        failure: report.failure,
        sourceCommit: report.sourceCommit
      })
    );
  }
}
if (failure) process.exitCode = 1;
