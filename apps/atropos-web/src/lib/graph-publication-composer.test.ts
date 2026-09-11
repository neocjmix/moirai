import { describe, expect, it } from "vitest";

import type {
  PublicCanon,
  PublicEvent,
  PublicRelationalTemporalProjection,
  PublicationManifest
} from "@moirai/contracts";

import {
  composeGraphPublicationQuery,
  graphQueryDigest,
  publicTimeSystemIdentity,
  type GraphPublicationCanonSnapshot
} from "./graph-publication-composer.js";
import {
  createDefaultGraphUrlState,
  MOCK_GRAPH_SOURCE_CATALOG
} from "./moirai-graph-source-query.js";

const WORLD = "world:reality-observatory";
const K1 = "canon:recorded-history";
const K2 = "canon:archival-observations";
const EVENT = "event:shared";
const RELATION = "relation:shared";

function snapshot(canonId: string): GraphPublicationCanonSnapshot {
  const canon: PublicCanon = {
    id: canonId,
    world_id: WORLD,
    slug: canonId,
    title: canonId,
    description: null
  };
  const event: PublicEvent = {
    id: EVENT,
    world_id: WORLD,
    canon_memberships: [K1, K2],
    slug: "shared",
    kind: "atomic",
    title: "Shared event",
    summary: null,
    roles: [],
    attributes: {}
  };
  const temporal: PublicRelationalTemporalProjection = {
    projection_type: "event_relational_time",
    solver_algorithm_version: "solver/1",
    world_id: WORLD,
    canon_id: canonId,
    source_revision: 7,
    algorithm_version: "temporal/1",
    time_systems: [],
    positions: [
      {
        event_id: EVENT,
        kind: "unresolved",
        reason: "No authored position",
        source_constraint_ids: [],
        algorithm_version: "solver/1",
        display_label: "unplaced",
        knowledge_span: null
      }
    ],
    composites: [],
    virtual_time_events: [],
    relations: [
      {
        id: RELATION,
        world_id: WORLD,
        canon_memberships: [K1, K2],
        type: "influences",
        source_ref: { kind: "event", event_id: EVENT },
        target_ref: { kind: "event", event_id: EVENT },
        direction: "directed",
        attributes: {}
      }
    ],
    evidence: [],
    semantic_digest: "temporal-digest"
  };
  const manifest: PublicationManifest = {
    world_id: WORLD,
    served_revision: 7,
    format_version: "3.0.0",
    generated_at: "2026-09-11T00:00:00.000Z",
    algorithms: {
      canonical: "canonical/1",
      search: "search/1",
      relational_time: "temporal/1"
    },
    locales: ["en"],
    documents: [
      {
        key: `worlds/${WORLD}/revisions/7/canons/${canonId}.json`,
        media_type: "application/json",
        sha256: `sha-${canonId}`
      }
    ],
    completeness: "complete"
  };
  return {
    worldId: WORLD,
    servedRevision: 7,
    canon,
    events: [event],
    narratives: [],
    timeSystems: [],
    temporal,
    graphScope: null,
    subjects: [],
    manifest
  };
}

describe("M4.5-E Publication query composition", () => {
  it("deduplicates shared World identities and separates matched from complete memberships", () => {
    const state = createDefaultGraphUrlState(MOCK_GRAPH_SOURCE_CATALOG);
    const result = composeGraphPublicationQuery(state.query, [
      snapshot(K1),
      snapshot(K2)
    ]);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.matched_canon_ids).toEqual([K2, K1].sort());
    expect(result.events[0]!.canon_memberships).toEqual([K2, K1].sort());
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]!.matched_canon_ids).toEqual([K2, K1].sort());
    expect(result.revision_vector).toEqual([
      { world_id: WORLD, served_revision: 7 },
      { world_id: "world:marvel-cinematic", served_revision: 42 }
    ]);
  });

  it("keeps deterministic digests and explains partial source failure without changing other revisions", () => {
    const state = createDefaultGraphUrlState(MOCK_GRAPH_SOURCE_CATALOG);
    const first = composeGraphPublicationQuery(
      state.query,
      [snapshot(K1)],
      [
        {
          worldId: "world:marvel-cinematic",
          servedRevision: 42,
          code: "source_timeout"
        }
      ]
    );
    const second = composeGraphPublicationQuery(
      state.query,
      [snapshot(K1)],
      [
        {
          worldId: "world:marvel-cinematic",
          servedRevision: 42,
          code: "source_timeout"
        }
      ]
    );

    expect(first.source_artifact_digests.query).toBe(
      second.source_artifact_digests.query
    );
    expect(first.completeness).toBe("partial");
    expect(first.diagnostics).toContainEqual(
      expect.objectContaining({ code: "source_timeout" })
    );
    expect(first.revision_vector[0]).toEqual({
      world_id: WORLD,
      served_revision: 7
    });
    expect(graphQueryDigest({ b: 2, a: 1 })).toBe(
      graphQueryDigest({ a: 1, b: 2 })
    );
  });

  it("does not infer adapter compatibility from Time System kind or title", () => {
    expect(
      publicTimeSystemIdentity({
        id: "time:one",
        world_id: WORLD,
        slug: "gregorian",
        title: "Gregorian",
        kind: "calendar",
        definition_version: "1",
        definition: {}
      })
    ).toMatchObject({
      adapter_identity: "time:one",
      comparison_domain: "time:one"
    });
  });
});
