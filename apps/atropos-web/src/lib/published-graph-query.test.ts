import { describe, expect, it } from "vitest";

import {
  MOIRAI_GRAPH_CONTRACT_VERSION,
  MOIRAI_GRAPH_RELATION_TYPES,
  type MoiraiGraphQuery,
  type PublicEvent,
  type PublicRelation
} from "@moirai/contracts";

import {
  composePublishedGraphQuery,
  publishedGraphQueryDigest,
  type PublishedGraphQueryReader
} from "./published-graph-query.js";

const time = {
  time_system_id: "time:test",
  definition_version: "1",
  adapter_identity: "test-adapter",
  comparison_domain: "test-domain"
} as const;

function query(sources: MoiraiGraphQuery["sources"]): MoiraiGraphQuery {
  return {
    contract_version: MOIRAI_GRAPH_CONTRACT_VERSION,
    temporal_frame: { target: time },
    sources,
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
      max_entities: 100,
      max_relations: 100,
      max_evidence: 100
    }
  };
}

const sharedEvent: PublicEvent = {
  id: "event-shared",
  world_id: "world-a",
  canon_memberships: ["canon-a1", "canon-a2"],
  slug: "shared",
  kind: "atomic",
  title: "Shared Event",
  summary: null,
  roles: [],
  attributes: {}
};

const sharedRelation: PublicRelation = {
  id: "relation-shared",
  world_id: "world-a",
  canon_memberships: ["canon-a1", "canon-a2"],
  type: "influences",
  source_ref: { kind: "event", event_id: "event-shared" },
  target_ref: { kind: "event", event_id: "event-shared" },
  direction: "directed",
  attributes: {}
};

function reader(failWorld?: string): PublishedGraphQueryReader {
  return {
    async selectPublication(worldId) {
      if (worldId === failWorld) throw new Error("unavailable");
      return {
        pointer: {
          world_id: worldId,
          served_revision: worldId === "world-a" ? 7 : 42,
          current_revision: worldId === "world-a" ? 7 : 42,
          publication_target_revision: worldId === "world-a" ? 7 : 42,
          projection_status: "ready",
          format_version: "3.0.0",
          manifest_key: `worlds/${worldId}/manifest.json`,
          generated_at: "2026-09-11T00:00:00Z"
        },
        manifest: {
          world_id: worldId,
          served_revision: worldId === "world-a" ? 7 : 42,
          format_version: "3.0.0",
          generated_at: "2026-09-11T00:00:00Z",
          algorithms: { canonical: "1", search: "1", relational_time: "1" },
          locales: ["en"],
          documents: [
            {
              key: `worlds/${worldId}/world.json`,
              media_type: "application/json",
              sha256: `sha-${worldId}`
            }
          ],
          completeness: "complete"
        }
      };
    },
    async readCanon(worldId, canonId, selected) {
      const event =
        worldId === "world-a"
          ? sharedEvent
          : {
              ...sharedEvent,
              world_id: worldId,
              canon_memberships: ["canon-b"]
            };
      return {
        pointer: selected.pointer,
        canon: {
          id: canonId,
          world_id: worldId,
          slug: canonId,
          title: canonId,
          description: null
        },
        events: [event],
        narratives: [],
        timeSystems: [],
        subjectArtifacts: [],
        temporalArtifact: {
          key: `worlds/${worldId}/temporal.json`,
          algorithm_version: "temporal/1"
        },
        graphScopeArtifact: null
      };
    },
    async readWorldEvent(worldId) {
      return {
        event:
          worldId === "world-a"
            ? sharedEvent
            : {
                ...sharedEvent,
                world_id: worldId,
                canon_memberships: ["canon-b"]
              },
        narratives: [],
        relations: worldId === "world-a" ? [sharedRelation] : []
      };
    },
    async readGraphScope() {
      throw new Error("no graph scope fixture");
    },
    async readRelationalTime(worldId, canonId) {
      return {
        projection_type: "event_relational_time",
        solver_algorithm_version: "solver/1",
        world_id: worldId,
        canon_id: canonId,
        source_revision: worldId === "world-a" ? 7 : 42,
        algorithm_version: "temporal/1",
        time_systems: [],
        positions: [],
        composites: [],
        virtual_time_events: [],
        relations: [],
        evidence: [],
        semantic_digest: `temporal-${worldId}-${canonId}`
      };
    },
    async readSubject() {
      throw new Error("no subject fixture");
    }
  };
}

const sources: MoiraiGraphQuery["sources"] = [
  {
    world_id: "world-a",
    served_revision: 7,
    canon_ids: ["canon-a1", "canon-a2"],
    time_systems: [time]
  },
  {
    world_id: "world-b",
    served_revision: 42,
    canon_ids: ["canon-b"],
    time_systems: [time]
  }
];

describe("M4.5-E immutable Publication query composition", () => {
  it("deduplicates within a World while never merging the same ID across Worlds", async () => {
    const result = await composePublishedGraphQuery(query(sources), reader());
    expect(result.events).toHaveLength(2);
    expect(
      result.events.map((event) => `${event.world_id}:${event.id}`)
    ).toEqual(["world-a:event-shared", "world-b:event-shared"]);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]!.matched_canon_ids).toEqual([
      "canon-a1",
      "canon-a2"
    ]);
  });

  it("keeps successful World revisions fixed when another source fails", async () => {
    const result = await composePublishedGraphQuery(
      query(sources),
      reader("world-b")
    );
    expect(result.revision_vector).toEqual([
      { world_id: "world-a", served_revision: 7 }
    ]);
    expect(result.completeness).toBe("partial");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "publication_source_unavailable",
        source: { world_id: "world-b", served_revision: 42 }
      })
    );
  });

  it("produces a deterministic digest from query and immutable artifact digests", async () => {
    const first = await composePublishedGraphQuery(query(sources), reader());
    const second = await composePublishedGraphQuery(query(sources), reader());
    expect(publishedGraphQueryDigest(first)).toBe(
      publishedGraphQueryDigest(second)
    );
  });

  it("rejects resource exhaustion before reading Publication data", async () => {
    const oversized = query(sources);
    await expect(
      composePublishedGraphQuery(
        { ...oversized, budget: { ...oversized.budget, max_entities: 10_001 } },
        reader()
      )
    ).rejects.toThrow("exceeds public composition limits");
  });
});
