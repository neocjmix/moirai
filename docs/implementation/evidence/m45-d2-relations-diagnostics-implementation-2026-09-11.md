# M4.5-D2 R1 Relations/Diagnostics implementation evidence

Date: 2026-09-11 UTC

## Decisions and rationale

- Relation results are keyed by the R1 World-level assertion ID. Canon selection derives
  `matchedCanonIds`; `canonMemberships` always preserves the complete assertion context.
- Family controls are presentation shortcuts only. Every accepted Relation type remains individually
  addressable in the query contract and belongs to exactly one UI family.
- Endpoint membership and Canon–Time System evidence are rendered independently from Relation labels.
  This prevents a renderer from silently treating a virtual-time endpoint as universally valid.
- `contradiction` is a knowledge-state diagnostic with `invalid: false`. Unplaced, unresolved, cycle,
  incompatibility, truncation and renderer loss remain explicit completeness diagnostics.
- Relation and diagnostic filters round-trip in the existing `moirai.graph-url-state.v1`; no second URL
  state or Canon authority semantics are introduced.

## Acceptance coverage

- combined K1/K2 scope returns shared `influences` once with matched/all memberships
- K1 selects the distinct `causes` identity and K2 selects the distinct `prevents` identity
- all 16 Relation types are covered exactly once by family controls and individually selectable
- every fixture Relation exposes endpoint and Time System evidence
- mobile WebKit scenario covers shared deduplication, family and individual filtering, and explanatory
  contradiction diagnostics

M4.5-E remains responsible for replacing the bounded synthetic catalog with immutable Publication
composition. M5 remains inactive.
