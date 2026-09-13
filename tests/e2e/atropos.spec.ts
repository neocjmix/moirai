import { expect, test } from "@playwright/test";

const worldId = "019f3b00-0000-7000-8000-000000000001";
const canonId = "019f3b00-0000-7000-8000-000000000002";
const firstEventId = "019f3b00-0000-7000-8000-000000000101";
const firstEventTitle = "220년에 기록된 사건";

test("mobile graph shell navigates app screens without consuming graph query state", async ({
  page
}) => {
  await page.goto("/graph?queryVersion=1&sources=fixture");

  const graph = page.getByRole("button", { name: /공개 그래프|Public graph/ });
  await expect(graph).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: /프라이빗|Private/ }).click();
  await expect(page).toHaveURL(/\/graph\/private/);
  expect(new URL(page.url()).searchParams.get("queryVersion")).toBe("1");
  expect(new URL(page.url()).searchParams.get("sources")).toBe("fixture");
  await expect(
    page.getByText(
      /준비 중 · 현재 사용할 수 없음|Planned · currently unavailable/
    )
  ).toBeVisible();
  await expect(
    page.getByText(/권한 모델이 승인되기 전|access rules are approved/)
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("button", { name: /프라이빗|Private/ })
  ).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: /공개 그래프|Public graph/ }).click();
  await expect(page).toHaveURL(/\/graph\?/);
  expect(new URL(page.url()).searchParams.get("queryVersion")).toBe("1");
  expect(new URL(page.url()).searchParams.get("sources")).toBe("fixture");
  await expect(graph).toHaveAttribute("aria-current", "page");
});

test("mobile source island restores published World, Canon, Time System, and Revision", async ({
  page
}) => {
  await page.goto("/graph");
  await expect(page.getByTestId("moirai-source-island")).toHaveCount(1);
  await expect(page.getByTestId("graph-stage")).toBeVisible();
  await expect(page.getByTestId("moirai-native-graph-stage")).toHaveCount(0);
  await expect(page.getByTestId("moirai-source-island")).toContainText(
    "Temporal Expressiveness Observatory"
  );
  await page
    .getByRole("button", { name: /소스 쿼리 열기|Open source query/ })
    .first()
    .click();

  await expect(page.getByTestId("reader-world-overview")).toBeVisible();
  await expect(
    page.getByText("Revision vector", { exact: true })
  ).not.toBeVisible();
  await page
    .getByText(/탐색 범위와 시간 기준|Sources and time frame/, { exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /시간 기준|Time frame/ })
  ).toBeVisible();
  await expect(
    page.getByLabel(/Temporal Expressiveness Observatory/)
  ).toBeChecked();
  await expect(page.getByText("served Revision 2").first()).toBeVisible();
  await expect(page.getByLabel(/Temporal Acceptance Canon/)).toBeChecked();
  await expect(page.getByText("PUBLICATION SOURCE")).toHaveCount(0);

  await expect
    .poll(() => new URL(page.url()).searchParams.has("mq"))
    .toBe(true);
  const sharedUrl = page.url();
  await page.goto(sharedUrl);
  await page
    .getByRole("button", { name: /소스 쿼리 열기|Open source query/ })
    .first()
    .click();
  await page
    .getByText(/탐색 범위와 시간 기준|Sources and time frame/, { exact: true })
    .click();
  await expect(
    page.getByLabel(/Temporal Expressiveness Observatory/)
  ).toBeChecked();
  await expect(page.getByLabel(/Temporal Acceptance Canon/)).toBeChecked();
});

test("URDR mock viewport preserves a single island, bottom dock, selection and mobile detail sheet", async ({
  page
}) => {
  await page.goto("/graph/demo");
  await expect(page.getByTestId("moirai-source-island")).toHaveCount(1);
  await expect(page.getByTestId("graph-stage")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: /주요 섹션|Primary sections/ })
  ).toBeVisible();

  const node = page.locator('[data-event-point-id="event:founding"]');
  await expect(node).toBeVisible();
  await node.click();
  await expect(page.getByTestId("event-drawer-sheet")).toBeVisible();
  await expect(page.getByTestId("event-drawer-sheet")).toContainText(
    /조선 건국|Founding of Joseon/
  );
});

test("URDR mock viewport renders its historical fixture instead of Publication entities", async ({
  page
}) => {
  await page.goto("/graph/demo");
  await expect(
    page.locator('[data-event-point-id="event:founding"]')
  ).toBeVisible();
  await expect(
    page.locator("svg text").filter({ hasText: /^조선 건국$/ })
  ).toBeVisible();
  await expect(page.locator(`[data-event-id="${firstEventId}"]`)).toHaveCount(
    0
  );
});

test("identity-aware search deduplicates shared Events and restores Canon context and focus", async ({
  page
}) => {
  await page.goto("/graph");
  await page
    .getByRole("button", { name: /소스 쿼리 열기|Open source query/ })
    .first()
    .click();
  await page.getByRole("tab", { name: /사건|Events/, exact: true }).click();

  const sharedA = page.locator(`[data-entity-id="${firstEventId}"]`);
  await expect(sharedA).toHaveCount(1);
  await expect(sharedA).toContainText("Temporal Acceptance Canon");
  await expect(
    sharedA.getByText("persisted", { exact: true })
  ).not.toBeVisible();
  await sharedA.getByText(/기록 정보|Record details/, { exact: true }).click();
  await expect(sharedA).toContainText(canonId);
  await expect(sharedA).toContainText("persisted");

  await sharedA.getByRole("button").click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mq"))
    .toContain("selection");
  const focusedUrl = page.url();
  await page.goto(focusedUrl);
  await page
    .getByRole("button", { name: /소스 쿼리 열기|Open source query/ })
    .first()
    .click();
  await page.getByRole("tab", { name: /사건|Events/, exact: true }).click();
  await expect(sharedA).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get("mq")).toContain(firstEventId);
});

test("reader island keeps observation details outside its primary exploration tabs", async ({
  page
}) => {
  await page.goto("/graph");
  await page
    .getByRole("button", { name: /소스 쿼리 열기|Open source query/ })
    .first()
    .click();
  const island = page.getByTestId("moirai-source-island");
  await expect(island.getByRole("tab")).toHaveCount(4);
  await expect(island.getByTestId("reader-world-overview")).toContainText(
    "Temporal Expressiveness Observatory"
  );
  await expect(island.getByTestId("graph-diagnostics")).not.toBeVisible();
  await island
    .getByText(/관측 정보|Observation/, { exact: true })
    .first()
    .click();
  await expect(island.getByTestId("graph-diagnostics")).toBeVisible();
  await expect(island.getByTestId("reader-world-overview")).toBeVisible();
});

test("R1 Relation filters preserve shared identity and explain contradiction", async ({
  page
}) => {
  await page.goto("/graph");
  await page
    .getByRole("button", { name: /소스 쿼리 열기|Open source query/ })
    .first()
    .click();
  await page
    .getByRole("tab", { name: /연결|Connections/, exact: true })
    .click();

  const shared = page
    .getByTestId("moirai-source-island")
    .locator('[data-relation-id="019f3b00-0000-7000-8000-000000000201"]');
  await expect(shared).toHaveCount(1);
  await expect(shared).toContainText(canonId);
  await expect(shared).toContainText(firstEventId);
  await expect(shared).toContainText("019f3b00-0000-7000-8000-000000000003");

  await page.getByRole("button", { name: "causal", exact: true }).click();
  await expect(shared).toBeVisible();
  await page.getByRole("button", { name: "not_after", exact: true }).click();
  await expect(shared).toHaveCount(0);
  await page.getByRole("button", { name: "not_after", exact: true }).click();
  await expect(shared).toBeVisible();

  await page
    .getByTestId("reader-observation-details")
    .locator("summary")
    .click();
  const unplaced = page.locator('[data-diagnostic-code="unplaced"]').first();
  await expect(unplaced).toContainText(/valid knowledge state/);
  await expect(unplaced).toContainText(/no authored temporal placement/);
});

test("mobile reader traverses the single relational temporal model", async ({
  page
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atropos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "공개 World" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Temporal Expressiveness Observatory" })
  ).toBeVisible();
  await expect(page.getByText("SERVED REVISION 2")).toBeVisible();
  await page.getByRole("link", { name: /Temporal Acceptance Canon/ }).click();
  await expect(page).toHaveURL(`/worlds/${worldId}/canons/${canonId}`);
  await expect(
    page.getByRole("heading", { name: "Temporal Acceptance Canon" })
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("시간 · REVISION 2")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "사건 관계 탐색" })
  ).toBeVisible();
  await expect(page.getByTestId("jointjs-graph-stage")).toBeVisible();
  await page.getByText("접근 가능한 사건과 관계 목록").click();
  await page.getByRole("button", { name: firstEventTitle }).click();
  await expect(page).toHaveURL(new RegExp(`view=graph.*focus=${firstEventId}`));
  await expect(
    page.getByRole("link", { name: "Event 상세 열기 →" })
  ).toBeVisible();
  await expect(page.getByTestId("graph-inspector-sheet")).toContainText(
    "Revision 2"
  );
  await expect(page.getByText("DERIVED TIMELINE")).toHaveCount(0);
  await expect(page.getByText("DERIVED PROCESSES")).toHaveCount(0);
  await page
    .locator("a.event-card")
    .filter({ hasText: firstEventTitle })
    .click();
  await expect(
    page.getByRole("heading", { name: firstEventTitle })
  ).toBeVisible();
  await expect(page.getByText("Revision 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "World Event canonical URL" })
  ).toHaveAttribute("href", `/worlds/${worldId}/events/${firstEventId}`);
  await expect(
    page.getByRole("link", { name: "그래프로 돌아가기" })
  ).toHaveAttribute(
    "href",
    `/worlds/${worldId}/canons/${canonId}?view=graph&focus=${firstEventId}`
  );
  await expect(page.getByText("STRUCTURED ATTRIBUTES")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "같은 Revision의 공개 시간 JSON" })
  ).toBeVisible();
});

test("health and immutable artifacts expose only the relational model", async ({
  request
}) => {
  const health = await request.get("/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({
    status: "ok",
    service: "atropos-web"
  });

  const status = await request.get("/__status", {
    headers: { accept: "application/json" }
  });
  expect(status.ok()).toBe(true);
  expect(await status.json()).toMatchObject({
    application: { service: "atropos-web" },
    versions: { contract: "4", schema: "1.0.0", publication_format: "3.0.0" },
    surfaces: { atropos: "ok", health: "ok", status: "ok" }
  });

  const event = await request.get(
    `/worlds/${worldId}/revisions/2/events/${firstEventId}.json`
  );
  expect(event.ok()).toBe(true);
  expect(event.headers()["cache-control"]).toContain("immutable");
  const eventPayload = await event.json();
  expect(eventPayload).toMatchObject({
    served_revision: 2,
    event: { id: firstEventId }
  });
  expect(JSON.stringify(eventPayload)).not.toContain("temporal_placements");
  expect(JSON.stringify(eventPayload)).not.toContain("process_artifact");

  const temporal = await request.get(
    `/worlds/${worldId}/revisions/2/graph/canons/${canonId}/temporal.json`
  );
  expect(temporal.ok()).toBe(true);
  expect(temporal.headers()["cache-control"]).toContain("immutable");
  expect(await temporal.json()).toMatchObject({
    source_revision: 2,
    projection_type: "event_relational_time",
    canon_id: canonId,
    algorithm_version: "event-relational-projection/1"
  });

  const graphScope = await request.get(
    `/worlds/${worldId}/revisions/2/graph/canons/${canonId}/scope-overview.json`
  );
  expect(graphScope.ok()).toBe(true);
  expect(graphScope.headers()["cache-control"]).toContain("immutable");
  expect(await graphScope.json()).toMatchObject({
    source_revision: 2,
    served_revision: 2,
    projection_type: "graph_scope",
    canon_id: canonId,
    algorithm_version: "event-relational-graph-scope/2",
    nodes: expect.arrayContaining([
      expect.objectContaining({
        layout_basis: "inferred_chronology",
        chronology: expect.objectContaining({
          placement_kind: "inferred_layout"
        })
      })
    ]),
    budget: { max_cells: 1000, max_labels: 250 },
    truncated: false
  });

  for (const name of [
    "states.json",
    `timeline-${canonId}.json`,
    `process-${firstEventId}.json`
  ]) {
    expect(
      (
        await request.get(
          `/worlds/${worldId}/revisions/2/graph/canons/${canonId}/${name}`
        )
      ).status()
    ).toBe(404);
  }
});
