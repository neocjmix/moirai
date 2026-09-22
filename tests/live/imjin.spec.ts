import { expect, test } from "@playwright/test";

const world = "01995c2a-7b00-7000-8000-000000000101";
const main = "019f8c00-0000-7000-8000-000000000100";
const sea = "019f8c00-0000-7000-8000-000000000101";
const hansan = "019f8c00-0000-7000-8000-000000001017";
const noryang = "019f8c00-0000-7000-8000-000000001051";

test("published shared Event opens two reader narratives, source details, and history on mobile and desktop", async ({
  page,
  request
}, testInfo) => {
  const pointer = await request.get(`/worlds/${world}/current.json`);
  expect(pointer.ok()).toBe(true);
  const published = await pointer.json();
  expect(published.served_revision).toBeGreaterThanOrEqual(25);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `/graph/events/${world}/${hansan}?revision=${published.served_revision}`
  );
  const drawer = page.getByTestId("event-drawer-sheet");
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("data-stage", "full");
  await expect(drawer).toContainText("임진왜란 — 침공에서 노량까지");
  await expect(drawer).toContainText("임진왜란 — 수군과 해상 보급로");
  await expect(drawer).toContainText("와키자카 야스하루");
  await expect(drawer).toContainText("전장 선택 자체가 승리의 중요한 조건");
  await expect(drawer).not.toContainText("이 데이터는 연도 수준");
  const initialText = await drawer.innerText();
  expect(initialText.length).toBeGreaterThan(700);
  await page.screenshot({
    path: testInfo.outputPath("shared-hansan-drawer.png")
  });
  await page.getByTestId("event-drawer-stage-toggle").click();
  await expect(drawer).toHaveAttribute("data-stage", "peek");
  await page.goBack();
  await expect(drawer).toHaveAttribute("data-stage", "full");
  await page.getByTestId("event-drawer-close").click();
  await expect(drawer).toHaveCount(0);
  await expect
    .poll(() => page.locator("[data-event-point-id]").count())
    .toBeGreaterThan(0);
  const ids = await page
    .locator("[data-event-point-id]")
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-event-point-id"))
    );
  expect(ids.length).toBe(new Set(ids).size);
  await page.screenshot({ path: testInfo.outputPath("shared-graph.png") });

  await page.goto(
    `/graph/events/${world}/${noryang}?revision=${published.served_revision}&canon=${main}`
  );
  await expect(drawer).toContainText("노량해전");
  await expect(drawer).toContainText("고니시 유키나가");
  await expect(drawer).toContainText("마지막 대규모 해전");
  await expect(drawer).not.toContainText("수군의 관점");
  await page.screenshot({ path: testInfo.outputPath("noryang-drawer.png") });
  expect(errors).toEqual([]);
  await testInfo.attach("publication.json", {
    body: JSON.stringify(
      {
        published,
        sharedEvent: hansan,
        canons: [main, sea],
        renderedUniquePoints: ids.length,
        errors
      },
      null,
      2
    ),
    contentType: "application/json"
  });
});

test("the full Imjin overview has parallel positions and nested containment", async ({
  page,
  request
}, testInfo) => {
  const published = await (
    await request.get(`/worlds/${world}/current.json`)
  ).json();
  const system = {
    time_system_id: "019f5b00-0000-7000-8000-000000000003",
    definition_version: "1",
    adapter_identity: "yyyy-iso-fields-fraction12-z-v1",
    comparison_domain: "yyyy-iso-fields-fraction12-z-v1"
  };
  const state = {
    version: 1,
    query: {
      contract_version: 1,
      temporal_frame: { target: system },
      sources: [
        {
          world_id: world,
          served_revision: published.served_revision,
          canon_ids: [main],
          time_systems: [system]
        }
      ],
      scope: { kind: "overview" },
      entity_filter: {
        event_kinds: ["atomic", "composite"],
        roles: [],
        subject_handle_ids: [],
        include_states: true,
        include_narratives: true,
        include_virtual_time_events: true
      },
      relation_filter: {
        types: [
          "contains",
          "precedes",
          "not_after",
          "coincides",
          "causes",
          "enables",
          "influences",
          "starts",
          "ends"
        ],
        directions: ["directed", "undirected"]
      },
      diagnostics_filter: {
        include_codes: [],
        include_unplaced: true,
        include_unresolved: true
      },
      budget: {
        detail_level: "overview",
        max_entities: 1000,
        max_relations: 2000,
        max_evidence: 4000
      }
    },
    focus: null
  };
  await page.goto(`/graph?mq=${encodeURIComponent(JSON.stringify(state))}`);
  const points = page.locator("[data-event-point-id]");
  await expect.poll(() => points.count()).toBeGreaterThan(5);
  await expect
    .poll(() => page.locator("[data-region-id]").count())
    .toBeGreaterThan(1);
  const positions = await points.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-event-point-id"),
        x: Math.round(r.x),
        y: Math.round(r.y)
      };
    })
  );
  expect(new Set(positions.map((p) => p.x)).size).toBeGreaterThan(2);
  expect(new Set(positions.map((p) => p.y)).size).toBeGreaterThan(2);
  expect(positions.length).toBe(new Set(positions.map((p) => p.id)).size);
  await page.screenshot({ path: testInfo.outputPath("imjin-overview.png") });
  await page.getByRole("button", { name: "소스 쿼리 열기" }).first().click();
  await page.getByRole("tab", { name: "찾기", exact: true }).click();
  await page.getByRole("searchbox").fill("노량해전");
  await expect(page.getByTestId("identity-search-results")).toContainText(
    "노량해전"
  );
  await page
    .getByRole("button", { name: "그래프에서 보기: 노량해전", exact: true })
    .click();
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(
    "노량해전"
  );
  await testInfo.attach("overview.json", {
    body: JSON.stringify(
      { revision: published.served_revision, positions },
      null,
      2
    ),
    contentType: "application/json"
  });
});
