import { expect, test } from "@playwright/test";

const world = "019f3b00-0000-7000-8000-000000000a01";
const battle = "019f3b00-0000-7000-8000-000000000a12";

test("Lab entry opens the real GraphShell with exact iteration overlay and preserves Event selection", async ({
  page
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    localStorage.setItem("urdr:app-language-override", "ko")
  );
  await page.goto(
    `/labs/layout-v2?world=${world}&event=${battle}&discovery=legacy`
  );
  await expect(page).toHaveURL(/\/graph\/v5\?.*layoutLab=force-v2/);
  await expect(page.getByTestId("graph-stage")).toBeVisible();
  const drawer = page.getByTestId("event-drawer-sheet");
  await expect(drawer).toContainText("공유된 전투");
  const overlay = page.getByTestId("layout-v2-overlay");
  await expect(overlay).toHaveAttribute("data-tick", "0", { timeout: 30_000 });
  const camera = new URL(page.url()).searchParams.get("gsViewport");
  const seek = async (tick: number) => {
    await page.getByLabel("Iteration", { exact: true }).fill(String(tick));
    await expect(overlay).toHaveAttribute("data-tick", String(tick), {
      timeout: 30_000
    });
  };
  await seek(100);
  const digest = await overlay.getAttribute("data-state-digest");
  await seek(1000);
  await seek(100);
  await expect(overlay).toHaveAttribute("data-state-digest", digest!);
  await overlay.getByRole("button", { name: "설정 ▾", exact: true }).click();
  await overlay
    .getByRole("button", { name: "설정·결과 JSON", exact: true })
    .click();
  const exported = page.getByLabel("설정과 결과 JSON", { exact: true });
  await expect(exported).not.toHaveValue("");
  const json = await exported.inputValue();
  await seek(0);
  await page.getByLabel("가져올 실험 JSON", { exact: true }).fill(json);
  await overlay.getByRole("button", { name: "JSON 재현", exact: true }).click();
  await expect(overlay).toHaveAttribute("data-tick", "100", {
    timeout: 30_000
  });
  await expect(overlay).toHaveAttribute("data-state-digest", digest!);
  await overlay.getByRole("button", { name: "설정 ▴", exact: true }).click();
  await expect(drawer).toContainText("공유된 전투");
  expect(new URL(page.url()).searchParams.get("gsViewport")).toBe(camera);
  await overlay.getByRole("button", { name: "현재 운영", exact: true }).click();
  await expect(overlay).toHaveCount(0);
  await expect(drawer).toContainText("공유된 전투");
  await page.getByRole("button", { name: "Lab v2", exact: true }).click();
  await expect(overlay).toHaveAttribute("data-tick", "0");
  await expect(drawer).toContainText("공유된 전투");
  expect(errors).toEqual([]);
});
