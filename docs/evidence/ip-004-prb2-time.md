# IP-004 PR-B2 — first progressive refinement, Revision 3

Status: actual authoring and semantic public readback passed; temporal-summary
presentation fix is deployed and verified in both detail surfaces. IP-004 is not
complete. M5 remains inactive.

## Actual Clotho and Publication evidence

Public-history fixture: `implementation/fixtures/ip004-semantic/02-time-detail.change-plan.json`.
Natural-language intent adds the lunar twelfth-month creation record to the same
Hunminjeongeum process without replacing the existing 1446 record or inventing an
exact Gregorian date. This is an agent-authored acceptance, not a user transcript.

- World: `01995c2a-7b00-7000-8000-000000000101`; existing Canon retained.
- Change Set: `019f60ab-0000-7000-8000-000000000002`, expected revision 2.
- Actual connected `change.validate`: valid, no errors/warnings; digest
  `6066e2ddced961004164469d7cf21df6f4d06aa4fdc797d558a4a36cd7251158`.
- Actual connected commit: revision 3, non-idempotent first application;
  subsequent World read confirmed current/target/served revision 3, ready.
- 42 Events (33 atomic, 9 composite), 132 Relations, one Canon. Search returns
  exactly the existing book record, reused process, and distinct creation Event.
- Creation is bounded by 1443-01-01 inclusive and 1445-01-01 exclusive; process
  start/end refer to creation/existing book. Exact duration stays unresolved.

Live read-only semantic test passed with exact Event/Relation identity sets,
memberships, fields and Narrative/source readback across World/Canon/temporal
artifacts, `/graph/query` and all three affected Event documents. Observed path
elapsed times: World 13,729ms; Canon 14,030ms; temporal 14,375ms; graph 15,123ms;
process 13,880ms; creation 13,818ms; book 13,573ms. Payloads respectively:
849, 22,835, 136,114, 443,108, 5,797, 5,760, 6,533 bytes. These single client-path
samples include network/proxy overhead and are not server p95 or scale acceptance.

## Public reader verification and defect

At runtime `2d443c835a2919edb7ee64cf9f741485a84d8b63`, the browser verified:

1. Island search for 훈민정음 returns exactly the three named Events.
2. Selecting the process opens Graph Event drawer with the existing process
   Narrative and public National Institute of Korean Language source.
3. Its stable Event reading page is pinned to revision 3 and shows both component
   Events, the Sejong parent, and named start/end links.
4. Following the start link shows the distinct creation Event, lunar precision
   caveat, source, later book and reused parent-process navigation.

Defect: the drawer says 시간 정보 미정 and the reading page says the process is not
one resolved instant despite known boundary Events. The fix shares a pure
presentation helper: named start/end Events plus an explicit unresolved-duration
caveat. It does not infer duration from a knowledge interval or change canonical
semantics, renderer, layout, geometry, or graph interactions.

The regression test first failed with 시간 정보 미정 on the real Revision 3 fixture,
then passed with the named boundary summary. Local full suite: 236 passed, one
explicit live-network test skipped; root typecheck and changed-file lint passed.
Full CI/mobile and deployed-fix verification are recorded below.

## Deployed fix — PR #85

[PR #85](https://github.com/neocjmix/moirai/pull/85) merged as
`1eff8c85619f0647a8069e2f7462bfe831b8fbaf` after all checks passed in
[CI 34765374560](https://github.com/neocjmix/moirai/actions/runs/34765374560),
including PostgreSQL migration/integration and mobile WebKit. Main
[CI 34765522605](https://github.com/neocjmix/moirai/actions/runs/34765522605)
also passed. Railway Atropos `a23d24f4-8f6b-483d-8991-9d608d366afb`, Clotho
`0f869918-3e14-44aa-8158-70df85b3ef2d`, worker
`10094305-8159-4700-b978-521e503538ff` are SUCCESS at that SHA.
Public `/health` and `/status-public` returned 200 and the same SHA.
Public browser verified the named start/end summary plus unresolved-duration
caveat in the process Event reading page, then returned to the restored Graph
Event drawer and verified the same summary and source-linked Narrative there.
No new canonical Revision was needed for this presentation fix.
Post-deploy [smoke 34765649245](https://github.com/neocjmix/moirai/actions/runs/34765649245)
passed at the same application SHA.

The Revision 3 live test was rerun successfully before the next write: World
10,979ms, Canon 10,975ms, temporal 11,281ms, graph 12,622ms, process 10,870ms,
creation 11,435ms, book 13,502ms; payload sizes unchanged. No assertion or timeout
was weakened.

Baseline main CI [34756276098](https://github.com/neocjmix/moirai/actions/runs/34756276098)
and [smoke 34756389106](https://github.com/neocjmix/moirai/actions/runs/34756389106)
passed; all three Railway services were SUCCESS on `2d443c8` at resume.
Additional refinements, ambiguity/N:M, conflict/session independence and measured
scale remain open; this checkpoint does not close PR-B or the product gate.
