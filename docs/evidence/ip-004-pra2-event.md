# IP-004 PR-A2 — Event reading and navigation

[PR #82](https://github.com/neocjmix/moirai/pull/82), deployed main
`9456f1329f7c12b1656f9de7a431d440e81bcdb5`. M5 remains inactive.

Event reading now leads with title, summary, Canon-specific time and Narrative,
named memberships, related Events and public sources. Raw attributes and complete
calculation/Publication evidence remain available in collapsed disclosures.
Graph detail exposes readable time and sources, a revision-pinned stable Event
link and deterministic loading/error/retry. Cause/result labels are restricted
to actual directed `causes` Relations, not every related Event.

## Verification

- PR CI [34754809778](https://github.com/neocjmix/moirai/actions/runs/34754809778):
  all checks passed, including 231 unit tests, 25 PostgreSQL integration tests,
  21 mobile WebKit flows, format/lint/typecheck/boundaries/build/audit/secret scan.
- Main CI [34755190514](https://github.com/neocjmix/moirai/actions/runs/34755190514)
  and post-deploy smoke [34755301166](https://github.com/neocjmix/moirai/actions/runs/34755301166): success.
- Railway Atropos `5178b6cc-e843-4058-accc-c4686060d77c`, Clotho
  `0f2678d1-13cc-46c0-a5d4-f9982dc8c588`, worker
  `513cca11-fe4a-4216-b422-1977bff2cc14`: SUCCESS, all at the main SHA above.
- Public `/__status` matched the build. Public browser: Island search
  **훈민정음** → the existing Event **훈민정음 반포** → Graph detail with
  **1446년 범위**, named World/Canon, Narrative and the National Institute of
  Korean Language source → stable Event page pinned to revision 1. The page
  displays named Canon time, Narrative, source and **세종 치세** containment.
- Mobile acceptance covers empty/partial reads, unavailable pinned revision,
  failed detail and retry, Island search URL plus reload restoration, and
  Graph → Event → Graph with exact revision/selection/viewport continuity.
- Regression failures were fixed without dropping assertions: query budgets
  had been reset to defaults; drawer dragging intercepted links/retry; query
  refresh cleared focus; passive URL synchronization lost reader state; React
  streamed placeholders into `noscript`, producing browser errors. The fallback
  is now one escaped static markup block with an explicit injection test.

URDR source remains the existing vendored baseline (`0267c8fd081ca9a3cd556f8f7319c600248c3760`).
Only the Graph shell's reading, focus restoration and pointer-action seams changed;
renderer, layout, geometry, spatial budgets and pan/zoom algorithms did not.
100k bounded spatial and M4.7 interaction tests remain green.

Local checks used the available unit/type/lint/build environment; full WebKit
and PostgreSQL checks used existing GitHub CI. A local `tsx` smoke invocation
was blocked by the host's IPC-pipe permission; no permission workaround was used.
The deployed smoke above ran in the authorized GitHub workflow. Browser extension
metadata errors are separate from application errors; CI asserts no page errors.
PR-B actual canonical refinement and PR-C measured scale acceptance are still open.
