/** World-wide v5 temporal projection. The synthetic v4 scope below is only
 * an adapter to reuse the proven solver; it is never a Collection or a
 * canonical/public entity. Atropos must not consume this until v5 format,
 * spatial shards and publication are complete. */
import { createHash } from "node:crypto";
import type { CanonicalState } from "@moirai/contracts/v5";
import {
  assertV5CanonicalState,
  compositeChildCounts
} from "@moirai/domain/v5";
import { stableStringify } from "@moirai/domain";
import type { CanonicalRevisionView } from "./index.js";
import { projectRelationalTime } from "./relational-time.js";

export const WORLD_TEMPORAL_ALGORITHM_VERSION = "world-relational-projection/1";

export function projectV5WorldTemporal(
  state: CanonicalState,
  revision: number
) {
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw Error("world_temporal_revision_invalid");
  assertV5CanonicalState(state);
  const scope = state.world.id;
  const compositeIds = new Set(compositeChildCounts(state.relations).keys());
  const view: CanonicalRevisionView = {
    world: state.world,
    canons: [
      {
        id: scope,
        world_id: scope,
        slug: "internal-world-temporal-scope",
        title: "Internal World scope",
        description: null
      }
    ],
    timeSystems: state.timeSystems,
    canonTimeSystems: state.timeSystems.map((system) => ({
      id: system.id,
      canon_id: scope,
      time_system_id: system.id
    })),
    eventCanonMemberships: state.events.map((event) => ({
      event_id: event.id,
      canon_id: scope
    })),
    relationCanonMemberships: state.relations.map((relation) => ({
      relation_id: relation.id,
      canon_id: scope
    })),
    events: state.events.map((event) => ({
      ...event,
      kind: compositeIds.has(event.id)
        ? ("composite" as const)
        : ("atomic" as const),
      canon_memberships: [scope]
    })),
    relations: state.relations.map((relation) => ({
      ...relation,
      canon_memberships: [scope]
    })),
    narratives: []
  };
  const computed = projectRelationalTime(view, revision, scope);
  const worldRelations = computed.relations.map((relation) => ({
    id: relation.id,
    world_id: relation.world_id,
    type: relation.type,
    direction: relation.direction,
    attributes: relation.attributes,
    source_ref: relation.source_ref,
    target_ref: relation.target_ref
  }));
  const semantic = {
    projection_type: "world_relational_time" as const,
    algorithm_version: WORLD_TEMPORAL_ALGORITHM_VERSION,
    solver_algorithm_version: computed.solver_algorithm_version,
    time_systems: computed.time_systems,
    positions: computed.positions,
    composites: computed.composites,
    virtual_time_events: computed.virtual_time_events,
    evidence: computed.evidence,
    relations: worldRelations
  };
  return {
    ...semantic,
    world_id: state.world.id,
    source_revision: revision,
    semantic_digest: createHash("sha256")
      .update(stableStringify(semantic))
      .digest("hex")
  };
}
