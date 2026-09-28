import { expect, test } from "@playwright/test";

const worldId = "01995c2a-7b00-7000-8000-000000000101";
const systemId = "019f5b00-0000-7000-8000-000000000003";
const sharedId = "019f5b00-0000-7000-8000-000000000115";
const compositeId = "01a0c40a-a761-7fc7-aef2-10211e0ecb0e";
const childId = "019f5b00-0000-7000-8000-000000000116";
const graph = `/graph/v5?world=${worldId}`;

test("A5 corpus is published with shared identity and readable mobile narrative", async ({
  page,
  request
}) => {
  const read = async (body: Record<string, unknown>) => {
    const response = await request.post("/graph/v5/read", {
      data: { world_id: worldId, ...body }
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).data;
  };
  const catalog = await read({ kind: "collections", page: 0 });
  const synthetic = (
    catalog.collections as { id: string; title: string }[]
  ).filter((item) => item.title.startsWith("[A5 실험 "));
  expect(synthetic).toHaveLength(24);
  const memberships = await Promise.all(
    synthetic.map(
      async (collection) =>
        (
          await read({
            kind: "collection",
            collection_id: collection.id,
            page: 0
          })
        ).event_ids as string[]
    )
  );
  expect(new Set(memberships.flat()).size).toBe(552);
  const shared = "019f9280-a500-7000-8000-0000000003e8";
  expect(memberships.filter((ids) => ids.includes(shared))).toHaveLength(24);
  await page.addInitScript(() =>
    localStorage.setItem("urdr:app-language-override", "ko")
  );
  await page.goto(
    `${graph}&collections=${catalog.collections.map((item: { id: string }) => item.id).join(",")}&event=${shared}`
  );
  const drawer = page.getByTestId("event-drawer-sheet");
  await expect(drawer).toContainText("항구의 교역");
  await expect(drawer).toContainText("가상 사건");
  await page.getByTestId("event-drawer-close").click();
  await expect(page.locator(`[data-event-point-id="${shared}"]`)).toHaveCount(
    1
  );
  await expect(page.getByTestId("graph-context-topic")).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
    .not.toBeNull();
  const camera = new URL(page.url()).searchParams.get("gsViewport");
  await page.getByRole("button", { name: "컬렉션 30", exact: true }).click();
  const option = page.getByRole("checkbox", {
    name: synthetic[23]!.title,
    exact: true
  });
  await option.uncheck();
  await expect(
    page.getByRole("button", { name: "컬렉션 29", exact: true })
  ).toBeVisible();
  await expect(option).toBeEnabled();
  await option.check();
  await expect(
    page.getByRole("button", { name: "컬렉션 30", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gsViewport"))
    .toBe(camera);
  await expect(page.locator(`[data-event-point-id="${shared}"]`)).toHaveCount(
    1
  );
  const surface = page.locator("svg[data-semantic-budget]");
  const budget = Number(await surface.getAttribute("data-semantic-budget"));
  expect(budget).toBeGreaterThanOrEqual(8);
  expect(budget).toBeLessThanOrEqual(32);
  expect(
    await surface.locator("[data-primary-hit-target]").count()
  ).toBeLessThanOrEqual(budget);
  const geographic = page.locator('[data-representation="geographic"]');
  await expect(geographic).not.toHaveCount(0);
  await expect(geographic.locator("[data-primary-hit-target]")).toHaveCount(0);
  expect(
    await geographic.evaluateAll((nodes) =>
      nodes.every(
        (node) =>
          node.getAttribute("aria-hidden") === "true" &&
          (node.tagName.toLowerCase() !== "path" ||
            getComputedStyle(node).pointerEvents === "none")
      )
    )
  ).toBe(true);
  const semanticTarget = surface
    .locator('[data-primary-hit-target="event"]')
    .first();
  await expect(semanticTarget).toBeVisible();
  const title = await semanticTarget.getAttribute("aria-label");
  await semanticTarget.focus();
  await semanticTarget.press("Enter");
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(title!);
});

test("live mobile Collection, unplaced Event and Composite navigation", async ({
  page,
  request
}) => {
  const read = async <T>(body: Record<string, unknown>): Promise<T> => {
    const response = await request.post("/graph/v5/read", {
      data: { world_id: worldId, ...body }
    });
    expect(response.ok()).toBe(true);
    const payload = (await response.json()) as {
      served_revision: number;
      data: T;
    };
    expect(payload.served_revision).toBeGreaterThanOrEqual(32);
    return payload.data;
  };
  const allCatalog = await read<{
    collections: { id: string; title: string }[];
  }>({
    kind: "collections",
    page: 0
  });
  // Preserve the exact historical A3 regression subset as the explicitly
  // authorized A5 synthetic corpus grows in this same development World.
  const catalog = {
    collections: allCatalog.collections.filter(
      (collection) => !collection.title.startsWith("[A5 실험 ")
    )
  };
  expect(catalog.collections).toHaveLength(6);
  const members = await Promise.all(
    catalog.collections.map(async (collection) => ({
      collection,
      ids: (
        await read<{ event_ids: string[] }>({
          kind: "collection",
          collection_id: collection.id,
          page: 0
        })
      ).event_ids
    }))
  );
  const allIds = new Set(members.flatMap((part) => part.ids));
  expect(allIds.size).toBe(127);
  const summary = await read<{
    shape_count: number;
    unplaced_count: number;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
  }>({ kind: "spatial_summary", time_system_id: systemId });
  expect(summary.shape_count).toBeGreaterThanOrEqual(125);
  expect(summary.unplaced_count).toBe(2);
  const placed = new Set<string>();
  let cursor: unknown = null;
  const seenCursors = new Set<string>();
  for (let pageNumber = 0; pageNumber <= summary.shape_count; pageNumber++) {
    const response = await request.post("/graph/v5/viewport", {
      data: {
        world_id: worldId,
        time_system_id: systemId,
        collection_ids: catalog.collections.map((item) => item.id).sort(),
        viewport: summary.bounds,
        cursor
      }
    });
    expect(response.ok()).toBe(true);
    const result = (await response.json()) as {
      shapes: { event_id: string }[];
      next_cursor: unknown | null;
    };
    for (const shape of result.shapes) placed.add(shape.event_id);
    cursor = result.next_cursor;
    if (cursor === null) break;
    const token = JSON.stringify(cursor);
    expect(seenCursors.has(token), "viewport continuation must advance").toBe(
      false
    );
    seenCursors.add(token);
  }
  expect(cursor).toBeNull();
  expect(placed.size).toBe(125);
  // Exercise the actual shell loader, not only the unbounded API loop above.
  // Synthetic candidates precede the historical events in the spatial tree.
  // The former 16-page server cutoff returned only the three founding points.
  await page.goto(
    `${graph}&collections=${catalog.collections.map((c) => c.id).join(",")}&gsViewport=0,195300,2000,18200`
  );
  // Gyeyu (115) is a bounded-time segment, not a point. Use the 1457 exile.
  const lateHistoricalPoint = "019f5b00-0000-7000-8000-000000000119";
  await expect(
    page.locator(`[data-event-point-id="${lateHistoricalPoint}"]`)
  ).toHaveCount(1, { timeout: 90_000 });
  const unplaced = [...allIds].filter((id) => !placed.has(id));
  expect(unplaced).toHaveLength(2);
  const owner = members.find((part) => part.ids.includes(unplaced[0]!));
  expect(owner).toBeDefined();
  const unplacedDetail = await read<{
    event: { title: string };
    narrative: { body: string };
  }>({ kind: "event", event_id: unplaced[0] });

  await page.addInitScript(() =>
    localStorage.setItem("urdr:app-language-override", "ko")
  );
  await page.goto("/graph");
  await expect(page.getByTestId("graph-stage")).toBeVisible();
  await expect(page.getByTestId("graph-context-hud")).toContainText(
    "실제 세계사"
  );
  await expect(page.getByTestId("moirai-source-island")).toHaveCount(0);
  await page.getByRole("button", { name: /^컬렉션/ }).click();
  await page
    .getByRole("button", {
      name: `${owner!.collection.title} 설명`,
      exact: true
    })
    .click();
  const detail = page.getByTestId("event-drawer-sheet");
  await expect(detail).toContainText(owner!.collection.title);
  await page.getByTestId("event-drawer-stage-toggle").click();
  await detail
    .getByRole("link", { name: unplacedDetail.event.title, exact: true })
    .click();
  await expect(detail).toContainText(unplacedDetail.event.title);
  await expect(detail).toContainText(unplacedDetail.narrative.body);
  await expect(page).toHaveURL(new RegExp(`event=${unplaced[0]}`));

  await page.goto(`${graph}&event=${sharedId}`);
  await expect(detail).toContainText("계유정난");
  await page.getByTestId("event-drawer-close").click();
  await page.getByRole("button", { name: /^컬렉션/ }).click();
  await page
    .getByRole("checkbox", { name: "조선 전기 연표", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", {
      name: "단종 폐위 — 정변에서 죽음까지",
      exact: true
    })
    .check();

  await page.goto(`${graph}&event=${compositeId}`);
  await expect(detail).toContainText("단종 폐위와 몰락");
  await page.getByTestId("event-drawer-stage-toggle").click();
  await detail.getByRole("link", { name: "세조 즉위", exact: true }).click();
  await expect(detail).toContainText("세조 즉위");
  await expect(page).toHaveURL(new RegExp(`event=${childId}`));
  await page.screenshot({
    path: "test-results/ip011-restored-mobile.png",
    animations: "disabled"
  });
  console.log(`live mobile unplaced Event IDs: ${unplaced.join(", ")}`);
});
