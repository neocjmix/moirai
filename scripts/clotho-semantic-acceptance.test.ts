import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { ChangePlan, CreateChangeSet } from "@moirai/contracts";
import {
  resolveCreateOperations,
  validateCandidateChangeSet,
  type CanonicalState
} from "@moirai/domain";
import { buildPublicationArtifacts } from "@moirai/publication";
import type { CanonicalRevisionView } from "@moirai/projections";
import { MOIRAI_GRAPH_RELATION_TYPES } from "@moirai/contracts";
import {
  assertReadbackRevision,
  assertSameIdentitySet
} from "./public-readback.js";

const root = new URL("../docs/implementation/fixtures/", import.meta.url);
const read = (name: string): ChangePlan =>
  JSON.parse(readFileSync(new URL(name, root), "utf8")) as ChangePlan;
const actor = "019f60ab-0000-7000-8000-000000000099";

/** Additive fixture replay only; production authoring must use actual Clotho. */
function replay(plans: readonly ChangePlan[]): CanonicalRevisionView {
  const operations = plans.flatMap(
    (plan) =>
      resolveCreateOperations({ ...plan, actor }, () => {
        throw Error("acceptance plans require explicit identities");
      }).operations
  );
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
  return {
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
}

it("coarse natural-language input reuses the existing 1446 Event and Canon", () => {
  const base = read("joseon-dogfood.change-plan.json");
  const coarse = read("ip004-semantic/01-coarse.change-plan.json");
  const input: CreateChangeSet = { ...coarse, actor };
  const resolved = resolveCreateOperations(input, () => "").operations;
  expect(() =>
    validateCandidateChangeSet(
      input,
      resolved,
      replay([base]) as CanonicalState
    )
  ).not.toThrow();
  const view = replay([base, coarse]);
  expect(view.canons).toHaveLength(1);
  expect(view.events).toHaveLength(41);
  expect(
    view.events.filter((e) => e.id === "019f5b00-0000-7000-8000-000000000112")
  ).toHaveLength(1);
  expect(
    view.events.find((e) => e.id === "019f60ab-0000-7000-8000-000000000101")
  ).toMatchObject({
    kind: "composite",
    canon_memberships: ["019f5b00-0000-7000-8000-000000000002"]
  });
  expect(view.relations).toHaveLength(126);
  expect(
    view.relations.find((r) => r.id === "019f60ab-0000-7000-8000-000000000201")
  ).toMatchObject({
    type: "contains",
    target_ref: {
      kind: "event",
      event_id: "019f5b00-0000-7000-8000-000000000112"
    }
  });
  const artifacts = buildPublicationArtifacts(view, 2, "2026-09-13T00:00:00Z");
  const event = artifacts.documents.find((d) =>
    d.key.endsWith("events/019f60ab-0000-7000-8000-000000000101.json")
  );
  expect(event).toBeDefined();
  expect(JSON.stringify(event)).toContain("훈민정음 창제와 해설서 완성");
});

// Explicit opt-in: CI's default unit run never contacts or writes production.
const publicUrl = process.env.IP004_PUBLIC_READBACK_URL;
it.skipIf(!publicUrl)(
  "reads the authored semantics from actual public Publication and graph query",
  async () => {
    const revision = Number(process.env.IP004_PUBLIC_READBACK_REVISION ?? 2);
    const files = ["01-coarse.change-plan.json"];
    expect(revision).toBe(2);
    const plans = [
      read("joseon-dogfood.change-plan.json"),
      ...files.map((f) => read(`ip004-semantic/${f}`))
    ];
    const view = replay(plans);
    const worldId = view.world.id;
    const prefix = `/worlds/${worldId}/revisions/${revision}`;
    async function json(path: string, body?: unknown) {
      const started = performance.now();
      const response = await fetch(new URL(path, publicUrl), {
        method: body ? "POST" : "GET",
        headers: {
          accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(45_000)
      }).catch((cause: unknown) => {
        throw new Error(
          `public read ${path} failed after ${Math.round(performance.now() - started)}ms`,
          { cause }
        );
      });
      expect(response.status, path).toBe(200);
      const text = await response.text();
      console.info(
        JSON.stringify({
          path,
          revision,
          elapsed_ms: Math.round(performance.now() - started),
          bytes: Buffer.byteLength(text)
        })
      );
      return JSON.parse(text) as Record<string, unknown>;
    }
    const world = await json(`${prefix}/world.json`);
    expect(world).toMatchObject({
      world: view.world,
      served_revision: revision
    });
    const frame = {
      time_system_id: "019f5b00-0000-7000-8000-000000000003",
      definition_version: "1",
      adapter_identity: "yyyy-iso-fields-fraction12-z-v1",
      comparison_domain: "yyyy-iso-fields-fraction12-z-v1"
    };
    for (const canon of view.canons) {
      const [document, temporal, graph] = await Promise.all([
        json(`${prefix}/canons/${canon.id}.json`),
        json(`${prefix}/graph/canons/${canon.id}/temporal.json`),
        json("/graph/query", {
          contract_version: 1,
          temporal_frame: { target: frame },
          sources: [
            {
              world_id: worldId,
              served_revision: revision,
              canon_ids: [canon.id],
              time_systems: [frame]
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
            types: MOIRAI_GRAPH_RELATION_TYPES,
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
        })
      ]);
      const events = view.events.filter((e) =>
        e.canon_memberships.includes(canon.id)
      );
      const relations = view.relations.filter((r) =>
        r.canon_memberships.includes(canon.id)
      );
      expect(document).toMatchObject({ canon, served_revision: revision });
      const publicEvents = document.events as typeof events;
      assertSameIdentitySet("Events", publicEvents, events);
      for (const expected of events)
        expect(publicEvents.find((e) => e.id === expected.id)).toMatchObject(
          expected
        );
      assertReadbackRevision(
        worldId,
        revision,
        temporal as { world_id: string; served_revision: number }
      );
      expect(temporal).toMatchObject({
        canon_id: canon.id,
        source_revision: revision
      });
      const publicRelations = temporal.relations as typeof relations;
      assertSameIdentitySet("Relations", publicRelations, relations);
      for (const expected of relations)
        expect(publicRelations.find((r) => r.id === expected.id)).toMatchObject(
          expected
        );
      const result = graph.result as {
        events: typeof events;
        relations: typeof relations;
        completeness: string;
        revision_vector: unknown;
      };
      expect(result.completeness).toBe("complete");
      expect(result.revision_vector).toMatchObject([
        { world_id: worldId, served_revision: revision }
      ]);
      assertSameIdentitySet("Graph Events", result.events, events);
      assertSameIdentitySet("Graph Relations", result.relations, relations);
    }
    const scopeIds = [
      ...new Set(
        plans
          .slice(1)
          .flatMap((p) =>
            p.operations.flatMap((o) =>
              o.kind === "create" &&
              o.entity_type === "narrative" &&
              o.value.scope_type === "event"
                ? [o.value.scope_id as string]
                : []
            )
          )
      )
    ];
    for (const eventId of [
      ...scopeIds,
      "019f5b00-0000-7000-8000-000000000112"
    ]) {
      const document = await json(`${prefix}/events/${eventId}.json`);
      expect(document).toMatchObject({
        event: view.events.find((e) => e.id === eventId),
        served_revision: revision
      });
      const narratives = view.narratives.filter(
        (n) => n.scope_type === "event" && n.scope_id === eventId
      );
      const actual = document.narratives as typeof narratives;
      assertSameIdentitySet("Narratives", actual, narratives);
      for (const expected of narratives)
        expect(actual.find((n) => n.id === expected.id)).toMatchObject(
          expected
        );
    }
  },
  180_000
);
