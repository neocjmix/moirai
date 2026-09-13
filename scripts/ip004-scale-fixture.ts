import { readFileSync } from "node:fs";
import type { ChangePlan } from "../packages/contracts/src/index.js";
import { resolveCreateOperations } from "../packages/domain/src/index.js";
import type { CanonicalRevisionView } from "../packages/projections/src/index.js";

/** Synthetic copies of the real R5 topology, never a production authoring plan.
 * World, Event and Relation identities are disjoint from the public-history World. */
export function ip004ScaleFixture(count: number): CanonicalRevisionView {
  if (![100, 1000, 10000].includes(count)) throw Error("unsupported_scale");
  const root = new URL("../docs/implementation/fixtures/", import.meta.url);
  const files = [
    "joseon-dogfood.change-plan.json",
    ...[
      "01-coarse",
      "02-time-detail",
      "03-motivation",
      "04-canon-interpretation"
    ].map((name) => `ip004-semantic/${name}.change-plan.json`)
  ];
  const operations = files.flatMap((name) => {
    const plan = JSON.parse(
      readFileSync(new URL(name, root), "utf8")
    ) as ChangePlan;
    return resolveCreateOperations(
      { ...plan, actor: "019f60ac-0000-7000-8000-000000000099" },
      () => {
        throw Error("explicit_fixture_ids_required");
      }
    ).operations;
  });
  const rows = (
    type: string
  ): Array<Record<string, unknown> & { id: string }> =>
    operations.flatMap((o) =>
      o.kind === "create" && o.entity_type === type
        ? [{ id: o.entity_id, ...o.value }]
        : []
    );
  const membership = (type: string, entity: string, id: string) =>
    operations.flatMap((o) =>
      o.kind === "add" &&
      o.entity_type === type &&
      (o.value as unknown as Record<string, unknown>)[entity] === id
        ? [String(o.value.canon_id)]
        : []
    );
  const baseEvents = rows("event").map((e) => ({
    ...e,
    canon_memberships: membership(
      "event_canon_membership",
      "event_id",
      String(e.id)
    )
  }));
  const baseRelations = rows("relation").map((r) => ({
    ...r,
    canon_memberships: membership(
      "relation_canon_membership",
      "relation_id",
      String(r.id)
    )
  }));
  const baseCanons = rows("canon"),
    baseSystems = rows("time_system"),
    baseNarratives = rows("narrative");
  const id = (serial: number) =>
    `019f60ac-${count.toString(16).padStart(4, "0")}-7000-8000-${String(serial).padStart(12, "0")}`;
  const globalIds = new Map<string, string>([
    [String(rows("world")[0]!.id), id(1)],
    ...baseCanons.map((c, i) => [String(c.id), id(100 + i)] as const),
    ...baseSystems.map((s, i) => [String(s.id), id(200 + i)] as const)
  ]);
  const rewrite = (value: unknown, ids: Map<string, string>): unknown => {
    if (typeof value === "string") return ids.get(value) ?? value;
    if (Array.isArray(value)) return value.map((v) => rewrite(v, ids));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, rewrite(v, ids)])
      );
    return value;
  };
  const events: unknown[] = [],
    relations: unknown[] = [],
    narratives: unknown[] = [];
  for (let group = 0; group * baseEvents.length < count; group++) {
    const ids = new Map(globalIds);
    const selected = baseEvents.slice(0, count - group * baseEvents.length);
    selected.forEach((e, i) =>
      ids.set(String(e.id), id(1000 + group * baseEvents.length + i))
    );
    for (const event of selected)
      events.push({
        ...(rewrite(event, ids) as object),
        title: `Synthetic ${group}: ${String((event as Record<string, unknown>).title)}`
      });
    baseRelations.forEach((relation, i) => {
      const row = relation as Record<string, unknown>;
      const endpoints = [row.source_ref, row.target_ref] as Array<{
        kind: string;
        event_id?: string;
      }>;
      if (
        endpoints.some((ref) => ref.kind === "event" && !ids.has(ref.event_id!))
      )
        return;
      relations.push({
        ...(rewrite(row, ids) as object),
        id: id(1000000 + group * baseRelations.length + i)
      });
    });
    baseNarratives.forEach((row, i) => {
      if (
        row.scope_type === "canon" ? group > 0 : !ids.has(String(row.scope_id))
      )
        return;
      narratives.push({
        ...(rewrite(row, ids) as object),
        id: id(2000000 + group * baseNarratives.length + i)
      });
    });
  }
  const result = {
    world: {
      id: id(1),
      slug: `ip004-scale-${count}`,
      title: `Synthetic IP-004 ${count} Event workload`,
      description:
        "Reproducible synthetic R5 topology; not a historical claim or production World."
    },
    canons: rewrite(baseCanons, globalIds),
    timeSystems: rewrite(baseSystems, globalIds),
    canonTimeSystems: rows("canon_time_system").map((row, i) => ({
      ...(rewrite(row, globalIds) as object),
      id: id(300 + i)
    })),
    events,
    relations,
    narratives
  } as unknown as CanonicalRevisionView;
  return {
    ...result,
    eventCanonMemberships: result.events.flatMap((e) =>
      e.canon_memberships.map((canon_id) => ({ event_id: e.id, canon_id }))
    ),
    relationCanonMemberships: result.relations.flatMap((r) =>
      r.canon_memberships.map((canon_id) => ({ relation_id: r.id, canon_id }))
    )
  };
}
