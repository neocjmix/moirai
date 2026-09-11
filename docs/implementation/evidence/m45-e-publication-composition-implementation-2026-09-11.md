# M4.5-E Publication query composition implementation evidence

Date: 2026-09-11 UTC

## Decisions and rationale

- `/graph/query` composes only immutable Publication documents at each requested World Revision. A
  current pointer mismatch fails that source instead of silently upgrading it.
- Results deduplicate by `(world_id, entity_id)`. Equal strings in different Worlds never imply identity
  or correspondence.
- Each source is composed independently. One unavailable World produces a scoped diagnostic and partial
  result without changing successful World revision entries.
- Event, Relation, Narrative, temporal, Subject, Composite/Process, State and graph-scope completeness
  artifacts are read under one selected Publication per World.
- Relation endpoints outside the selected public scope are omitted with an explicit diagnostic; hidden
  endpoint information is not delivered to the browser.
- Query source/Canon counts, response budgets and request body size have hard public limits. Oversized
  input fails before Publication reads.
- Semantic digest includes the normalized query, World revision vector, immutable artifact digests and
  composed semantic content. It excludes renderer geometry and execution order.

## Verification design

- same Event ID in two Canons becomes one World result; the same string in another World remains distinct
- shared Relation is returned once with matched/all Canon memberships
- partial source failure preserves the successful Revision vector
- repeated composition produces the same semantic digest
- resource exhaustion is rejected before storage reads
- production post-deploy smoke now POSTs the Revision 4 K1/K2 acceptance query and requires A/B and the
  shared R1 Relation exactly once

The endpoint is a public Publication projection boundary, not an unscoped canonical repository API.
M5 access/audience policy remains inactive.
