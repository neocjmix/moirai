# IP-013 layout analysis — reconciled 2026-10-04

Observed starting main: `4c72666` (PR #323), after #322 planning and #321 performance closeout. CURRENT still describes #323 as under verification and `v5-world-layout.ts` calls its producer “Inactive”; both are stale against merged code. This session's explicit R + Layout Lab request activates the research implementation. It does not authorize canonical history changes or layout promotion/backfill.

## Actual production computation

`apps/lachesis-worker/src/index.ts` loads `readV5WorldAtRevision` and invokes `buildV5WorldCompleteArtifacts`. The exact-revision backfill in `render-backfill.ts` invokes the same function. `packages/graph-presentation/src/v5-spatial-publication.ts` projects World temporal facts, calls `buildV5WorldLayout` for every Time System, indexes shapes and optionally invokes `compileV5RenderPublication`. The worker publishes the verified generation. Atropos normally reads Render viewport metadata and immutable geometry; it does not compute World placement.

`v5-world-layout.ts` prepares World-wide, sorted Event/Relation input and adapts lossless temporal coordinates into display scalars. It calls `buildGraphShellChartPlane` from `urdr-chart-plane.ts`. `semantic-layout.ts` is a separate older scoped adapter used by legacy fixtures/tools, not the current v5 publication choke point. Both share that low-level producer, but their inputs differ. In particular, scoped semantic layout maps causes into structural links while v5 maps causes into semantic links.

## Coordinates and sequence

Y is temporal: `(scalar - board center) * 140`. V5's center is zero. Gregorian scalar is the registered adapter's picosecond difference from year-zero divided by `31_556_952 * 1e12`; it is an approximate mean-year display coordinate, not a canonical year or duration. X is non-temporal lateral placement, in units of 110 world units per lane. Thus IP-013's “X placement” and “Y time axis” do agree with the implementation.

The producer seeds point positions from explicit extents, propagates finite intervals, distributes overlapping interval clusters, jointly repairs temporal bounds/order, computes point X, derives Composite envelopes, selects a display parent and emits relation geometry. Interval redistribution prefers 8% padding and strictly ordered placement uses a 0.001 display-year minimum gap. Those are existing temporal display mechanics, not tunable research truth parameters. One-sided/unanchored v5 Events stay unplaced; anchored descendants make ancestors eligible. Composite geometry derives from child geometry; authored containment is not rewritten. An overlap may have one selected `containedBy` display parent while every authored contains edge remains in the input.

## Existing force parameters and observed coupling

| Parameter | Default | Actual behavior |
| --- | ---: | --- |
| iterations | 32 | Synchronous iterations with linear cooling `1 - iteration / iterations`. More iterations changes both number of steps and cooling schedule. |
| repulsion | 0.03 | Signed inverse-square X-gap repulsion among movable points. Gap is floored at 0.08 lane units; equal X breaks ties lexically. This is not a collision solver. |
| causesAttraction | 0.22 | Attraction for **structural** `CAUSES`. The current v5 adapter produces semantic causes, so this coefficient is a no-op for v5 input; retained and labelled for source parity. |
| temporalAttraction | 0.12 | Linear attraction between temporal constraint endpoints and semantic temporal links, including current v5 causes. Multiple edges for one unordered pair use the greatest weight, not the sum. |
| maxStep | 0.22 | Clamps `force * cooling` per iteration, in lane units. Large coefficient changes can be hidden by saturation. |
| bounded branch | Event count > 500 | Limits repulsion to up to 24 temporally sorted neighbors on each side within 10 display-years. Counts **all canonical Events**, including Composite/unplaced. Smaller Worlds repel every movable point regardless of temporal separation. |

Repulsion, attraction, iterations and maxStep are strongly coupled. All non-anchor points initially have X=0; deterministic lexical tie separation, clipping and cooling dominate early iterations. There is no centering force, collision radius, hull force or general constraint-based X solver. Inverse-square repulsion and linear attraction compete; changing one control does not imply a predictable independent “compactness” or “separation” effect. The bounded branch depends on repaired temporal positions, so interval placement and local density influence which repulsion peers exist. The branch transition itself can change geometry. It is exposed as auto/all/bounded with explicit peer/window settings for observation, not silently removed.

Collections do not affect coordinates. Contains relations classify Composite Events and derive envelopes but do not attract point X positions. Temporal relations influence temporal repair and X attraction. Causes links only attract X (v5 does not infer canonical temporal ordering from causes). Other relation types are not X forces. Composite hull extents change after child X changes.

## Shared computation seam

The implementation separates canonical/temporal adaptation (`prepareV5LayoutInput`) from browser-safe pure `computeLayout`. The prepared immutable, serializable input records the World/revision/time system, temporal digest, full sorted dataset, finite extents, temporal constraints and anchored visibility closure. A dedicated `@moirai/graph-presentation/layout-engine` entry imports no database, publication, Node crypto or temporal projection module.

Both the production `buildV5WorldLayout` adapter and Lab invoke the same algorithm registry and pure compute boundary. Production selects a fixed canonical baseline configuration; the Lab passes a local candidate selection. Baseline defaults preserve existing output and `v5-world-layout/1` or `/2` identifiers. The reference deterministic slot strategy replaces only point X **before** Composite/relation geometry is derived, preserving identical temporal placement and identities. Its slot spacing and temporal collision window are a distinct schema. No seed is required; presets record `seed: null`. New lane/constraint/packing/relaxation candidates can implement the same algorithm contract.

There is no promotion endpoint or publication writer in the research dependency path. Candidate geometry is recomputed from already loaded input, not generated through Lachesis. Future adoption is a separate reviewed canonical configuration/version and publication/backfill operation.

## Exact pre-refactor parity evidence

Both `v5-world-layout.ts` and `urdr-chart-plane.ts` were loaded verbatim from starting main `4c72666` into temporary comparison modules, then removed. Their complete JSON outputs equal the shared engine's production outputs byte for byte:

- 174-Event pathological fixture, `/1`: 18,586 UTF-16 code units, SHA-256 `da51cf271d35718a7c79aa7baa99bf3907d69cedbd8260acd9125522db8bb53b`.
- Same fixture plus 400 unplaced Events (574 total), `/2`: 102,098 UTF-16 code units, SHA-256 `7826d4ff3b493bb1707b1eade484c6d147f35ba58d65612e8e229c35f5f92d95`.

`scripts/ip013-layout-production-parity.test.ts` retains both immutable expected digests. The existing pinned URDR golden also passes. `scripts/ip013-layout-boundaries.test.ts` traverses the production browser and research browser runtime import closures, excluding type-only imports; production server read modules retain their pre-existing shared server barrel, but do not import or invoke research/layout computation. No production renderer branch or selector was added.

Actual read-only history export at World `01a107fb-4018-7fcb-8390-836a40fa91cc`, source revision **26**, Time System `01a107fc-3994-7889-969f-7a210c19fa24`: 147 Events / 386 Relations, `/1` output **19,500 UTF-8 bytes**, SHA-256 `101e3474938c3be2a35a42dbb5854d1a0e320ca0e4b3d278cbf5c3b8ebf61c65`. Starting-main and current full layout JSON were byte-identical. Comparison only projected the read-only exported snapshot in memory; it did not compile/publish/backfill or change any pointer. The raw export remains outside the repository.
