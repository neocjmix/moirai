# M4.6-A — pinned graph pipeline characterization

Runtime baseline: Moirai `dcad5305aadc8d0181e2b6ff33701385310ebb70`.
Documentation start: `287e8a4513c99292a063d9d7c4737cd998db9b09`.
Every URDR path below refers to `neocjmix/urdr` commit
`0267c8fd081ca9a3cd556f8f7319c600248c3760`, not mutable HEAD.

| Responsibility | Original source | Local boundary and verification |
| --- | --- | --- |
| SVG layers, gestures, labels, sheets | `urdr/apps/web/src/components/graph-shell.tsx` | copied `apps/atropos-web/src/urdr-port/src/components/graph-shell.tsx`; no edits in A |
| projection and bounds | `urdr/apps/web/src/components/chart-surface.ts` | copied component; inverse transform and 1.5-span padding tests |
| pan and anisotropic pinch | `urdr/apps/web/src/components/image-viewport.ts` | copied component; centroid, damping, pointer transition tests |
| point/segment rendering adapter | `urdr/apps/web/src/components/chart-plane-adapter.ts` | copied component; no edits in A |
| Composite envelope, fallback and labels | `urdr/apps/web/src/components/graph-shell-composite.ts`, `graph-shell-region-geometry.ts`, `graph-shell-label-policy.ts` | copied components; no edits in A |
| share restoration | `urdr/apps/web/src/components/graph-shell-share-state.ts` | copied component; existing mobile app-shell E2E retained |
| bbox filtering and region closure | `urdr/apps/web/src/graph-read-loader.ts` | pure extraction `src/spatial-read.ts`; crossing segments, selection/neighbor/closure, cycle tests |
| band ranges, dedup and offsets | `urdr/apps/web/src/graph-read-loader.ts` | `src/spatial-read.ts`, `src/spatial-composition.ts`; floor, reversed bounds, all geometry offsets and requested Canon order tests |
| band assignment | `shared/domain/src/static-viewport-bake.ts` | pure `getStaticEntityBandIndices` extraction; point/swept segment/region band tests |
| immutable manifests, caches and partial missing | `urdr/apps/web/src/graph-read-loader.ts`, `shared/contracts/src/static-viewport-artifacts.ts` | local contract bridge exists; runtime loader still MOCK; restoration belongs to D |
| feasible Y, free X and region producer | `shared/domain/src/chart-plane-projection.ts` | source retrieved and pinned; producer absent locally, C pending |
| band/object bake and entity index | `shared/domain/src/static-viewport-bake.ts` | complete source retrieved; producer absent locally, C pending |
| publish orchestration | `urdr/apps/api/src/server/static-bake/static-bake.service.ts` | reference only; Moirai worker/store ownership retained; no Nest/DB copy |

Paths beginning `src/` in the local column are relative to
`apps/atropos-web/src/urdr-port/`. Extracted primitives are not wired into production
in A. Imports are local types; exports and formatting are the only algorithm changes.

## Normative alignment

TS-006 explicitly specifies SVG surface, world/screen transform, free-X force and
y-band reads. IS-001 no longer requires eventual native-renderer replacement or
adapter removal. Canonical identity, membership, temporal evidence and Publication
revision boundaries are unchanged. This is the renderer change authorized by M4.6,
not a new model decision.

## Known input preconditions — not silently fixed

- Original `filterStaticViewportEntities` searches selected Event across its entire
  chartPlane input. The Moirai seam must restrict that input to the requested
  World/Canon/Revision first. A test records the original behavior explicitly.
- Original numeric temporal solver is not the Moirai lossless Time System adapter.
  C must test semantic bounds before accepting presentation positions.
- Original bake duplicates spans across bands and builds whole-scope entity indexes.
  Browser index payload must be bounded; a small visible-cell count alone is not
  100k acceptance.
- Original defaults contain one `year` level. Do not claim multilevel LOD from a
  timeLevel field alone.

## Evidence status

Local characterization 16 tests, full unit suite, root/Atropos strict typecheck,
lint, format, architecture boundary check and detect-secrets 1.5.0 scan pass
(changed files, zero findings). Production desktop observation
confirmed original mock point/segment/region drawing and selection → mock detail
sheet. This is renderer characterization, not Moirai-data or M4.6 completion.
Mobile gesture/screenshot, CI and public checkpoint evidence remain required before
closing A. Local production build succeeded, but local WebKit launch could not load
system libraries. `install-deps webkit` was permission-denied; no permission workaround
was attempted. Existing CI installs the supported WebKit dependencies and now retains
test screenshots as `graph-regression-evidence` for 14 days. No canonical writes or
runtime connection change was made.
