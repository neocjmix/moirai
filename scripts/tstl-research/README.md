# TSTL B0 / A independent preview

For the later isolated X-placement study, see
[exact-signature temporal lanes](../../docs/evidence/tstl-semantic-separation-2026-10-13.md).
It retains every existing candidate and compares regenerated Bubble geometry
and point-only views at fixed and fit cameras. It is not a production promotion.

This experiment starts at documentation commit
`0ead253b4cb71742d7c1ef78c480e66dff708a82`, whose runtime is identical to
`d721b0efdcf309ed7ad21c55bc04572e2f14d644` (`main` at the start).
It does not change the canonical layout selection, publication compiler,
history, Collection membership, served pointer or production application.

## Reproduce

Use Node 22–24 and the repository's pinned pnpm 10.17.1.

```sh
pnpm install --frozen-lockfile
pnpm exec tsx scripts/tstl-research/baseline.ts
pnpm exec tsx scripts/tstl-research/validate-baseline.ts
pnpm exec vitest run scripts/tstl-research packages/graph-presentation/src/tstl-validator.test.ts
pnpm exec tsx scripts/tstl-research/build.ts .artifacts/tstl-preview
python3 -m http.server 4173 --directory .artifacts/tstl-preview
```

In a second terminal, run the same browser checks against either the local
build or the public preview (optional third argument pins the source SHA):

```sh
pnpm exec playwright install chromium webkit
pnpm exec tsx scripts/tstl-research/smoke.ts http://127.0.0.1:4173 .artifacts/tstl-smoke
```

The smoke suite uses desktop Chromium at 1280×800 and mobile Chromium/WebKit
at 390×844. It verifies raw asset hashes, the actual DOM drawing commands,
an independent membership oracle, view stability and real reveal controls.
It records cold/warm navigation, frame p95/p99/max and long tasks separately.
This is browser emulation, not physical iPhone 17 Safari or installed PWA
acceptance.

The build records the source commit, byte digests and sizes in `build.json`.
It copies the original fixture unchanged and bundles only the independent
preview. `health.json` identifies this static surface; it is not production
backend readiness. The browser verifies `preview.json` before drawing it.

## Immutable input and B0

`history-r56.json` has 539 Events, 109 Composites, 430 leaves, 614 contains
edges, 7 Collections and 1,112 Collection memberships. This is a fixed
snapshot, not a request for live latest data.

The handoff's claimed byte digest `b3d846…` does not match the file in either
its own base commit or main. The unchanged Git blob is
`b9c6f7cebc7462a8c6f7848b0b6cc21bdf66ff50`; its actual byte SHA-256 is
`5957645873d0484244e317a99c459df025e2d80d07dc5819e79c62569c716b64`.
The loader pins those actual bytes and independently checks the snapshot
payload digest. It does not rewrite the data to match the document.

Baseline replay restores the omitted Collection incidence, calls current
`computeLayout` (`global-incidence/1`), then calls the actual
`compileV5RenderPublication`. It resolves external geometry and deduplicates
tile replicas. It does not substitute the older Lab hull implementation:
18 of the 109 compiler hulls use its degenerate-support bounds fallback.
The reproducible B0 artifact, SVG and fresh-process measurements are in
`evidence/`. The SVG is an outline diagnostic, not a certified semantic fill.

## What the validator certifies

The semantic oracle keeps direct contains edges, all-Event descendants,
leaf carriers, ancestor signatures and Collection selection separate.
Small seeded DAGs are checked against independent pairwise reachability.
Temporal records retain their source descriptors and original Y. The world
validator binds projected carrier/membership/placed domains and conservative
glyph support Y to that independent source through a declared affine frame.

`EXACT_SERIALIZED` is limited to bounded integer orthogonal simple polygons
and conservative rectangular glyph supports. All polygon, support and patch
coordinates subdivide the plane; every positive-area cell and connected
zone is checked. This is an analytic arrangement, not raster sampling.
Equal-mode seams reconnect. Unsupported geometry or work-budget exhaustion
is unresolved. Unknown cases never authorize fill.

The renderer contract preserves serialized vertices, stroke bounds and
event anchors, permits only linear SVG and ordinary viewport clipping,
and rejects smoothing, alternate mesh pipelines and unauthorized fill.
This does not certify a browser's rasterizer or GPU. Browser smoke checks
the actual SVG attributes against the same commands.

## Limits of this first comparison

- The r56 scalar fixture cannot recover exact dates, uncertainty, duration
  or lossless TemporalSidecar evidence. It is `legacy-scalar-only`.
  **Neither B0 nor A receives semantic filled-area approval on this input.**
- A is the restricted fixed-Y candidate prototype: deterministic data-derived
  ordering, an X-only convex separation QP, single-run piecewise-linear
  contours, bounded repair and explicit port/list fallback. It is not the
  complete joint X/q/L/R A0 preset or a global optimality result.
- Geometry attempts focus on the requested Korea, Japan, China, Imjin and
  Yi Sun-sin Composites. All 109 Composites and 539 Event identities remain
  available through exact membership and reveal lists. Counts do not
  silently discard the rest of the corpus.
- Original B0 compiler contours are compared as diagnostic outlines.
  Center-based negative probes are reported separately; they cannot prove
  whole-support inclusion, exact atoms, final production pixels or user
  comprehension.
- B/C, broad fragmentation, historical writes, default promotion and
  production backfill are outside this experiment.

Pan/zoom, Collection toggles and B0/A switches are view operations. They do
not rerun the solver. Composite headers are annotation/proxy roles, not
leaf witnesses. The graph reuses the current Atropos gesture math and HUD
context policy; it does not import production network reads.

## Deployment isolation

Build into a separate output directory. Add only `tstl-candidate-a/` to the
existing `gh-pages` tree with an ordinary commit and push. Compare every
pre-existing path and blob before pushing. Do not replace the Pages root,
`legacy/`, Railway services or any served pointer. Verify Pages' actual
deployment commit, the public `build.json` source commit, asset digests,
mobile interactions and the recorded production pointer after deployment.

# Product Labs follow-up

The user-authorized [IP-016](../../docs/implementation/IP-016-tstl-product-lab.md)
adds opt-in B0/A comparison to the production GraphShell. The standalone preview
and its certificate policy remain historical evidence. Product A fills are
explicitly experimental, not newly certified semantic areas.

`pnpm exec tsx scripts/tstl-research/export-product.ts` deterministically exports
the entire frozen r56 into the hash-pinned `apps/atropos-web/public/labs/tstl/`
asset and updates `tstl-experiment-pin.ts`. The product loads it once and reuses
the normal density, camera and scene pipeline. No viewport publishing or
canonical/served-pointer write is performed. The 105 area owners have 1,207
independent fragments; the remaining four Composites use explicit points.

Run the read-only browser check against a deployed build with:

```sh
pnpm exec tsx scripts/tstl-research/product-smoke.ts \
  https://moirai-production-8ed1.up.railway.app \
  .artifacts/tstl-product/public-smoke EXPECTED_DEPLOYED_SHA
```

It checks default isolation, filled contours and exact path coordinates,
independent X/Y zoom, B0/A camera and Event selection continuity, drawer,
Collection toggles, density changes and local preference persistence on desktop
Chromium and mobile Chromium/WebKit. These are emulation results, not physical
iPhone 17 Safari/PWA evidence.

## B/C product comparison

The follow-up user authorization in IP-016 extends the product experiment to B/C.
The earlier independent preview and its measurements remain unchanged. B and C
reuse the exact A Event X/Y and alter geometry only. The same exporter writes
format `tstl-product-experiment/2`, preserving old B0 primitives and A contours.

- B builds deterministic rectilinear terminal forests in windows of at most 32
  leaf terminals, with nonmember clearance, a 65,536 graph vertex cap and a
  2,000,000 expanded-state budget. It partitions the union of experimental
  tubes into disjoint rectangles. It has no split/rejoin cycles, reroute,
  crossing-cost optimization or complete semantic arrangement certificate.
- C uses stable spines, nonmember gaps, bounded two-bend member links and
  local leaf atom cells. An axis-bin broadphase reduces exact obstacle tests
  without dropping obstacles; the 2,000,000 predicate budget remains fixed.
  Crowded, blocked or occluded contacts have typed list fallback.
- B reports 1,390 leaf→ancestor pairs. C also includes Composite headers, for
  1,673 all-Event pairs. Exported `leaf*Memberships` diagnostics put both on
  the same 1,390-pair denominator. B `route` counts terminals participating in a drawn nondegenerate route;
  isolated seeds retain their local cell and an explicit `LOCAL_CELL_ONLY` list
  fallback. It is not a count of links or one connected global area.
- The browser uses the same density/camera/selection path. Fixed fill contours
  and open traces pass through worker and cache; traces use a live SVG overlay
  in every renderer and never acquire relationship hit targets. Settings show
  exact list fallback with reasons and original Event reveal links.

Run the same `product-smoke.ts` command for B0/A/B/C. It additionally checks
visible open trace paths through the actual SVG screen matrix, all five real
country/Imjin/Yi cases, per-mode axis gestures/Collection changes, persistence
across reloads, and exact fallback list/reveal behavior. `layoutLab=B` or
`layoutLab=C` opens each candidate directly.
