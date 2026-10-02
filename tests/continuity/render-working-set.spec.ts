import { expect, test } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";
const event = "019f3b00-0000-7000-8000-000000000a12";
const composite = "019f3b00-0000-7000-8000-000000000a11";

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
  await page.goto(`/graph/v5?world=${world}&event=${event}`);
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
