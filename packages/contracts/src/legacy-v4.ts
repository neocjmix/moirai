/** Frozen read-only v4 record shapes. Never accepted as a live write contract. */
import type {
  PublicWorld,
  PublicTimeSystem,
  RelationType,
  CanonicalEventReference,
  PublicReference
} from "./index.js";
export interface PublicCanon {
  readonly id: string;
  readonly world_id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
}

export interface PublicCanonTimeSystem {
  readonly id: string;
  readonly canon_id: string;
  readonly time_system_id: string;
}

export interface PublicEvent {
  readonly id: string;
  readonly world_id: string;
  readonly canon_memberships: readonly string[];
  readonly slug: string | null;
  readonly kind: "atomic" | "composite";
  readonly title: string;
  readonly summary: string | null;
  readonly roles: readonly string[];
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface PublicRelation {
  readonly id: string;
  readonly world_id: string;
  readonly canon_memberships: readonly string[];
  readonly type: RelationType;
  readonly source_ref: CanonicalEventReference;
  readonly target_ref: CanonicalEventReference;
  readonly direction: "directed" | "undirected";
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface PublicNarrative {
  readonly id: string;
  readonly canon_id: string;
  readonly scope_type: "canon" | "event";
  readonly scope_id: string;
  readonly locale: string;
  readonly kind: "primary" | "summary" | "annotation";
  readonly title: string | null;
  readonly body: string;
  readonly public_references: readonly PublicReference[];
}

export interface LegacyV4RevisionView {
  readonly world: PublicWorld;
  readonly canons: PublicCanon[];
  readonly timeSystems: PublicTimeSystem[];
  readonly canonTimeSystems: PublicCanonTimeSystem[];
  readonly events: PublicEvent[];
  readonly relations: PublicRelation[];
  readonly narratives: PublicNarrative[];
  readonly eventCanonMemberships: { event_id: string; canon_id: string }[];
  readonly relationCanonMemberships: {
    relation_id: string;
    canon_id: string;
  }[];
  readonly generatedAt: string;
}
