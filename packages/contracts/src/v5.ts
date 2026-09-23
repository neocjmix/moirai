/** IP-011 target records. Live ingress stays v4 until the coordinated cutover. */
import type {
  CanonicalEventReference,
  PublicReference,
  PublicTimeSystem,
  PublicWorld,
  RelationType
} from "./index.js";
export interface Collection {
  readonly id: string;
  readonly world_id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
}
export interface Event {
  readonly id: string;
  readonly world_id: string;
  readonly slug: string | null;
  readonly title: string;
  readonly summary: string | null;
  readonly roles: readonly string[];
  readonly attributes: Readonly<Record<string, unknown>>;
}
export interface Relation {
  readonly id: string;
  readonly world_id: string;
  readonly type: RelationType;
  readonly source_ref: CanonicalEventReference;
  readonly target_ref: CanonicalEventReference;
  readonly direction: "directed" | "undirected";
  readonly attributes: Readonly<Record<string, unknown>>;
}
export interface NarrativeNote {
  readonly title: string | null;
  readonly body: string;
  readonly public_references: readonly PublicReference[];
}
export interface Narrative {
  readonly id: string;
  readonly world_id: string;
  readonly scope_type: "event" | "collection";
  readonly scope_id: string;
  readonly locale: string;
  readonly title: string | null;
  readonly body: string;
  readonly public_references: readonly PublicReference[];
  readonly notes: readonly NarrativeNote[];
}
export interface CollectionTimeSystem {
  readonly id: string;
  readonly collection_id: string;
  readonly time_system_id: string;
}
export interface EventCollectionMembership {
  readonly event_id: string;
  readonly collection_id: string;
}
/** Final active state, after all atomic Change Set operations. */
export interface CanonicalState {
  readonly world: PublicWorld;
  readonly collections: readonly Collection[];
  readonly timeSystems: readonly PublicTimeSystem[];
  readonly collectionTimeSystems: readonly CollectionTimeSystem[];
  readonly events: readonly Event[];
  readonly eventCollectionMemberships: readonly EventCollectionMembership[];
  readonly relations: readonly Relation[];
  readonly narratives: readonly Narrative[];
}

/** Resolved internal operations. External client_ref resolution belongs at ingress. */
export interface EntityRecords {
  readonly world: PublicWorld;
  readonly collection: Collection;
  readonly time_system: PublicTimeSystem;
  readonly collection_time_system: CollectionTimeSystem;
  readonly event: Event;
  readonly relation: Relation;
  readonly narrative: Narrative;
}
type CreateEntityOperation = {
  [K in keyof EntityRecords]: {
    readonly kind: "create";
    readonly entity_type: K;
    readonly entity_id: string;
    readonly value: Omit<EntityRecords[K], "id">;
  };
}[keyof EntityRecords];
type MutableEntity = "world" | "collection" | "event" | "narrative";
type UpdateEntityOperation = {
  [K in MutableEntity]: {
    readonly kind: "update";
    readonly entity_type: K;
    readonly entity_id: string;
    readonly value: Omit<EntityRecords[K], "id">;
  };
}[MutableEntity];
export type ResolvedOperation =
  | CreateEntityOperation
  | UpdateEntityOperation
  | {
      readonly kind: "withdraw";
      readonly entity_type: "collection" | "event" | "relation" | "narrative";
      readonly entity_id: string;
    }
  | {
      readonly kind: "add" | "remove";
      readonly entity_type: "event_collection_membership";
      readonly value: EventCollectionMembership;
    };

export { V5_AUTHORING_POLICY } from "./authoring-policy-v5.js";
