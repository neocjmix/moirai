import { expect, test } from "@playwright/test";
const id = (n: number) =>
  `019f5000-2200-7000-8000-${String(n).padStart(12, "0")}`;
for (const size of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 }
]) {
  test(`World selection isolates Event reading at ${size.width}px`, async ({
    page
  }) => {
    await page.setViewportSize(size);
    await page.goto("/worlds");
    await expect(
      page.getByRole("heading", { name: "월드 선택" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Lifecycle World 3", exact: true })
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "Lifecycle World 1", exact: true })
      .click();
    await expect(
      page.getByText("아직 시간축이 없는 월드입니다.")
    ).toBeVisible();
    await page.getByRole("link", { name: "사건 목록 보기" }).click();
    await page
      .getByRole("link", { name: "Unplaced first Event", exact: true })
      .click();
    await expect(page.getByLabel("선택한 사건")).toContainText(
      "Synthetic narrative remains readable"
    );
    await expect(
      page.getByRole("link", { name: "Synthetic reference" })
    ).toHaveAttribute("href", "https://example.test/source");
    await page.reload();
    await expect(page.getByLabel("선택한 사건")).toContainText(
      "Synthetic narrative remains readable"
    );
    await page.getByRole("link", { name: "월드 선택" }).click();
    await page
      .getByRole("link", { name: "Lifecycle World 2", exact: true })
      .click();
    await page.getByRole("link", { name: "사건 목록 보기" }).click();
    await expect(page.getByText("아직 사건이 없습니다.")).toBeVisible();
    await expect(
      page.getByText("Synthetic narrative remains readable", { exact: false })
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });
}
test("explicit World URLs distinguish withdrawal, pending and malformed IDs", async ({
  page
}) => {
  await page.goto(`/graph?world=${id(3)}`);
  await expect(
    page.getByRole("heading", { name: "철회된 월드입니다" })
  ).toBeVisible();
  await page.goto(`/worlds/${id(3)}/events`);
  await expect(
    page.getByRole("heading", { name: "철회된 월드입니다" })
  ).toBeVisible();
  await page.goto(`/graph/v5?world=${id(4)}`);
  await expect(
    page.getByRole("heading", { name: "공개본을 준비하고 있습니다" })
  ).toBeVisible();
  await page.goto(`/graph/v5?world=${id(99)}`);
  await expect(
    page.getByRole("heading", { name: "월드 공개본을 찾을 수 없습니다" })
  ).toBeVisible();
  await page.goto("/graph/v5?world=invalid");
  // Next streams the shell with 200 before the async notFound boundary.
  await expect(
    page.getByRole("heading", { name: "404", exact: true })
  ).toBeVisible();
});

test("duplicate explicit World parameters never select the default World", async ({
  page
}) => {
  for (const path of ["/graph", "/graph/settings", "/graph/v5"]) {
    await page.goto(`${path}?world=${id(1)}&world=${id(1)}`);
    await expect(
      page.getByRole("heading", { name: "404", exact: true })
    ).toBeVisible();
    await expect(page.getByText("실제 세계사", { exact: true })).toHaveCount(0);
  }
});
