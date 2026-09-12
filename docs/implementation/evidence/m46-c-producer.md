# M4.6-C producer

Status: implementation ready for CI/deployment verification; not overall M4.6 completion.

- Source `neocjmix/urdr@0267c8fd081ca9a3cd556f8f7319c600248c3760`, `shared/domain/src/chart-plane-projection.ts` and `static-viewport-bake.ts`.
- Preserve original free-X constants/32 iterations and band size 4096. Golden fixture captures the producer before Moirai input options. Types, formatting and documented unused-variable lint annotations are local adaptations.
- Moirai's registered codec and temporal constraint resolver supply explicit extents and only `precedes`/`not_after`/`coincides` Y constraints. `causes` remains X attraction/segment meaning, not a fabricated chronology.
- Canon-context instance IDs, lossless source values and complete v3 sidecar remain separate from display geometry. Explicit membership supplies contained children in deepest-first order; starts/ends do not silently create membership.
- Known cluster-bound defect remains unchanged and observable as `m46_legacy_layout_outside_semantic_bounds`, deferred by user to [#57](https://github.com/neocjmix/moirai/issues/57).
- Publication query composer moved without semantic rewrites into renderer-independent `@moirai/graph-query` for reuse by Atropos and worker. An explicit structural-order display selector is not persisted as a Time System and supplies no calendar coordinate or conversion.
- Append-only presentation paths: `worlds/{world}/revisions/{revision}/presentation/urdr-0267c8f-moirai-v1/`. Original Publication manifest/current pointer are not rewritten. The extension manifest binds the exact original manifest SHA-256; its scope metadata binds object, index and sidecar digests.
- Worker backfills currently served immutable public documents at startup, verifies every input digest and publishes objects before the extension manifest. No canonical write or schema migration is required. New Publication jobs also publish the presentation extension.
- Complete index and semantic sidecar are server artifacts. D must enforce bounded browser responses; the existence of server artifacts is not a 100k browser acceptance result.

Unit acceptance covers source golden parity, original force constants, band/object assignment, relative order without a Time System, causal-only unplaced nodes, nested regions, deterministic bytes, untouched lossless sidecar, immutable conflict and revision mismatch.

Runtime loader remains MOCK until D/E. C does not claim real data is already visible.

## Production checkpoint and compatibility follow-up

PR #56 merged as `4d54fbe5b9e2301e0a20e1e0a0033cffcf45bd74`. PR CI
[34692484942](https://github.com/neocjmix/moirai/actions/runs/34692484942), main CI
[34692594900](https://github.com/neocjmix/moirai/actions/runs/34692594900) and post-deploy
[34692701308](https://github.com/neocjmix/moirai/actions/runs/34692701308) passed.
All three Railway services report SUCCESS on that SHA; public Atropos status agrees.
Worker structured logs show `spatial_backfill` / `served` for Graph Scope Observatory
revision 4. Clotho read-back still reports current/target/served 4, ready.

A subsequent older World failed backfill. The worker had bypassed Atropos's existing
legacy Event/Relation membership normalization and optional artifact defaults.
The follow-up shares these existing read normalizers and adds a legacy backfill
regression; this does not modify the old immutable Publication or canonical data.

The real TS-010 CI corpus (11 Events, 23 Relations) exposed a new seam unit bug:
Gregorian `difference` returns picoseconds. Conversion now divides by picoseconds
per display year, with a regression test. Its corrected output is 42 geometry
entities in 12 spatial documents, while retaining lossless coordinate strings.
