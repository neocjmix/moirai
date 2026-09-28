# IP-011 A5 execution

## S1 feedback checkpoint — independent title and operational corpus

User feedback 2026-09-28 11:45 KST authorizes synthetic content directly in the existing development World, superseding the A5 read-only restriction for this corpus only. No schema migration/reset is performed. Corpus v1 adds 24 Collections, 552 Events (72 derived Composites), 576 Narratives and 1,008 Relations in 24 atomic batches. Fixed IDs, World-scoped duplicate search, policy identity check, candidate-state validation and readback prevent accidental duplication. New content is explicitly labeled A5 synthetic. Existing historical records are not deleted. The checked-in workflow uses the existing Clotho secret only for the normal v5 API boundary; no credential extraction or permission expansion.

HUD policy `a5-s1-v2` no longer gates on filled area, center containment or fade. Complete, visible candidates qualify; a sole most-specific candidate wins, otherwise a unique central candidate wins, otherwise a still-visible prior topic is retained, with World-only fallback for fresh ambiguity. First acquisition is immediate and subsequent change dwell remains 250ms. Graph paint/suppression and camera remain unchanged. A mobile fixture now switches full-cover to narrow geometry and checks the title remains while the shape is painted.

The existing first-page default selected every Collection despite the maximum-eight query contract. With this corpus that would cause invalid requests; default bootstrap is bounded to eight without claiming S3 capacity. Explicit selection and catalog remain available. Deployment, corpus Revision and CI results will be recorded after execution.

## S0 registration — 2026-09-28, before implementation measurements

- Latest main and production web/API/worker: `8937cb4142215b439d4430e61b9db1ae15f218c8`. Planning #237 head `1cf9745bd278a31cc51ed43d0b10bcc91a902ed9`, CI 36368885368 succeeded; reviewed Markdown-only change, diff check, merged as `55cae82717af34d09683d04e4bd0a7df46c68aef`.
- Authoritative requirements: BR-003.12/14, JRN-004, TS-005.3, TS-006.6 and A5 S0–S7. A5 execution active; A6/M5, canonical migration and bulk authoring inactive.
- Fixed A4 reference: sustained p95 50/56/62ms versus 33.4ms, not a performance pass. Keep A4-B01–03 open. No performance improvement inferred from this UI slice.
- Register combined settled-navigation viewport+discovery cold budget: 1MiB / 256 artifact reads. S1 adds no discovery fetch. S5 must account for both requests and cancellation waste together.
- S1 policy v1: existing coverage fade 0.35→1 and 220ms paint exit unchanged. Topic requires complete hull support, viewport center inside polygon, coverage ≥0.35; retain existing topic down to 0.30. Prefer a contains descendant over its ancestor. Unrelated eligible topics are ambiguous (World only). Change dwell 250ms; a unique fully suppressed topic hands off immediately so its meaning never vanishes. No camera mutation.
- Fixed policy fixtures before outcome: no-topic→null; complete center full-cover→topic; partial hull→null; nested parent/child→child; unrelated equal cover→null; reordered candidates→same result; coverage boundary retention; 1/4/16 ancestors→most specific. Mobile fixture also covers flag on/off, drawer, all-off, camera persistence and keyboard dialog close/focus.
- S1 uses the existing catalog for the minimal Collection escape. Full catalog pagination/search beyond the initial 128 and intent persistence remain S4; this checkpoint must not be described as the completed escape hatch or discovery experience. The existing maximum 8 active selection remains until S3 measurement.
- Instrument on-demand through existing `moirai:graph-inspect`: policy version, candidate/selected HUD, semantic label/primary-target counts and geometric shape/vertex counts. No per-frame telemetry or production content writes.
- First checkpoint scope: SSR-resolved Island flag (default OFF for v5, explicit legacy rollback), container-free World/topic HUD and minimal Collection controls. Existing renderer, source selection, camera restore, drawer and suppression remain the baseline.

## Results

Local production build and strict web typecheck passed. Targeted context/geometry/loader/shell unit tests: 19 passed. Targeted ESLint and diff whitespace checks passed. [Main CI 36369948758](https://github.com/neocjmix/moirai/actions/runs/36369948758) passed quality, secret scan and mobile WebKit (32 passed, one pre-existing skip). S2–S7 are not complete.

### First production checkpoint

- Implementation PR #238 merged as `b09394c6989f895caf7e7d0086d9a953b6531732`. Railway web deployment `452246cb-0a81-4866-8567-b0a66866bccf`; public health/readiness/status confirmed this SHA. Served/current/target Publication remains Revision 32.
- [Post-deploy smoke 36370230458](https://github.com/neocjmix/moirai/actions/runs/36370230458) passed readiness, live mobile navigation and authenticated authoring/replay smoke. Manual public browser verified World HUD, retained six-Collection catalog, title search, all-off/re-enable, Collection narrative and linked Event narrative. Desktop screenshot is supplementary, not physical mobile evidence.
- New mobile fixtures verify full-cover suppression-to-HUD handoff, incomplete-support World-only fallback, Island rollback, modal controls/focus and viewport reload restoration. Pin, automatic relevance, first-visit curated context and >128 catalog completeness are not implemented or claimed.
- [IP-004 reader 36369937539](https://github.com/neocjmix/moirai/actions/runs/36369937539) passed 100/1k/10k.
- [A4 scale 36369937462](https://github.com/neocjmix/moirai/actions/runs/36369937462) failed mobile profiles: inspected dense and sustained logs wait for the removed default Island button (`소스 쿼리 열기`), producing measurement_error/collection_toggle_missing. Sustained additionally fails start/middle/return frame budgets. These failures remain recorded; this is not an A4 pass. Worker 10k passed; worker 100k was still running at inspection.
- Follow-up explicitly selects `discovery=legacy` in the five A4 Island-dependent profiling scripts to preserve their historical comparator. It does not relax timing budgets or make them A5 acceptance tests. A5 measurements must use the new controls. Do not block this deployed checkpoint on an unlimited A4 rerun.

### Next checkpoint

S2 separates Semantic primary interaction from Geographic geometry and removes invisible broad primary hit targets. Measure semantic/graphic density and mobile input before S3 multi-Collection capacity; only then proceed to S4 intent persistence and S5 automation. Existing 8-active/128-catalog limits, selection cache replacement and sustained frame deficit remain explicit. No bottleneck or 16-active success is inferred.

Rollback: `?discovery=legacy` (or `&discovery=legacy` on an existing query) restores the retained Island. Server default can be set with `ATROPOS_COLLECTION_DISCOVERY=legacy`. `discovery=context` explicitly opts into the checkpoint. These flags only select presentation; they do not modify Publication or canonical data.
