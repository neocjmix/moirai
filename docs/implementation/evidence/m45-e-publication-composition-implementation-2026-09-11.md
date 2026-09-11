# M4.5-E Publication composition implementation evidence

Date: 2026-09-11

Status: implementation complete; PR, main CI and production evidence pending.

## Decisions

- Atropos composes `MoiraiGraphQueryResult` on the server from immutable public
  Publication documents. It does not issue cross-World database queries.
- A result keeps one Revision entry per World. A source timeout or unavailable
  Canon produces a bounded diagnostic and `partial` completeness without
  changing successful World revisions.
- Event and Relation identity is keyed by `world_id + id`; selected Canon
  context is unioned into `matched_canon_ids`, while complete published
  membership remains in `canon_memberships`.
- Time System compatibility uses explicit `graph_adapter_identity` and
  `comparison_domain`, or the existing lossless `coordinate_codec` when both
  graph fields are absent. If none exist, both values fail closed to the Time
  System ID; title, slug and kind never imply compatibility.
- Publication format 3 does not expose a complete State value artifact. The
  composer returns no invented State and emits
  `state_projection_unavailable` with partial completeness when State is
  requested.
- Fan-out is bounded to 8 Worlds and 32 Canons; each public artifact read has a
  3-second timeout. Query entity, Relation and evidence budgets are enforced
  deterministically with a next-scope hint.
- The deterministic query digest covers the normalized query, World Revision
  vector, algorithm versions and immutable artifact digests.

## Local verification

- Static typecheck: passed.
- Composition and D1/D2 URL/search tests: 17 passed.
- Local immutable Publication fixture: 1 World, 1 Canon snapshot, Revision 2,
  11 Events and 23 Relations composed; State remained explicitly partial.

No canonical rows, World revisions, Publication objects or production state
were mutated by these checks.
