import { expect, test } from "@playwright/test";
import { bakeSpatialArtifacts } from "../../packages/graph-presentation/src/artifacts";
import { projectPresentationInput } from "../../packages/graph-presentation/src/index";
import type { MoiraiGraphQueryResult } from "../../packages/contracts/src/index";
import { createMoiraiSpatialReader } from "../../apps/atropos-web/src/urdr-port/src/moirai-spatial-reader";

// Synthetic precomputed geometry, not a claim about quadratic layout throughput.
// The route harness runs the production reader; only its artifact store is synthetic.
test("100k artifacts stay bounded while the original browser viewport pans and zooms", async ({
  page
}, testInfo) => {
  test.setTimeout(90000);
  let reader: ReturnType<typeof createMoiraiSpatialReader> | undefined;
  const observed: {
    count: number;
    bytes: number;
    objects: number;
    minY: number;
    ids: string[];
  }[] = [];
  const keys: string[] = [];
  await page.route("**/graph/spatial", async (route) => {
    const input = route.request().postDataJSON();
    if (!reader) {
      const query = input.state.query;
      const result = {
        contract_version: 3,
        query,
        revision_vector: query.sources.map(
          (s: { world_id: string; served_revision: number }) => ({
            world_id: s.world_id,
            served_revision: s.served_revision
          })
        ),
        compatibility: [],
        time_systems: [],
        events: [],
        relations: [],
        virtual_time_events: [],
        subjects: [],
        composites: [],
        states: [],
        narratives: [],
        evidence: [],
        diagnostics: [],
        algorithm_versions: {},
        source_artifact_digests: {},
        completeness: "complete",
        budget: {
          ...query.budget,
          returned_entities: 0,
          returned_relations: 0,
          returned_evidence: 0,
          truncated: false,
          next_scope_hint: null
        }
      } as MoiraiGraphQueryResult;
      const scope = projectPresentationInput(result).scopes[0]!;
      const source = query.sources[0];
      const manifest = JSON.stringify({
        world_id: source.world_id,
        served_revision: source.served_revision,
        completeness: "complete"
      });
      const bundle = bakeSpatialArtifacts(result, manifest, [
        {
          scope,
          chartPlane: {
            entities: Array.from({ length: 100000 }, (_, i) => ({
              id: `scale-${i}`,
              eventId: `scale-${i}`,
              canonId: scope.id,
              label: `Synthetic ${i}`,
              geometryKind: "point" as const,
              position: { x: 0, y: i * 10 },
              contains: [],
              diagnostics: [],
              validationState: "ok" as const,
              viewportClass: "visible" as const
            })),
            diagnostics: [],
            timeSystemId: "scale",
            compatibilityKey: "scale"
          },
          diagnostics: [],
          unplaced: []
        }
      ]);
      const values = new Map([
        ...bundle.documents.map((d) => [d.key, d.body] as const),
        [bundle.manifestKey, bundle.manifestBody],
        [
          `worlds/${source.world_id}/revisions/${source.served_revision}/manifest.json`,
          manifest
        ]
      ]);
      reader = createMoiraiSpatialReader(async (key) => {
        keys.push(key);
        return {
          status: values.has(key) ? 200 : 404,
          body: values.get(key) ?? null
        };
      });
    }
    const result = await reader.viewport({ ...input, maxEntities: 500 });
    const body = JSON.stringify(result);
    observed.push({
      count: result.viewport.entities.length,
      bytes: Buffer.byteLength(body),
      objects: result.reads.objects,
      minY: input.viewport.bbox.minY,
      ids: result.viewport.entities.map((e) => e.id)
    });
    await route.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto("/graph");
  const points = page.locator('[data-event-point-id^="scale-"]');
  await expect.poll(() => points.count()).toBeGreaterThan(0);
  const first = observed[0]!;
  // Start on empty canvas above the mobile bottom dock (650px hits the dock
  // in the actual 390x664 WebKit viewport). Cross multiple spatial bands.
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(25, 450);
    await page.mouse.down();
    await page.mouse.move(25, 200, { steps: 12 });
    await page.mouse.up();
  }
  await expect
    .poll(() => observed.some((r) => Math.abs(r.minY - first.minY) > 100))
    .toBe(true);
  // Pinned URDR graph-shell has no wheel handler: retain that no-op baseline.
  const beforeZoom = new URL(page.url()).searchParams
    .get("gsViewport")!
    .split(",")
    .map(Number);
  await page.getByTestId("graph-stage").dispatchEvent("wheel", {
    clientX: 195,
    clientY: 450,
    deltaY: 1200,
    deltaMode: 0,
    bubbles: true,
    cancelable: true
  });
  expect(
    Number(new URL(page.url()).searchParams.get("gsViewport")!.split(",")[3])
  ).toBe(beforeZoom[3]);
  // Use the original two-pointer pinch path for actual zoom (same protocol as
  // urdr-pinch.spec.ts), bringing the active pointers closer to zoom out.
  await page.evaluate(() => {
    document.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      (event.target as Element).dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: event.pointerId,
          pointerType: "touch",
          clientX: event.clientX - 70,
          clientY: event.clientY - 70,
          buttons: 1,
          isPrimary: event.isPrimary
        })
      );
    });
  });
  await page.mouse.move(25, 350);
  await page.mouse.down();
  await page.touchscreen.tap(290, 550);
  await page.mouse.up();
  await expect
    .poll(() =>
      Number(new URL(page.url()).searchParams.get("gsViewport")!.split(",")[3])
    )
    .toBeGreaterThan(beforeZoom[3]!);
  await expect.poll(() => observed.length).toBeGreaterThan(2);
  expect(observed.every((r) => r.count <= 500 && r.bytes <= 1024 * 1024)).toBe(
    true
  );
  expect(
    observed.some((r) => r.ids.some((id) => !first.ids.includes(id)))
  ).toBe(true);
  expect(
    keys.some((k) => k.endsWith("/index.json") || k.endsWith("/sidecar.json"))
  ).toBe(false);
  expect(await points.count()).toBeLessThanOrEqual(500);
  await testInfo.attach("100k-bounded-reader.json", {
    body: JSON.stringify({
      total: 100000,
      responses: observed.map((r) => ({
        count: r.count,
        bytes: r.bytes,
        objects: r.objects,
        minY: r.minY
      })),
      artifactReads: keys.length
    }),
    contentType: "application/json"
  });
  await page.screenshot({
    path: testInfo.outputPath("100k-mobile-viewport.png"),
    animations: "disabled"
  });
});
