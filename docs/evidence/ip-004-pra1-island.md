# IP-004 PR-A1 — Reader Island checkpoint

[PR #81](https://github.com/neocjmix/moirai/pull/81), deployed main
`54929f73f0589b151e6c2c21e11cee819dbc2c40`. M5 remains inactive.

The Island now leads with the selected World title, description, named Canons,
event browsing and search. Time/source selection and operational observation
are secondary disclosures. Entity/Relation cards retain identity, membership
and provenance data in explicit record disclosures; they are not discarded.
Query transitions expose loading/partial coverage rather than treating a partial
query as complete knowledge.

## Verification

- PR CI [34742377560](https://github.com/neocjmix/moirai/actions/runs/34742377560):
  222 unit/contract/projection/security tests, 25 PostgreSQL integration tests,
  18 mobile WebKit flows, format/lint/typecheck/boundaries/build/audit/secret scan.
- Main CI [34742510101](https://github.com/neocjmix/moirai/actions/runs/34742510101)
  and post-deploy smoke [34742615294](https://github.com/neocjmix/moirai/actions/runs/34742615294): success.
- Railway Atropos `0d929e3c-f9a5-4f4a-abd1-e0fcc42eee2a`, Clotho
  `709d4dfd-1c62-4469-922a-c2a5cf2590c1`, worker
  `865f8cfb-cf9a-4133-91a8-fa090358e114`: all SUCCESS at that main SHA.
- Public `/__status` confirmed `54929f7`, contract 4, Publication 3.0.0 and
  healthy surfaces. The first status read still named the previous smoke run;
  the current-commit smoke success above was checked independently in Actions.
- Public browser: open Island → World title/description/Canon name and two reader
  actions; advanced source and observation disclosures initially closed; search
  **황산대첩** → one shared Event result with **조선 전기 연표**, not UUID labels;
  select result → `mq.focus.event_ref.event_id` = `019f5b00-0000-7000-8000-000000000100`.
- Baseline fixture is the public synthetic Joseon World, revision 1. No canonical
  writes, reset, new infrastructure, renderer/layout/spatial/gesture changes.

Local WebKit could be downloaded but the host disallowed required OS-library
installation. No permission workaround was used: mobile verification ran in the
existing GitHub workflow. Local lint/typecheck/222 unit tests/production web build
and gitleaks passed. Audit reports two existing moderate advisories, no high or
critical. The Next/React review preserved server/client boundaries and added a
transition status without transferring canonical responsibility into UI state.

## Remaining PR-A scope

This is the first Island vertical slice, not IP-004 completion. PR-A2 must fix
Event temporal/narrative hierarchy, keep Canon interpretations distinct, preserve
revision/viewport/search state through Event routes and verify empty/error/partial
reading paths. PR-B actual progressive authoring and PR-C scale acceptance remain
open. See the corrected [PR-0 baseline](ip-004-pr0-baseline-2026-09-13.md).
