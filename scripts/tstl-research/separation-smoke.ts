/** Static preview browser checks/captures; no canonical or backend writes. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:4173";
const output = process.argv[3] ?? ".artifacts/tstl-separation/smoke";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chromium" });
const results: unknown[] = [];
try {
  for (const [profile, width, height] of [
    ["desktop", 1280, 800],
    ["mobile", 390, 844]
  ] as const) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: profile === "mobile",
      hasTouch: profile === "mobile"
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const view of ["overview", "imjin", "detail"])
      for (const mode of [
        "Bubble",
        "A-Bubble",
        "Lanes-wide",
        "Lanes",
        "Aligned"
      ])
        for (const fit of [0, 1])
          for (const points of [0, 1]) {
            const scope = view === "overview" ? "roots" : "middle";
            await page.goto(
              `${base}/?mode=${mode}&view=${view}&scope=${scope}&fit=${fit}&points=${points}`
            );
            await page.locator("#graph[data-ready=true]").waitFor();
            const ids = await page
              .locator("[data-event-id]")
              .evaluateAll((nodes) =>
                nodes.map((n) => n.getAttribute("data-event-id"))
              );
            assert.equal(
              new Set(ids).size,
              ids.length,
              "one semantic leaf target per Event"
            );
            const camera = await page
              .locator("#graph")
              .getAttribute("data-camera");
            await page
              .locator("#mode")
              .selectOption(mode === "Lanes" ? "Bubble" : "Lanes");
            assert.equal(
              await page.locator("#graph").getAttribute("data-camera"),
              camera,
              "mode switching preserves camera"
            );
            await page.locator("#mode").selectOption(mode);
            assert.deepEqual(
              await page
                .locator("[data-event-id]")
                .evaluateAll((nodes) =>
                  nodes.map((n) => n.getAttribute("data-event-id"))
                ),
              ids,
              "round trip restores visible IDs"
            );
            const name = `${profile}-${mode}-${view}-${fit ? "fit" : "fixed"}-${points ? "points" : "regions"}`;
            await page.screenshot({ path: `${output}/${name}.png` });
            results.push({
              name,
              camera,
              visible: ids.length,
              status: await page.locator("#status").textContent()
            });
          }
    // Dense all-Composite captures expose nested alpha overlap, not just roots.
    for (const mode of ["Bubble", "A-Bubble", "Lanes", "Aligned"]) {
      await page.goto(`${base}/?mode=${mode}&view=imjin&scope=all&fit=1`);
      await page.locator("#graph[data-ready=true]").waitFor();
      await page.screenshot({
        path: `${output}/${profile}-${mode}-all-composites.png`
      });
    }
    // One known shared leaf exposes all actual ancestor memberships, while the
    // Imjin header exposes just its authored direct parents (Korea/Japan).
    await page.goto(`${base}/?mode=Aligned&view=imjin&scope=middle&fit=1`);
    await page.locator("#graph[data-ready=true]").waitFor();
    await page
      .locator('[data-header-id="01a10a3f-05d2-7981-94f4-08f3ea6433ec"]')
      .click();
    const lists = page.locator("#detail ul");
    assert.equal(await lists.first().locator("li").count(), 2);
    assert((await lists.first().textContent())?.includes("한국사"));
    assert((await lists.first().textContent())?.includes("일본사"));
    assert(!(await lists.first().textContent())?.includes("중국사"));
    await page.getByRole("button", { name: "Close", exact: true }).click();
    assert.equal(
      await page.locator("#event option").count(),
      540,
      "all 539 Events have a reveal route"
    );
    const sharedOption = page
      .locator("#event option")
      .filter({ hasText: "순천 왜교성 앞바다의 봉쇄" });
    const sharedId = await sharedOption.getAttribute("value");
    assert(sharedId);
    await page.locator("#event").selectOption(sharedId);
    for (const root of ["한국사", "일본사", "중국사"])
      assert(
        (await page.locator("#detail ul").last().textContent())?.includes(root)
      );
    assert.equal(
      await page.locator(`[data-event-id="${sharedId}"]`).count(),
      1
    );
    await page.locator("#mode").selectOption("Bubble");
    assert.equal(
      await page.locator("#event").inputValue(),
      sharedId,
      "selection survives mode switch"
    );
    await page.locator("#mode").selectOption("Aligned");
    await page.screenshot({
      path: `${output}/${profile}-shared-event-memberships.png`
    });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    const regionCount = await page.locator("[data-region-id]").count();
    await page.locator("#labels").uncheck();
    assert.equal(
      await page.locator("[data-region-id]").count(),
      regionCount,
      "label filtering does not change geometry"
    );
    const before = await page.locator("#graph").getAttribute("data-camera");
    const box = await page.locator("#graph").boundingBox();
    assert(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 35,
      box.y + box.height / 2 + 20
    );
    await page.mouse.up();
    assert.notEqual(
      await page.locator("#graph").getAttribute("data-camera"),
      before,
      "pan changes camera only"
    );
    assert.deepEqual(errors, []);
    results.push({ profile, errors, pan: true, imjinDirectParents: true });
    await page.close();
  }
} finally {
  await browser.close();
  writeFileSync(
    `${output}/results.json`,
    JSON.stringify({ physicalDevice: false, results }, null, 2)
  );
}
console.log(`${results.length} comparisons/check records`);
