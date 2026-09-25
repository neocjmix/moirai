import { expect, test } from "@playwright/test";

const worldId = "01995c2a-7b00-7000-8000-000000000101";
const systemId = "019f5b00-0000-7000-8000-000000000003";
const sharedId = "019f5b00-0000-7000-8000-000000000115";
const compositeId = "01a0c40a-a761-7fc7-aef2-10211e0ecb0e";
const childId = "019f5b00-0000-7000-8000-000000000116";
const graph = `/graph/v5?world=${worldId}`;

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
  const catalog = await read<{ collections: { id: string; title: string }[] }>({
    kind: "collections",
    page: 0
  });
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
  expect([summary.shape_count, summary.unplaced_count]).toEqual([125, 2]);
  const placed = new Set<string>();
  let cursor: unknown = null;
  for (let pageNumber = 0; pageNumber < 32; pageNumber++) {
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
  }
  expect(cursor).toBeNull();
  expect(placed.size).toBe(125);
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
  await expect(page.getByTestId("moirai-source-island")).toHaveCount(1);
  await page.getByRole("button", { name: "소스 쿼리 열기" }).first().click();
  await page.getByText("탐색 범위와 시간 기준", { exact: true }).click();
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
  await page.getByRole("button", { name: "소스 쿼리 열기" }).first().click();
  await page.getByText("탐색 범위와 시간 기준", { exact: true }).click();
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
