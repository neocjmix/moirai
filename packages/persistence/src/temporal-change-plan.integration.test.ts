import { readFileSync } from "node:fs";
import type { CreateChangeSet } from "@moirai/contracts";
import { projectPublicDocuments } from "@moirai/projections";
import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  commitCreateChangeSet,
  createDatabase,
  queryClotho,
  readWorldAtRevision,
  validateChangePlan
} from "./index.js";
import { migrateToLatest } from "./migrate.js";
import { down as rollbackTemporalRelationMigration } from "./migrations/006_event_relation_time.js";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const fixtureBase = new URL(
  "../../../docs/implementation/fixtures/temporal-expressiveness/",
  import.meta.url
);

function plan(path: string): CreateChangeSet {
  return {
    ...JSON.parse(readFileSync(new URL(path, fixtureBase), "utf8")),
    actor: "019f3b00-0000-7000-8000-000000000099"
  } as CreateChangeSet;
}

describeWithDatabase("TS-010 canonical Relation write", () => {
  const db = createDatabase(databaseUrl ?? "");

  beforeAll(async () => migrateToLatest(databaseUrl ?? ""));
  beforeEach(async () => {
    await sql`
      truncate subject_handle_members, subject_handles, publication_outbox,
        world_publication_state, change_operations,
        world_revisions, change_sets, narratives, relations,
        event_temporal_placements, canon_time_systems, time_systems,
        events, canons, worlds cascade
    `.execute(db);
  });
  afterAll(async () => db.destroy());

  it("validates, commits, reads, and resolves the v2 corpus without virtual Event rows", async () => {
    const bootstrap = plan("bootstrap.change-plan.json");
    await expect(validateChangePlan(db, bootstrap)).resolves.toMatchObject({
      valid: true,
      source_revision: 0,
      virtual_time_events: []
    });
    await expect(commitCreateChangeSet(db, bootstrap)).resolves.toMatchObject({
      current_revision: 1
    });

    const success = plan("success.change-plan.json");
    const preview = await validateChangePlan(db, success);
    expect(preview.virtual_time_events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          persisted: false,
          coordinate: "2026-09-05T08:13:21.123456789012Z"
        })
      ])
    );
    const committed = await commitCreateChangeSet(db, success);
    expect(committed).toMatchObject({ current_revision: 2, warnings: [] });

    const view = await readWorldAtRevision(db, success.world_id, 2);
    expect(view.events).toHaveLength(11);
    expect(view.temporalPlacements).toEqual([]);
    expect(view.relations).toHaveLength(23);
    const artifacts = projectPublicDocuments(view, 2, "2026-09-06T00:00:00Z");
    expect(
      artifacts.find((item) => item.key.endsWith("/temporal.json"))?.value
    ).toMatchObject({
      source_revision: 2,
      served_revision: 2,
      positions: expect.arrayContaining([
        expect.objectContaining({
          event_id: "019f3b00-0000-7000-8000-000000000105",
          kind: "bounded",
          knowledge_span: { value: "1", unit: "picosecond" }
        })
      ]),
      composites: expect.arrayContaining([
        expect.objectContaining({
          duration: expect.objectContaining({
            basis: "explicit_boundaries",
            amount: { value: "2000000000000", unit: "picosecond" }
          })
        })
      ])
    });

    const canon = await queryClotho(
      db,
      "canon.get",
      {
        world_id: success.world_id,
        canon_id: "019f3b00-0000-7000-8000-000000000002",
        at_revision: 2
      },
      [success.world_id]
    );
    expect(canon).toMatchObject({
      source_revision: 2,
      events: view.events,
      relations: view.relations
    });
    const portable = await queryClotho(
      db,
      "world.export",
      {
        world_id: success.world_id,
        at_revision: 2
      },
      [success.world_id]
    );
    expect(portable).toMatchObject({
      source_revision: 2,
      completeness: "complete",
      snapshot: {
        events: view.events,
        relations: view.relations,
        temporalPlacements: []
      }
    });
    const persistedRelation = view.relations.find(
      (relation) =>
        relation.source_ref?.kind === "event" &&
        relation.target_ref?.kind === "event"
    );
    expect(persistedRelation?.source_event_id).toBe(
      (persistedRelation?.source_ref as { event_id: string }).event_id
    );
    expect(persistedRelation?.target_event_id).toBe(
      (persistedRelation?.target_ref as { event_id: string }).event_id
    );

    const exact = view.relations.find(
      (relation) => relation.id === "019f3b00-0000-7000-8000-00000000020b"
    );
    expect(exact?.target_ref).toMatchObject({
      persisted: false,
      id: "time-event://019f3b00-0000-7000-8000-000000000003/1/2026-09-05T08%3A13%3A21.123456789012Z",
      coordinate: "2026-09-05T08:13:21.123456789012Z"
    });
    const first = await queryClotho(
      db,
      "time-event.resolve",
      {
        world_id: success.world_id,
        time_system_id: "019f3b00-0000-7000-8000-000000000003",
        definition_version: "1",
        coordinate: "2026-09-05T08:13:21.123456789012Z"
      },
      [success.world_id]
    );
    const second = await queryClotho(
      db,
      "time-event.resolve",
      {
        world_id: success.world_id,
        time_system_id: "019f3b00-0000-7000-8000-000000000003",
        definition_version: "1",
        coordinate: "2026-09-05T08:13:21.123456789012Z"
      },
      [success.world_id]
    );
    expect(first).toEqual(second);
    const eventRows = await sql<{ count: number }>`
      select count(*)::int as count
      from events
      where id::text like 'time-event://%'
    `.execute(db);
    expect(eventRows.rows[0]?.count).toBe(0);
    await expect(
      rollbackTemporalRelationMigration(db as unknown as Kysely<unknown>)
    ).rejects.toThrow(
      "Cannot roll back event relation time migration while virtual Time Event Relations exist"
    );
  });

  it.each([
    ["bad-cycle", "temporal_constraint_conflict"],
    ["bad-boundary", "composite_boundary_order_invalid"],
    ["bad-system", "time_system_capability_missing"],
    ["bad-coordinate", "invalid_time_coordinate"],
    ["bad-duplicate-start", "composite_boundary_not_unique"]
  ])("rejects %s before creating a revision", async (name, code) => {
    await commitCreateChangeSet(db, plan("bootstrap.change-plan.json"));
    await commitCreateChangeSet(db, plan("success.change-plan.json"));
    await expect(
      validateChangePlan(db, plan(`rejection/${name}.change-plan.json`))
    ).rejects.toMatchObject({ code, retryable: false });
    const revisions = await sql<{ count: number }>`
      select count(*)::int as count from world_revisions
    `.execute(db);
    expect(revisions.rows[0]?.count).toBe(2);
  });
});
