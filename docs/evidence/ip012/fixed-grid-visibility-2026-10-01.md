# IP-012 fixed spatial frame and bounded visibility

Date: 2026-10-01. Work-branch implementation; **not deployed** by this evidence.
Baseline: `0a1ab92`. Authority: ADR-012, the active IP-012 implementation request,
and the user's explicit 2026-10-01 approval of point → small unlabeled point →
hidden for dense Events and hull → point → small unlabeled point → hidden for
Composites. The refinement changes presentation visibility, not authored ontology.

## Versioned contract

- New output: `render-publication/2`, `render-tile/2`, `render-compiler/4`
- Legacy `/1` assets keep their original occupied-bounds grid and remain readable
- Fixed origin `(0,0)`; L0 spans `(4096,16384)` World units, approximately 37 layout
  lanes × 117 chronology years at 110 units/lane and 140 units/year
- Published integer spatial levels `-8..12`; span per axis is `baseSpan × 2^-level`
- Signed indices are `floor((coordinate-origin)/span)`; cells and nonempty viewport
  coverage own `[min,max)`. A point on an edge belongs only to the positive-side cell
- Closed line/hull maximum endpoints are also discoverable from the positive-side
  owner. Occupied World bounds are camera metadata, never a grid input
- Address helpers validate finite coordinates, safe indices, level windows and
  cardinality before allocating the requested coverage

This window is an implementation choice, not a rule that level12 is semantic LOD12.
The finest normal cell spans 1×4 units. Exact anisotropic camera scale determines
point/hull/label state in Atropos.

## Large-geometry overflow

Blindly placing a historical hull in every 1×4-unit cell is not viable. Each line or
hull therefore chooses the finest home level whose closed bounds occupy at most
16 cells. It appears in normal buckets through that level and in separate
`overflow/<level>/<x>/<y>.json` buckets at that home level. Fine points continue to
level12. A compact, bounded `overflowLevels` list lets the resolver derive only the
relevant coarse ancestor keys alongside the primary viewport cells.

The same primitive identity and body occur in normal and overflow replicas; the
resolver verifies digests before deduplication. Geometry stays separately referenced.
A 100,000×500,000-unit synthetic hull compiles into at most16 overflow cells rather
than billions of finest cells. If even level-8 is too fine, an explicit65,536-cell
per-primitive compile guard remains; no silent omission substitutes for that error.

## Candidate and semantic metadata

Every cell contains at most128 candidate representations: policy budgets are64
normal,32 small-point and32 transition-buffer candidates. The exact visible scene
is ranked after viewport/Collection filtering by a stable hash-derived authored-ID
priority. This hash is not canonical importance. Sparse scenes do not manufacture
micro-points just to fill a budget.

Compiler selection initially reserves up to32 Composite and80 Event candidates,
then shares spare capacity; up to16 relations fit inside the same128 total only
when both endpoints have a representation at that level. Cell metadata states
candidate and omitted counts. No spatial Event-count cluster is produced. All
replicas carry the same priority; per-cell rank is deliberately absent from immutable
primitive bodies.

Each Composite has one hull representation with its actual hull bounds, center,
complete-support flag and bottom-up GraphShell depth. The existing point hysteresis
is32/48px. Child fade uses padded hull height58..100px, with6+5×depth pixel padding.
These are prepared inputs, not a license to filter semantic children by spatial level.

Every primitive carries complete authored direct-parent and ancestor IDs, so an
omitted middle Composite does not break visible ancestor suppression. Direct
Composite child hints are capped at128 IDs, with `childEventCount` and
`childIdsComplete`; complete geometry support is independent of full child-ID
enumeration. The adapter reconstructs visible relationships from parent/ancestor
metadata. More than1024 authored ancestors on one primitive fail explicitly as
`render_hierarchy_budget_exceeded`.

## Reproducible compiler measurement

Synthetic fixture:128 unchanged local points on a16×8 grid spaced16 World units;
all remaining Events are dense far points around `(5,000,000,5,000,000)`, with ten
repeated coordinate offsets. No Collections or relations; no hull geometry. This is
a distant-growth/locality and dense-bucket test, **not arbitrary large-world or mobile
performance acceptance**. Each size compiles the complete publication including all
21 spatial levels. Local tile comparison uses level3, address `(0,0)`.

Measured once with Node24.19.0, Linux x64 in the shared cloud execution workspace.
Wall time includes compiler work only; fixture construction is excluded. It is not an
isolated hardware benchmark or a p95 measurement.

| Events | Compile ms | Tiles | Geometry objects | Tile bytes total | Max tile bytes | Local tile bytes | Local candidates |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 77 | 544 | 0 | 2,989,129 | 53,451 | 49,330 | 128 |
| 10,000 | 622 | 544 | 0 | 3,175,500 | 53,940 | 49,330 | 128 |
| 100,000 | 10,805 | 544 | 0 | 3,195,174 | 54,463 | 49,330 | 128 |

Local SHA-256 at every size: `4b35e1adc2bdb4765c1223d725a38a4360f1a796c5c15ef219db6593e918ba9e`.

Every emitted tile has at most128 primitives. Far-cell omissions at level3 are744,9,744 and99,744 respectively; these are deliberate visibility omissions, not lost canonical Events.

The local tile digest is identical at all three sizes. Extra distant records increase
publication work while this local read stays unchanged. Publication tile count is
constant for this deliberately fixed-support fixture; a geographically spread World
would produce additional immutable tiles, which is expected and permitted.

## Verification and limits

Compiler/helper tests cover signed boundaries and nesting, negative levels, input
order determinism, exact Collection filtering, relation endpoint representation,
transitive incomplete support, one authored hull representation, stable bytes after
extrema expansion, density omission for both Events and Composites, overflow hulls,
and zoom refinement recovering1000 distinct Event candidates from128 at level3.

The full compiler is also tested with an authored star containing100,000 direct
children. Child hints stay128, the complete count is100,000, full hull support remains
explicit, all child ancestor lists contain the root, every tile has at most128
candidates and every tile remains below1MiB.

Remaining limits are explicit:

- Coincident candidates may remain hidden at the finest spatial level
- Global density selection can omit candidates from an active Collection; filtering
  cannot restore a candidate absent from the bounded publication bucket
- Very large Collection membership arrays and pathological deep/multi-parent
  ancestry can still fail the1MiB tile or hierarchy guard
- Large geometry still has a1MiB-per-object guard and a finite coarse overflow window
- Geometry bytes remain revision-pinned; cross-generation content reuse is not
  established by this change
- Compiler cost and storage may grow with World size; these measurements do not
  establish incremental compilation, mobile p95, or natural-transition acceptance
- Browser transitions, buffer lifetime, Collection interaction and full server read
  budgets require their own integration/browser evidence before a deployment claim
