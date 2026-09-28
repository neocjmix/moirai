# IP-011 A5 execution

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

Local production build and strict web typecheck passed. Targeted context/geometry/loader/shell unit tests: 19 passed. Targeted ESLint and diff whitespace checks passed. Mobile suite and deployed verification pending. S2–S7 are not complete.

Rollback: `?discovery=legacy` (or `&discovery=legacy` on an existing query) restores the retained Island. Server default can be set with `ATROPOS_COLLECTION_DISCOVERY=legacy`. `discovery=context` explicitly opts into the checkpoint. These flags only select presentation; they do not modify Publication or canonical data.
