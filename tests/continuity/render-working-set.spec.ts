import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const world = "019f3b00-0000-7000-8000-000000000a01";
const event = "019f3b00-0000-7000-8000-000000000a12";
const composite = "019f3b00-0000-7000-8000-000000000a11";
const continuityComposite = "019f3b00-0000-7000-8000-000000000b01";
const closeCamera = [-289, 222880, 800, 6000];
const wideCamera = [-289, 222880, 2000, 24000];

test("geographic canvas paints ink while SVG retains authored touch targets and fallback", async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `/graph/v5?world=${world}&gsViewport=${closeCamera.join(",")}`
  );
  const canvas = page.getByTestId("geographic-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.locator('svg[data-graphics-painter="canvas"]')).toHaveCount(
    1
  );
  const ink = () =>
    canvas.evaluate((node) => {
      const canvas = node as HTMLCanvasElement;
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i]! < 230 || pixels[i + 1]! < 230 || pixels[i + 2]! < 230)
          if (pixels[i + 3]! > 0) ink++;
      return {
        ink,
        scale: Number(canvas.dataset.rasterScale),
        revision: Number(canvas.dataset.paintRevision)
      };
    });
  await expect.poll(async () => (await ink()).ink).toBeGreaterThan(100);
  const before = await ink();
  expect(before.scale).toBe(1.5);
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath("canvas-appearance.png") });
  const original = await canvas.elementHandle();
  await page.mouse.move(75, 520);
  await page.mouse.down();
  await page.mouse.move(92, 529, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await ink()).revision)
    .toBeGreaterThan(before.revision);
  expect(await canvas.evaluate((node, old) => node === old, original)).toBe(
    true
  );
  expect((await ink()).ink).toBeGreaterThan(100);
  await page.goto(
    `/graph/v5?world=${world}&gsViewport=${closeCamera.join(",")}&gsGraphics=svg`
  );
  await expect(canvas).toHaveCount(0);
  const hull = page.locator(
    `[data-composite-paint-id="${continuityComposite}"] > path`
  );
  await expect(hull).toBeVisible();
  expect(await hull.evaluate((node) => getComputedStyle(node).fill)).not.toBe(
    "none"
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath("svg-appearance.png") });
  expect(errors).toEqual([]);
});

async function restoreCamera(page: Page, camera: number[]) {
  // Exercise the supported browser-history camera seam, then use a native
  // captured pointer for XY motion. WebKit has no multi-touch injection API.
  await page.evaluate((camera) => {
    const url = new URL(location.href);
    url.searchParams.set("gsViewport", camera.join(","));
    history.pushState(history.state, "", url);
    dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  }, camera);
}

test("synthetic persisted page lifecycle keeps the live reader and authored identity", async ({
  page
}) => {
  // This exercises the application's pagehide.persisted contract only. It does
  // not suspend WebKit, establish real bfcache eligibility, or reproduce iOS
  // Safari/Home Screen process eviction and foreground scheduling.
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `/graph/v5?world=${world}&gsViewport=${closeCamera.join(",")}`
  );
  const owner = page.locator(
    `[data-composite-paint-id="${continuityComposite}"]`
  );
  await expect(owner).toHaveCount(1);
  await expect
    .poll(() =>
      owner
        .locator(":scope > path")
        .evaluate((node) => Number(getComputedStyle(node).opacity))
    )
    .toBeGreaterThan(0.95);
  const original = await owner.elementHandle();
  await page.evaluate(() => {
    dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  });
  // Keep the events in separate tasks so disposal mistakenly triggered by the
  // hide event has a chance to run before the cached page is restored.
  await page.evaluate(() => {
    dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  const widerRead = page.waitForResponse((response) => {
    if (new URL(response.url()).pathname !== "/graph/v5/render") return false;
    const request = response.request().postDataJSON();
    return (
      request.kind === "viewport" &&
      request.viewport.maxY - request.viewport.minY > 40000
    );
  });
  await restoreCamera(page, wideCamera);
  const response = await widerRead;
  expect(response.status()).toBe(200);
  expect((await response.json()).algorithmVersion).toBe("render-compiler/4");
  await expect(
    owner.locator(`[data-composite-point-id="${continuityComposite}"]`)
  ).toHaveCount(1);
  expect(
    await owner.evaluate((node, original) => node === original, original)
  ).toBe(true);
  await page.mouse.move(75, 520);
  await page.mouse.down();
  await page.mouse.move(87, 528, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => {
        let ready = false;
        const inspect = (event: Event) => {
          ready = (event as CustomEvent).detail?.loadState === "ready";
        };
        addEventListener("moirai:graph-inspection", inspect, { once: true });
        dispatchEvent(new Event("moirai:inspect-graph"));
        removeEventListener("moirai:graph-inspection", inspect);
        return ready;
      })
    )
    .toBe(true);
  expect(
    await owner.evaluate((node, original) => node === original, original)
  ).toBe(true);
  expect(errors).toEqual([]);
});

for (const delay of [0, 250, 750]) {
  test(`compiler4 keeps authored paint across XY/scale coverage and reversal with ${delay}ms reads`, async ({
    page
  }, info) => {
    const errors: string[] = [];
    const metadata: {
      level: number;
      algorithmVersion: string;
      viewport: unknown;
    }[] = [];
    const reads: Promise<void>[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (
        new URL(response.url()).pathname !== "/graph/v5/render" ||
        response.request().postDataJSON().kind !== "viewport"
      )
        return;
      reads.push(
        response
          .json()
          .then((body) => {
            metadata.push({
              level: body.level,
              algorithmVersion: body.algorithmVersion,
              viewport: response.request().postDataJSON().viewport
            });
          })
          .catch(() => undefined)
      );
    });
    await page.addInitScript(() =>
      localStorage.setItem("urdr:app-language-override", "ko")
    );
    await page.goto(
      `/graph/v5?world=${world}&gsViewport=${closeCamera.join(",")}`
    );
    const owner = page.locator(
      `[data-composite-paint-id="${continuityComposite}"]`
    );
    const hull = owner.locator(":scope > path");
    await expect(owner).toHaveCount(1);
    await expect
      .poll(() =>
        hull.evaluate((node) => Number(getComputedStyle(node).opacity))
      )
      .toBeGreaterThan(0.95);
    await page.waitForTimeout(300);
    await Promise.all(reads);
    const initialMetadata = metadata.length;
    expect(initialMetadata).toBeGreaterThan(0);

    await page.evaluate(
      ({ id, reverseCamera }) => {
        const original = document.querySelector(
          `[data-composite-paint-id="${id}"]`
        )!;
        const originalPath = original.querySelector(":scope > path")!;
        const probe = {
          running: true,
          reverse: false,
          reversed: false,
          samples: [] as {
            hull: number;
            point: number;
            same: boolean;
            visible: boolean;
          }[]
        };
        (
          window as unknown as { continuityProbe: typeof probe }
        ).continuityProbe = probe;
        const sample = () => {
          if (!probe.running) return;
          const owner = document.querySelector(
            `[data-composite-paint-id="${id}"]`
          );
          const path = owner?.querySelector(":scope > path");
          const point = owner?.querySelector(":scope > g");
          const hullOpacity = path ? Number(getComputedStyle(path).opacity) : 0;
          const pointOpacity = point
            ? Number(getComputedStyle(point).opacity)
            : 0;
          const bounds = owner?.getBoundingClientRect();
          probe.samples.push({
            hull: hullOpacity,
            point: pointOpacity,
            same:
              owner === original &&
              path === originalPath &&
              document.querySelectorAll(`[data-composite-paint-id="${id}"]`)
                .length === 1,
            visible: Boolean(
              bounds &&
              bounds.right > 0 &&
              bounds.left < innerWidth &&
              bounds.bottom > 0 &&
              bounds.top < innerHeight
            )
          });
          if (
            probe.reverse &&
            !probe.reversed &&
            hullOpacity > 0.05 &&
            hullOpacity < 0.95
          ) {
            probe.reversed = true;
            const url = new URL(location.href);
            url.searchParams.set("gsViewport", reverseCamera.join(","));
            history.pushState(history.state, "", url);
            dispatchEvent(
              new PopStateEvent("popstate", { state: history.state })
            );
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      },
      { id: continuityComposite, reverseCamera: wideCamera }
    );

    const delayed: {
      kind: string;
      started: number;
      released: number;
      cancelled?: string;
    }[] = [];
    await page.route("**/graph/v5/render", async (route) => {
      const read: (typeof delayed)[number] = {
        kind: route.request().postDataJSON().kind as string,
        started: performance.now(),
        released: 0
      };
      delayed.push(read);
      const deadline = read.started + delay;
      // Node timers may wake just before their requested duration. Measure a
      // monotonic deadline and finish any remainder so every released request
      // really receives the claimed network delay.
      while (performance.now() < deadline) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.ceil(deadline - performance.now()))
        );
      }
      read.released = performance.now();
      // A rapid reversal can cancel an older request while this real-network
      // delay is pending. WebKit has already disposed its route in that case.
      const failure = route.request().failure();
      if (failure) {
        read.cancelled = failure.errorText;
        // Complete Playwright's handler bookkeeping; returning without any
        // routing action leaves its handled promise unresolved after abort.
        await route.fallback();
        return;
      }
      try {
        await route.continue();
      } catch (error) {
        // Cancellation can race the IPC continue after the check above. Only
        // that already-failed route is released; all other failures propagate.
        const cancelled = route.request().failure();
        if (
          !cancelled ||
          !(error instanceof Error) ||
          !error.message.includes("Route is already handled")
        )
          throw error;
        read.cancelled = cancelled.errorText;
        await route.fallback();
      }
    });
    const coverageRead = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/graph/v5/render" &&
        response.request().postDataJSON().kind === "viewport"
    );
    await restoreCamera(page, wideCamera);
    await expect
      .poll(() => delayed.filter((read) => read.kind === "viewport").length)
      .toBeGreaterThan(0);
    // Move both axes while the wider coverage is in flight. The tracked group
    // stays inside retained coverage; no all-off or oversized-area case is used.
    await page.mouse.move(75, 520);
    await page.mouse.down();
    await page.mouse.move(83, 532, { steps: 6 });
    await page.mouse.up();
    await (await coverageRead).finished();
    await expect(
      owner.locator(`[data-composite-point-id="${continuityComposite}"]`)
    ).toHaveCount(1);
    await expect
      .poll(() =>
        hull.evaluate((node) => Number(getComputedStyle(node).opacity))
      )
      .toBeLessThan(0.01);

    await page.evaluate(() => {
      (
        window as unknown as { continuityProbe: { reverse: boolean } }
      ).continuityProbe.reverse = true;
    });
    await restoreCamera(page, closeCamera);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { continuityProbe: { reversed: boolean } })
              .continuityProbe.reversed
        )
      )
      .toBe(true);
    await expect
      .poll(() =>
        hull.evaluate((node) => Number(getComputedStyle(node).opacity))
      )
      .toBeLessThan(0.01);
    await restoreCamera(page, closeCamera);
    await expect
      .poll(() =>
        hull.evaluate((node) => Number(getComputedStyle(node).opacity))
      )
      .toBeGreaterThan(0.95);
    // The widened coverage response above was explicitly awaited. Cancelled
    // prefetches belong to the context lifetime, not a blocking teardown gate.
    const evidence = await page.evaluate(() => {
      const probe = (
        window as unknown as {
          continuityProbe: {
            running: boolean;
            reversed: boolean;
            samples: {
              hull: number;
              point: number;
              same: boolean;
              visible: boolean;
            }[];
          };
        }
      ).continuityProbe;
      probe.running = false;
      return probe;
    });
    const evidenceName = `compiler4-${delay}ms-continuity.json`;
    const evidencePath = info.outputPath(evidenceName);
    await mkdir(info.outputDir, { recursive: true });
    await writeFile(
      evidencePath,
      JSON.stringify({ delay, metadata, delayed, evidence }, null, 2)
    );
    await info.attach(evidenceName, {
      path: evidencePath,
      contentType: "application/json"
    });
    expect(evidence.samples.length).toBeGreaterThan(8);
    expect(evidence.samples.every((sample) => sample.same)).toBe(true);
    expect(evidence.samples.every((sample) => sample.visible)).toBe(true);
    expect(
      evidence.samples.every(
        (sample) => Math.max(sample.hull, sample.point) > 0.05
      )
    ).toBe(true);
    expect(
      evidence.samples.some(
        (sample) =>
          sample.hull > 0.05 && sample.hull < 0.95 && sample.point > 0.05
      )
    ).toBe(true);
    expect(metadata.length).toBeGreaterThan(initialMetadata);
    expect(new Set(metadata.map((item) => item.level)).size).toBeGreaterThan(1);
    expect(
      metadata.every((item) => item.algorithmVersion === "render-compiler/4")
    ).toBe(true);
    const releasedReads = delayed.filter((read) => read.released > 0);
    expect(
      releasedReads.some((read) => read.kind === "viewport" && !read.cancelled)
    ).toBe(true);
    expect(
      releasedReads.every((read) => read.released - read.started >= delay)
    ).toBe(true);
    const semanticLabel = page.locator(
      `text[data-region-id="${continuityComposite}"][data-primary-hit-target="composite-label"]`
    );
    await expect(semanticLabel).toBeVisible();
    // A curved textPath's whole bounding-box center may be empty space.
    // Find actual painted glyph pixels using native hit testing, then perform
    // a real mobile tap. A label with no hittable pixels remains a failure.
    const hit = await semanticLabel.evaluate((node) => {
      const label = node as SVGTextElement;
      const matrix = label.getScreenCTM();
      if (!matrix) return null;
      const probe = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y);
        return hit && (hit === label || label.contains(hit)) ? { x, y } : null;
      };
      for (let index = 0; index < label.getNumberOfChars(); index++) {
        const glyph = label.getExtentOfChar(index);
        for (const fx of [0.5, 0.25, 0.75])
          for (const fy of [0.5, 0.25, 0.75]) {
            const point = new DOMPoint(
              glyph.x + glyph.width * fx,
              glyph.y + glyph.height * fy
            ).matrixTransform(matrix);
            const hit = probe(point.x, point.y);
            if (hit) return hit;
          }
      }
      const bounds = label.getBoundingClientRect();
      for (
        let y = Math.max(0, bounds.top);
        y < Math.min(innerHeight, bounds.bottom);
        y += 2
      )
        for (
          let x = Math.max(0, bounds.left);
          x < Math.min(innerWidth, bounds.right);
          x += 2
        ) {
          const hit = probe(x, y);
          if (hit) return hit;
        }
      return null;
    });
    expect(
      hit,
      "authored hull label must expose real mobile hit pixels"
    ).not.toBeNull();
    await page.touchscreen.tap(hit!.x, hit!.y);
    await expect(page.getByTestId("event-drawer-sheet")).toContainText(
      "합성 연속성 검증용 서술 0"
    );
    expect(errors).toEqual([]);
  });
}

test("real compiler-v4 data keeps authored identity through warm pan and Collection reversal", async ({
  page
}) => {
  const requests: { kind: string; time: number }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/graph/v5/render")
      requests.push({ kind: request.postDataJSON().kind, time: Date.now() });
  });
  await page.addInitScript(() =>
    localStorage.setItem("urdr:app-language-override", "ko")
  );
  await page.goto(
    `/graph/v5?world=${world}&event=${event}&gsViewport=-502,222919,800,6000`
  );
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(
    "공유된 전투"
  );
  await page.getByTestId("event-drawer-close").click();
  // The one-child Composite is compact at this scale and intentionally owns
  // its child's paint. Track that visible authored identity, not a hidden leaf.
  const point = page.locator(`[data-composite-paint-id="${composite}"]`);
  await expect(point).toHaveCount(1);
  await expect
    .poll(() => requests.filter((r) => r.kind === "viewport").length)
    .toBeGreaterThan(0);
  expect(requests.some((r) => r.kind === "manifest")).toBe(false);
  const original = await point.elementHandle();
  const before = requests.length;
  await page.mouse.move(75, 520);
  await page.mouse.down();
  await page.mouse.move(95, 520, { steps: 12 });
  await page.mouse.up();
  await expect(point).toHaveCount(1);
  expect(
    await point.evaluate((node, original) => node === original, original)
  ).toBe(true);
  // Wait through the ordinary fetch cadence; a warm spatial margin must cover this pan.
  await page.waitForTimeout(450);
  expect(
    requests.slice(before).filter((r) => r.kind === "viewport")
  ).toHaveLength(0);
  await page.getByRole("button", { name: "컬렉션 2", exact: true }).click();
  const option = page.getByRole("checkbox", { name: "일본사", exact: true });
  const toggledAt = requests.length;
  await option.uncheck();
  await option.check();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(point).toHaveCount(1);
  await page.waitForTimeout(450);
  expect(
    requests.slice(toggledAt).filter((r) => r.kind === "viewport")
  ).toHaveLength(0);
  await point.locator('[data-primary-hit-target="composite"]').click();
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(
    "임진왜란 서사"
  );
  expect(errors).toEqual([]);
});
