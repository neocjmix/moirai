import type { PublicEvent, PublicRelation } from "@moirai/contracts";

export type LegacyPublicEvent = Omit<
  PublicEvent,
  "world_id" | "canon_memberships"
> & {
  readonly canon_id: string;
};

export function normalizePublicEvent(
  event: PublicEvent | LegacyPublicEvent,
  worldId: string
): PublicEvent {
  if ("world_id" in event && "canon_memberships" in event) return event;
  const { canon_id: canonId, ...value } = event;
  return { ...value, world_id: worldId, canon_memberships: [canonId] };
}

export type LegacyPublicRelation = Omit<
  PublicRelation,
  "world_id" | "canon_memberships"
> & { readonly canon_id: string };

export function normalizePublicRelation(
  relation: PublicRelation | LegacyPublicRelation,
  worldId: string
): PublicRelation {
  if ("world_id" in relation && "canon_memberships" in relation)
    return relation;
  const { canon_id: canonId, ...value } = relation;
  return { ...value, world_id: worldId, canon_memberships: [canonId] };
}
