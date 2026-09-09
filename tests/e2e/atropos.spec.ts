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
    versions: { contract: "2", schema: "1.0.0", publication_format: "1.0.0" },
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
