import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";
const battle = "019f3b00-0000-7000-8000-000000000a12";
const war = "019f3b00-0000-7000-8000-000000000a11";
const unplaced = "019f3b00-0000-7000-8000-000000000a13";

const node = (page: Page, id: string) =>
  page.locator("svg [data-event-node]").filter({
    has: page.locator("title", { hasText: id })
  });

test("v5 complete fixture shares World Event identity across Collections and keeps separate Narratives", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/graph/v5?world=${world}`);
  await expect(
    page.getByRole("heading", { name: "실제 세계사" })
  ).toBeVisible();
  await expect(page.getByText("배치 2 · 미배치 1")).toBeVisible();
  await expect(node(page, battle)).toHaveCount(1);
  await page.getByRole("checkbox", { name: "일본사" }).check();
  await expect(node(page, battle)).toHaveCount(1);
  await page.getByRole("checkbox", { name: "조선사" }).uncheck();
  await expect(node(page, battle)).toHaveCount(1);
  await expect(node(page, war)).toHaveCount(0);

  await page.getByRole("button", { name: "일본사 설명" }).click();
  const detail = page.getByRole("complementary", { name: "선택된 본문" });
  await expect(detail).toContainText("일본사 컬렉션 서사");
  await detail.getByRole("button", { name: unplaced }).click();
  await expect(detail).toContainText("연대 미상 사건 서사");
  await node(page, battle).click();
  await expect(detail).toContainText("공유된 전투 서사");
  expect(errors).toEqual([]);
});

test("v5 World Composite remains a factual region while Collection selection is navigational", async ({
  page
}) => {
  await page.goto(`/graph/v5?world=${world}`);
  await expect(node(page, war)).toHaveCount(1);
  // A one-child region and its child point can overlap geometrically; the
  // bounded keyboard/touch navigation target keeps the Composite addressable.
  await page.getByRole("button", { name: `복합 사건 열기 ${war}` }).click();
  const detail = page.getByRole("complementary", { name: "선택된 본문" });
  await expect(detail).toContainText("복합 사건 · World의 contains 관계");
  await expect(detail).toContainText("임진왜란 서사");
  await detail.getByRole("button", { name: battle }).click();
  await expect(detail).toContainText("공유된 전투 서사");
  await page.getByRole("button", { name: "조선사 설명" }).click();
  await expect(detail).toContainText("조선사 컬렉션 서사");
  await expect(detail).not.toContainText("복합 사건 · World의 contains 관계");
});
