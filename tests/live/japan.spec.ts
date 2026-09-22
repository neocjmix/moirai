import { expect, test } from "@playwright/test";

const world = "01995c2a-7b00-7000-8000-000000000101";
const canon = "01a0c8c3-544c-756a-968c-0a5bb38452ea";
const ordered = [
  ["01a0c8c3-544c-7590-992f-88ec5443bb40", 1573],
  ["01a0c8c3-544c-7139-a833-4ba33b306cdd", 1575],
  ["01a0c8c3-544d-7cdd-b960-41ee088032b8", 1582],
  ["01a0c8c3-544d-7629-8616-77bf6bf0006f", 1582],
  ["01a0c8c3-544d-7391-b6c6-b7bc59a2b9c3", 1588],
  ["01a0c8c3-544d-7d12-a909-ff87c6a07f71", 1590],
  ["019f8c00-0000-7000-8000-000000001002", 1592],
  ["019f8c00-0000-7000-8000-000000001047", 1598],
  ["01a0c8c3-544d-7058-8150-16d9ee2e0fc0", 1600],
  ["01a0c8c3-544d-7f0f-a396-fe09d05844a5", 1603],
  ["01a0c8c3-544d-7fea-bc47-2e1c8deff091", 1615]
] as const;

test("published Japan chronology and actual focused Graph preserve historical years", async ({
  page,
  request
}, testInfo) => {
  test.setTimeout(180000);
  const response = await request.get(`/worlds/${world}/current.json`);
  expect(response.ok()).toBe(true);
  const pointer = await response.json();
  expect(pointer.served_revision).toBeGreaterThanOrEqual(30);
  expect(pointer.projection_status).toBe("ready");
  const revision = pointer.served_revision;
  const spatialResponse = await request.post("/graph/spatial", {
    data: {
      sources: [
        {
          world_id: world,
          served_revision: revision,
          canon_ids: [canon],
          time_systems: []
        }
      ],
      viewport: {
        canonIds: [
          encodeURIComponent(JSON.stringify([world, revision, canon]))
        ],
        bbox: { minX: -1000, maxX: 5000, minY: 200000, maxY: 230000 },
        scale: 0.1,
        viewportWidth: 1400,
        viewportHeight: 1000,
        currentTimeLevel: "full",
        artifactClasses: ["point", "segment", "region"]
      },
      maxEntities: 2500
    }
  });
  expect(spatialResponse.ok()).toBe(true);
  const spatial = await spatialResponse.json();
  expect(spatial.unplaced_count).toBe(0);
  expect(spatial.viewport.truncated).toBe(false);
  const points = spatial.viewport.entities as Array<{
    eventId: string;
    position: { x: number; y: number };
  }>;
  const positions = ordered.map(([id, year]) => {
    const point = points.find((p) => p.eventId.includes(id));
    expect(point, id).toBeTruthy();
    expect(point!.position.y / 140).toBeGreaterThan(year - 1);
    expect(point!.position.y / 140).toBeLessThan(year + 1);
    return { id, year, y: point!.position.y };
  });
  for (let i = 1; i < positions.length; i++)
    expect(positions[i]!.y).toBeGreaterThan(positions[i - 1]!.y);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Focus each key stage through the real Event route, not a synthetic canvas.
  for (const [id, year] of ordered.filter((_, i) =>
    [0, 1, 2, 5, 6, 7, 8, 9, 10].includes(i)
  )) {
    await page.goto(
      `/graph/events/${world}/${id}?revision=${revision}&canon=${canon}`
    );
    await expect(page.getByTestId("event-drawer-sheet")).toBeVisible();
    await page.getByTestId("event-drawer-close").click();
    await expect(page.getByTestId("event-drawer-sheet")).toHaveCount(0);
    const point = page.locator(`[data-event-point-id*="${id}"]`);
    await expect(point).toHaveCount(1);
    await expect(point).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
      .toBeTruthy();
    const camera = new URL(page.url()).searchParams
      .get("gsViewport")!
      .split(",")
      .map(Number);
    expect(camera[1]! / 140).toBeGreaterThan(year - 3);
    expect(camera[1]! / 140).toBeLessThan(year + 3);
    await page.screenshot({
      path: testInfo.outputPath(`japan-${year}-${id.slice(-4)}.png`),
      animations: "disabled"
    });
  }
  expect(errors).toEqual([]);
  await testInfo.attach("japan-publication-chronology.json", {
    body: JSON.stringify({
      pointer,
      positions,
      unplaced_count: spatial.unplaced_count
    }),
    contentType: "application/json"
  });
});
