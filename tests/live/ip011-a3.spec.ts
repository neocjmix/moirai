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

  await page.goto(graph);
  await expect(page.getByText("Moirai · World Revision 32")).toBeVisible();
  await expect(page.getByText("배치 125 · 미배치 2")).toBeVisible();
  await page
    .getByRole("button", { name: `${owner!.collection.title} 설명` })
    .click();
  const detail = page.getByRole("complementary", { name: "선택된 본문" });
  await detail.getByRole("button", { name: unplaced[0]! }).click();
  await expect(
    detail.getByRole("heading", { name: unplacedDetail.event.title })
  ).toBeVisible();
  await expect(detail).toContainText(unplacedDetail.narrative.body);
  await expect(page).toHaveURL(new RegExp(`event=${unplaced[0]}`));

  await page.goto(`${graph}&event=${sharedId}`);
  await expect(detail.getByRole("heading", { name: "계유정난" })).toBeVisible();
  await page.getByRole("checkbox", { name: "조선 전기 연표" }).uncheck();
  await page
    .getByRole("checkbox", { name: "단종 폐위 — 정변에서 죽음까지" })
    .check();
  await expect(detail.getByRole("heading", { name: "계유정난" })).toBeVisible();

  await page.goto(`${graph}&event=${compositeId}`);
  await expect(detail).toContainText("복합 사건 · World의 contains 관계");
  await detail.getByRole("button", { name: childId }).click();
  await expect(
    detail.getByRole("heading", { name: "세조 즉위" })
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`event=${childId}`));
  console.log(`live mobile unplaced Event IDs: ${unplaced.join(", ")}`);
});
