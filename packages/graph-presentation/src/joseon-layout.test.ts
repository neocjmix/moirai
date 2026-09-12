import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { CreateChangeSet } from "@moirai/contracts";
import { resolveCreateOperations } from "@moirai/domain";
import type { CanonicalRevisionView } from "@moirai/projections";
import { buildPublicationArtifacts } from "@moirai/publication";
import { queryFromPublicationDocuments } from "@moirai/graph-query";
import { projectPresentationInput } from "./index.js";
import { layoutPresentationScope } from "./semantic-layout.js";
it("keeps all Joseon dogfood Events placed within their authored year ranges and orders", () => {
  const plan = JSON.parse(
    readFileSync(
      new URL(
        "../../../docs/implementation/fixtures/joseon-dogfood.change-plan.json",
        import.meta.url
      ),
      "utf8"
    )
  ) as CreateChangeSet;
  const operations = resolveCreateOperations(
    { ...plan, actor: "019f5b00-0000-7000-8000-000000000099" },
    () => {
      throw Error("explicit IDs required");
    }
  ).operations;
  const rows = (type: string) =>
    operations
      .filter((o) => o.kind === "create" && o.entity_type === type)
      .map((o) => ({ id: o.entity_id, ...o.value }));
  const em = operations.flatMap((o) =>
    o.kind === "add" && o.entity_type === "event_canon_membership"
      ? [o.value]
      : []
  );
  const rm = operations.flatMap((o) =>
    o.kind === "add" && o.entity_type === "relation_canon_membership"
      ? [o.value]
      : []
  );
  const view = {
    world: rows("world")[0],
    canons: rows("canon"),
    timeSystems: rows("time_system"),
    canonTimeSystems: rows("canon_time_system"),
    eventCanonMemberships: em,
    relationCanonMemberships: rm,
    events: rows("event").map((e) => ({
      ...e,
      canon_memberships: em
        .filter((m) => m.event_id === e.id)
        .map((m) => m.canon_id)
    })),
    relations: rows("relation").map((r) => ({
      ...r,
      canon_memberships: rm
        .filter((m) => m.relation_id === r.id)
        .map((m) => m.canon_id)
    })),
    narratives: rows("narrative")
  } as unknown as CanonicalRevisionView;
  const publication = buildPublicationArtifacts(
    view,
    1,
    "2026-09-12T00:00:00Z"
  );
  const result = queryFromPublicationDocuments(
    publication.manifestBody,
    publication.documents
  )!;
  const input = projectPresentationInput(result);
  const scope = input.scopes[0]!;
  const layout = layoutPresentationScope(input, scope);
  expect(layout.unplaced).toEqual([]);
  expect(
    layout.chartPlane.entities.filter((e) => e.id.startsWith("m_event_"))
  ).toHaveLength(40);
  expect(
    layout.diagnostics.some(
      (d) =>
        d.code.includes("infeasible") ||
        d.code.includes("outside_semantic_bounds")
    )
  ).toBe(false);
  const points = new Map(
    layout.chartPlane.entities.flatMap((e) =>
      e.geometryKind === "point" ? [[e.id, e.position.y] as const] : []
    )
  );
  for (const link of scope.links) {
    if (!points.has(link.sourceId) || !points.has(link.targetId)) continue;
    if (link.relation.type === "precedes")
      expect(points.get(link.sourceId)!).toBeLessThan(
        points.get(link.targetId)!
      );
    if (link.relation.type === "not_after")
      expect(points.get(link.sourceId)!).toBeLessThanOrEqual(
        points.get(link.targetId)!
      );
  }
});
