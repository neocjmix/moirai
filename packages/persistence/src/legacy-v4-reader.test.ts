import { describe, expect, it } from "vitest";
import type { MoiraiDatabase } from "./index.js";
import { readLegacyV4WorldAtRevision } from "./legacy-v4-reader.js";

type Operation = {
  entity_type: string;
  entity_id: string;
  operation_kind: string;
  after: Record<string, unknown> | null;
  revision: number;
  operation_index: number;
};

// Raw historical rows deliberately do not use the current writer's contract.
function historyDatabase(operations: Operation[]): MoiraiDatabase {
  return {
    selectFrom(table: string) {
      let revision = Infinity;
      const query = {
        select() {
          return query;
        },
        where(column: string, _operator: string, value: unknown) {
          if (column === "revision") revision = Number(value);
          return query;
        },
        orderBy() {
          return query;
        },
        async executeTakeFirst() {
          return table === "world_revisions"
            ? { committed_at: new Date("2026-09-22T00:00:00.000Z") }
            : undefined;
        },
        async execute() {
          return operations.filter((row) => row.revision <= revision);
        }
      };
      return query;
    }
  } as unknown as MoiraiDatabase;
}

describe("frozen v2–v4 history", () => {
  it("preserves old Canon-scoped Narratives, composite type and shared identity across revisions", async () => {
    const rows: Operation[] = [];
    const add = (
      revision: number,
      entity_type: string,
      entity_id: string,
      operation_kind: string,
      after: Record<string, unknown>
    ) =>
      rows.push({
        revision,
        entity_type,
        entity_id,
        operation_kind,
        after,
        operation_index: rows.length
      });
    add(1, "world", "w", "create", { id: "w", title: "Historical title" });
    add(1, "canon", "c1", "create", { id: "c1", world_id: "w" });
    add(1, "canon", "c2", "create", { id: "c2", world_id: "w" });
    add(1, "event", "e", "create", {
      id: "e",
      canon_id: "c1",
      kind: "composite",
      title: "Shared event"
    });
    add(1, "narrative", "n1", "create", {
      id: "n1",
      canon_id: "c1",
      scope_type: "event",
      scope_id: "e",
      kind: "primary",
      body: "First historical account"
    });
    add(2, "event_canon_membership", "m", "add", {
      event_id: "e",
      canon_id: "c2"
    });
    add(2, "narrative", "n2", "create", {
      id: "n2",
      canon_id: "c2",
      scope_type: "event",
      scope_id: "e",
      kind: "primary",
      body: "Second historical account"
    });
    add(3, "event_canon_membership", "m1", "remove", {
      event_id: "e",
      canon_id: "c1"
    });
    add(4, "event", "e", "withdraw", { id: "e" });
    const db = historyDatabase(rows);
    const first = await readLegacyV4WorldAtRevision(db, "w", 1);
    const shared = await readLegacyV4WorldAtRevision(db, "w", 2);
    const removed = await readLegacyV4WorldAtRevision(db, "w", 3);
    const withdrawn = await readLegacyV4WorldAtRevision(db, "w", 4);
    expect(first.events).toEqual([
      {
        id: "e",
        world_id: "w",
        kind: "composite",
        title: "Shared event",
        canon_memberships: ["c1"]
      }
    ]);
    expect(shared.events).toHaveLength(1);
    expect(shared.events[0]?.canon_memberships).toEqual(["c1", "c2"]);
    expect(shared.narratives.map((n) => [n.canon_id, n.body])).toEqual([
      ["c1", "First historical account"],
      ["c2", "Second historical account"]
    ]);
    expect(removed.events[0]?.canon_memberships).toEqual(["c2"]);
    expect(withdrawn.events).toEqual([]);
    expect(first.narratives).toHaveLength(1);
    expect(first.generatedAt).toBe("2026-09-22T00:00:00.000Z");
  });
});
