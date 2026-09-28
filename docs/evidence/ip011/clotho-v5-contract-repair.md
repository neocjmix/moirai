# Clotho v5 transport/catalogue repair — 2026-09-28

## Diagnosis and scope

The connected Moirai Live catalogue still exposed 12 v4 tools (Canon fields,
wrapped ChangePlan, contract versions 2/3/4, no policy lookup). Actual production
`/mcp` discovery exposed only policy/commit/Event search/detail. Authenticated
`world_list` and `world_get` calls returned `unknown_tool`.

This repair follows TS-004 and CON-003. It does not activate A6/M5, change the
ontology, migrate canonical content, or change A5 UI/corpus. Work is isolated on
`fix/clotho-v5-contract-parity`; incorporate concurrent main before merge.

## Implementation

- One strict v5 method/schema catalogue drives HTTP, MCP and CLI schema inspection.
- Restore World/Collection discovery, one-hop Relation neighbors, induced context
  pages, virtual Time Event resolution and bounded complete content export.
- World.get returns current/target/served revision and paged Time System definitions.
- Context cursors bind the query, authorization World set and current revision.
  Old revisions fail explicitly with refresh recovery; this does not add historical
  interactive querying. World.list is a catalogue with per-World revisions.
- Context.slice is an induced page, not a complete neighborhood. It declares its
  boundary, relation truncation and the methods for adjacent facts/Narrative.
- Export rejects oversized Worlds before materializing content using row/byte
  guards, and checks the encoded response budget. This is content export, not
  owner-full operational backup or a replacement for the v5 ZIP64 pipeline.
- Validation shares the entire commit transaction and deferred constraints, then
  rolls back. It requires write authority. Canonical rows, revision, Change Set,
  history and outbox do not persist; PostgreSQL sequence gaps are possible.
- Preserve MCP error path/IDs/retryable/recovery and CLI policy recovery.
- Preserve v5-readonly commit blocking on the common dispatcher.
- Update repository Clotho guide to v5 and explicit schema inspection.

## Verification status

Local strict TypeScript, architecture boundary and focused HTTP/MCP tests pass.
Full unit run initially passed 420 tests with one old four-tool assertion failing;
updated the assertion to the new thirteen-tool catalogue and focused rerun passed.
PostgreSQL integration adds authorization/cursor checks and validate rollback →
commit → exact replay checks. Local PostgreSQL is unavailable; CI must execute it.
Final CI, merge, deployment and connected catalogue evidence follow below.

## Operational limits

These methods restore the authoring surface, not a new performance sign-off.
Large candidate validation still shares the existing whole-World commit cost.
Bounded response sizes do not prove bounded database scan cost for every query.
The plugin's cached catalogue must be refreshed after deployment; server discovery
alone does not establish a successful connected plugin call.
