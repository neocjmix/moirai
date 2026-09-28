# Clotho v5 transport/catalogue repair — 2026-09-28

## Diagnosis and scope

The connected Moirai Live catalogue still exposed 12 v4 tools (Canon fields,
wrapped ChangePlan, contract versions 2/3/4, no policy lookup). Actual production
`/mcp` discovery exposed only policy/commit/Event search/detail. Authenticated
`world_list` and `world_get` calls returned `unknown_tool`.

This repair follows TS-004 and CON-003. It does not activate A6/M5, change the
ontology, migrate canonical content, or change A5 UI/corpus. Work is isolated on
`fix/clotho-v5-contract-parity`. Concurrent A5 changes through PR #244 were
preserved when PR #242 merged as `90a000e502e245a631e465cfa18aad6a4beeffca`.

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

- [PR #242](https://github.com/neocjmix/moirai/pull/242) merged without conflicts.
  The implementation did not change A5 UI, corpus or its live test assertions.
- [Final PR CI](https://github.com/neocjmix/moirai/actions/runs/36374189825)
  passed on `2f3025cd315ab7b0219d8a2e4e96fde8ed0fc1dc`: 426 unit tests
  passed (2 skipped), 45 PostgreSQL integration tests passed, mobile regression,
  strict typecheck, boundaries, production build and security gates passed.
  Earlier failures identified a Fastify test payload type, missing World time
  systems and cross-test fixture pollution; all were fixed before merge.
- [Merged main CI](https://github.com/neocjmix/moirai/actions/runs/36374619650)
  passed on `90a000e502e245a631e465cfa18aad6a4beeffca`.
- Railway API, worker and web deployments all succeeded on that exact SHA.
  API `/health/ready` returned that SHA with `status: ok`.
- Production MCP discovery returned all 13 methods, each with
  `contract_version: { const: 5 }`.
- Refreshed the existing Moirai Live app catalogue using **Refresh tools**;
  retained its OAuth connection. The app detail UI now displays **Write 1 / Read
  12**, including `authoring_policy_get`, `collection_list`, `collection_get`
  and rollback-only `change_validate`. App description now states the v5
  World/Collection and policy-first authoring model.
- Actual authenticated connected `world_list` and `world_get` both succeeded
  after previously returning `unknown_tool`. World current/target/served were
  all **56**; World.get returned the Gregorian Time System definition.
- This conversation's originally loaded tool declaration text still describes
  the old schema. The refreshed app UI catalogue and successful runtime calls
  are separate evidence; a newly loaded conversation is needed to acquire the
  new declaration set, including the newly added policy tool.

## Post-deployment smoke

The deployed repair's [smoke run](https://github.com/neocjmix/moirai/actions/runs/36374810648)
passed public readiness but failed in the live mobile step, so its subsequent
authenticated Clotho check was skipped. The prior A5 deployment's
[smoke run](https://github.com/neocjmix/moirai/actions/runs/36374450335)
failed at `tests/live/ip011-a3.spec.ts:126`: the viewport continuation remained
non-null after 32 pages. It occurred before this repair was deployed and skipped
its later authenticated Clotho step. Do not report that live mobile gate as passed.

The follow-up workflow change runs the Clotho build whenever readiness succeeded
and the run was not cancelled, then runs authentication smoke only when that
build succeeded. Mobile failures still fail the overall job; they no longer hide
Clotho results. No assertions or authorization checks were relaxed.

## Operational limits

These methods restore the authoring surface, not a new performance sign-off.
Large candidate validation still shares the existing whole-World commit cost.
Bounded response sizes do not prove bounded database scan cost for every query.
The plugin's cached catalogue must be refreshed after deployment; server discovery
alone does not establish a successful connected plugin call.
