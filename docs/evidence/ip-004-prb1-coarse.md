# IP-004 PR-B1 — actual Clotho coarse creation

Runtime prerequisite [PR #83](https://github.com/neocjmix/moirai/pull/83), main
`a6e9ec60cb3ecca5f666882394148a248f7eb8ab`. PR CI
[34755492217](https://github.com/neocjmix/moirai/actions/runs/34755492217), main CI
[34755641612](https://github.com/neocjmix/moirai/actions/runs/34755641612), post-deploy smoke
[34755750688](https://github.com/neocjmix/moirai/actions/runs/34755750688): success.
Railway Atropos `5902543f-d7d7-4a45-9b67-0a4290bf8d4b`, Clotho
`ccb5338d-f097-495b-8730-0515ad6dbf18`, worker
`3e8091e4-45aa-41f4-9381-b83c302322e6`: all SUCCESS at this SHA;
public `/__status` confirmed it. No infrastructure or authority changes.

## Intent → context → interpretation → actual commit

The reproducible [scenario](../implementation/fixtures/ip004-semantic/README.md)
and [exact plan](../implementation/fixtures/ip004-semantic/01-coarse.change-plan.json)
record an **agent-authored natural-language acceptance input**, not additional
user testimony: organize Hunminjeongeum creation and explanatory-book completion
as a process, reusing the existing chronicle's record.

Actual connected Clotho calls read World/Canon, search both **훈민정음** and
**창제**, and expand the existing Event's bounded containment neighborhood.
The existing 1446 Event and its **세종 치세** Relation remain unchanged. One
new Composite and two `contains` Relations establish the coarse abstraction;
one Narrative belongs to that Event in the existing Canon. No parallel World,
new Canon, destructive Event rewrite, exact date or ceremony was invented.

On 2026-09-13, numeric contract 4 `change.validate` returned valid, no errors or
warnings, digest `8c2481c4d569444555d8025d8aa3fdbdc60f3597aac4ab654efa0d67e22ce69d`.
Actual `change.commit`, Change Set `019f60ab-0000-7000-8000-000000000001`, returned
current/target revision 2, served revision 1, idempotent replay false, no warnings.
A later `world.get` reported current/target/served **2**, projection **ready**.
Canonical context at revision 2 showed the new process, existing record, existing
parent, all three containment edges (including the pre-existing edge), and both
old/new Narratives. This was not a direct database fixture import.

## Public semantic readback

The explicit live test in `scripts/clotho-semantic-acceptance.test.ts` first failed
with 404 for revision 2 before the commit. After Publication, one run encountered
a network timeout; the rerun passed **without relaxing semantic assertions or
timeouts**. It compared all 41 Events and 126 Relations, identity sets and complete
authored fields/memberships, both affected Event documents and their Narrative
bodies/sources, and the same-revision public `/graph/query` result.

Observed end-to-end read timings from this agent's network path (not server p95):

| Revision 2 read | Elapsed ms | JSON bytes |
| --- | ---: | ---: |
| World artifact | 14,816 | 849 |
| Canon artifact | 11,293 | 22,084 |
| Temporal artifact | 11,430 | 131,018 |
| Graph query | 15,283 | 414,534 |
| New process Event artifact | 11,889 | 3,930 |
| Reused 1446 Event artifact | 11,842 | 5,038 |

Public browser Island search **훈민정음** showed exactly the reused atomic Event
and the new named process. Selecting the process opened its new Narrative and
source in Graph detail; its time is honestly **시간 정보 미정** at this coarse
stage. The stable Event link pins revision 2. No raw attributes are required to
understand the process. Browser interaction timing is not a substitute for PR-C
server/query/resource measurement.

Local default checks: 235 unit tests pass, one explicit live-network acceptance
skipped by default; live invocation passes both tests. Type/lint/format and secret
scan pass. Three progressive refinement stages, ambiguity/conflict and a fresh
LLM-session acceptance remain PR-B2/B3 work. IP-004 is not complete; M5 inactive.
