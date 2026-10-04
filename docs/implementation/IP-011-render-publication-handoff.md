# Render Publication Architecture Handoff

> 2026-10-04 순서 대체: 아래 활성화·다음 단계·A5→A6·합성 입력 지시는 당시 인계/계획 이력이다. [IP-013](IP-013-real-history-development-plan.md)의 W/C 수용→실제 역사 pilot∥Composite→격리 X 실험→자동화/discovery가 우선한다. 현재 작업은 문서·draft PR 전용이며 [CURRENT](CURRENT.md)가 실행 상태를 소유한다.


Status: planning handoff, not yet authoritative architecture

Disposition (updated 2026-10-02): verified implementation plan is [IP-012](IP-012-render-publication-plan.md), normal viewport read decisions are [ADR-012](../architecture/ADR-012-render-read-architecture.md), and the active follow-up is [mobile performance/continuity](IP-012-mobile-continuity-plan.md). Preserve this handoff as decision history. Its next-Work-session/planning-only/global-manifest wording is not a current execution restriction; default GraphShell Render integration has already shipped. Use CURRENT for deployed state.
Date: 2026-09-28
Repository: neocjmix/moirai

## Purpose

This handoff captures the architectural decisions reached while investigating why Atropos rendering cost is disproportionate to the final visual output.

The next Work session must use this document as the primary handoff input, verify it against the actual latest repository state, reconcile it with IP-011/A4/A5 and authoritative architecture documents, and produce an implementation-ready plan before coding.

This is not a request to apply a local performance patch. The core conclusion is that the current responsibility boundary between Lachesis and Atropos is wrong for large-scale graph exploration.

## Observed current read/render shape

The current v5 path was traced through the latest main implementation around:

- `apps/atropos-web/src/components/v5-graph-page.tsx`
- `apps/atropos-web/src/components/v5-atropos-root.tsx`
- `apps/atropos-web/src/lib/v5-graph-read-loader.ts`
- `apps/atropos-web/src/app/graph/v5/shell/route.ts`
- `apps/atropos-web/src/lib/v5-shell-reader.ts`
- `apps/atropos-web/src/lib/v5-staged-reader.ts`
- `apps/atropos-web/src/lib/publication.ts`
- `apps/atropos-web/src/urdr-port/src/viewport-cache.ts`
- `apps/atropos-web/src/urdr-port/src/components/graph-shell.tsx`
- composite geometry / label / viewport candidate helpers.

Current high-level flow:

Authoring truth
→ Publication
→ immutable revision objects in object storage
→ viewport request
→ selected spatial traversal
→ event content enrichment
→ composite child lookup
→ adjacency lookup
→ relation lookup
→ renderer entity reconstruction
→ browser
→ world-to-screen projection
→ composite geometry processing
→ clipping / coverage
→ label placement
→ spline/path construction
→ density / opacity / LOD presentation
→ React/SVG rendering.

The current system already avoids querying the authoring database directly on each pan. It reads published immutable objects, with a server-process immutable-object cache and browser viewport cache.

However, too much render-scene reconstruction still happens at read time.

## Problem statement

The final screen often consists of only:

- points
- relation lines
- composite polygons/hulls
- labels
- interaction targets

Yet obtaining these primitives currently requires substantial semantic graph work.

For composite rendering, runtime code may need composite children and effectively enough descendant geometry to construct or prepare hulls.

For relation rendering, runtime code reads adjacency and relation documents, then reconstructs visible edges.

This work is repeated as viewport coverage changes.

The problem is therefore not merely that spatial lookup is slow. The problem is that the read path still transforms semantic graph data into render-scene data at viewport time.

Adding Redis, Elasticsearch, longer response caching, workers, React memoization, or WebGL alone does not remove this structural amplification.

## Architectural invariant

The central rule agreed in this discussion is:

> Anything that is true about the World should be decided by Lachesis.
> Anything that is only true about the current Viewport should be decided by Atropos.

A stronger rendering invariant follows:

> Atropos must not traverse the domain graph in order to draw it.

And:

> Viewport movement must not cause historical/semantic layout reconstruction.

And:

> Zoom transitions should interpolate between prepared representations rather than generate new geometry.

## Responsibility model

### Clotho

Owns semantic authoring truth: what exists.

Examples:

- Event identity and content
- Narrative
- Collection membership
- Relations
- Composite structure
- temporal/domain facts

Clotho must not own viewport rendering policy.

### Lachesis

Lachesis becomes responsible for:

- Publication
- semantic/world projection
- world-space layout
- render compilation
- immutable Render Publication

It decides where an entity exists in world-space and what visual representations it has at each semantic scale.

### Atropos

Atropos becomes a runtime scene consumer.

Its responsibilities should converge toward:

- determine required render tiles
- fetch/cache them
- maintain active scene working set
- apply camera transforms
- interpolate prepared LOD transitions
- final viewport culling
- bounded final label collision
- interaction / hit testing
- draw via SVG / Canvas / WebGL

Atropos should not need Collection/Event/Composite/Relation graph traversal for ordinary rendering.

Semantic detail reads for a drawer are separate from rendering data reads.

## Existing five performance findings and how this direction addresses them

### 1. Publication is not render-complete enough

Current spatial reads may still require event content, composite children, adjacency, and relation reads before a renderer-ready scene exists.

Decision: address this with a stronger Render Publication compiled by Lachesis.

### 2. Arbitrary bbox viewport snapshots cause repeated reconstruction

Current cache reuse helps only while a cached arbitrary bbox covers the new viewport.

Decision: replace the conceptual unit with immutable `X × Y × Level` render tiles/chunks. Panning should fetch only newly entered tiles.

### 3. Composite geometry is still reconstructed in Atropos

Runtime composite work is too expensive if it derives hull support from semantic descendants.

Decision: composite transitive closure, hull generation, simplification, and LOD representations belong to Lachesis.

### 4. Camera movement is too tightly coupled to presentation recomputation

Even if data reads become cheap, current pan/zoom can invalidate substantial React/useMemo geometry, label, clipping, and density work.

Decision: Render Publication only partially solves this. Atropos runtime hot-path simplification is a separate required workstream.

Desired direction:

pointer move
→ camera transform
→ draw

rather than:

pointer move
→ broad React state invalidation
→ geometry/presentation recomputation
→ reconciliation
→ SVG mutation.

### 5. Read amplification is disproportionate to visual output

A small set of visible primitives can require many publication-object reads and graph joins.

Decision: precompiled Render Tiles should reduce runtime to tile fetch/decode plus viewport-specific work.

## Render Publication

Introduce a renderer-neutral Render Publication generated by Lachesis.

The central contract should be a `RenderTile` or equivalent immutable render chunk.

It is not a bitmap tile. It is a bundle of vector/display primitives for a world-space area and semantic level.

The contract should be renderer-neutral so that SVG, Canvas, and WebGL can consume the same publication.

Do not bake SVG strings as the canonical artifact.

Candidate primitive classes:

- point
- polyline / line
- polygon
- label
- interaction / hit target
- entity reference
- LOD / transition metadata
- optional external geometry reference

A render primitive should carry enough information to draw and interact without reading semantic graph structure.

At minimum, interaction metadata must identify the semantic target, e.g. entity type and entity id.

## Lachesis render-compiler responsibilities

The following are expected to move to publication time where feasible:

- Event world-space positions
- Relation world-space geometry
- Composite transitive child / leaf closure
- Composite hull generation
- hull simplification
- LOD-specific geometry representations
- point ↔ hull representation relationships
- representation visibility ranges
- fade-in / fade-out ranges
- label text
- label world anchor
- label priority
- candidate placement metadata
- style / visual class
- interaction flags
- entity type + id reference
- XY spatial partition
- Level partition
- cross-tile geometry strategy
- Render Tile manifest
- dependency metadata needed for future incremental rebuilds

Ordinary graph rendering should no longer require Atropos to:

- read composite children
- recurse to leaves
- generate a composite hull
- read event adjacency
- read relation documents
- fetch opposite events solely to construct an edge
- fetch event content solely to obtain render labels

## X × Y × Level

The render working set is not only spatial.

Treat it conceptually as:

`X × Y × Level`

The Level dimension represents semantic visual scale/LOD.

Example for a composite:

far:
- point

transition:
- point + faint hull

near:
- hull + richer labels / children

Do not hard-switch at an integer boundary if that creates popping.

Representations should have overlapping level ranges and transition metadata.

Example:

point:
- visible: 0.0–3.4
- fadeOut: 2.8–3.4

hull:
- visible: 2.7–8.0
- fadeIn: 2.7–3.3

Atropos should merely evaluate/interpolate prepared representations within the overlap.

## Buffering

The active runtime working set should include both:

- XY overscan around the current viewport
- neighboring Level/LOD data around the current zoom state

This is required so pan and zoom transitions do not expose network/tile boundaries.

The Work session must design explicit policies for:

- spatial overscan
- prefetch threshold
- level buffer
- transition overlap
- eviction
- memory budget

without prematurely hard-coding values before measurement.

## Geometry crossing tile boundaries

Moirai geometry cannot be treated as bitmap rectangles.

A long relation or large composite polygon can cross many tiles.

The next plan must compare:

A. clip geometry at tile boundaries and duplicate pieces
B. store large immutable geometry separately and reference it from tiles
C. hybrid approach

The current preference is a hybrid:

- small/common primitives inline in tiles
- very large composite geometry may live as an immutable geometry object
- tiles contain references plus bounds/render metadata

This is not yet a final decision. Measure duplication, request count, cache behavior, and decode cost before fixing the format.

## Labels

Labels should be mostly prepared by Lachesis but not completely screen-positioned on the server.

Lachesis should decide:

- text
- world anchor
- priority
- LOD visibility
- transition ranges
- placement candidates
- collision class/group
- approximate metrics if useful

Atropos should handle only viewport/device-dependent final work:

- actual screen-space collision
- final candidate selection
- final draw

The goal is to reduce label runtime work from semantic selection over a large graph to bounded final placement among already selected candidates.

## Runtime target architecture

Target hot path:

camera
→ determine required X/Y/Level chunks
→ memory/browser/CDN cache lookup
→ fetch missing immutable Render Tiles
→ decode into active scene
→ world→screen camera transform
→ LOD interpolation
→ final culling
→ bounded label collision
→ hit testing
→ draw

No semantic graph traversal should occur during ordinary pan.

If Render Tiles are immutable revision assets, evaluate serving them directly from object storage/CDN rather than routing every viewport through the Next.js application server.

## Cache model to re-evaluate

Current layers include:

- immutable S3/publication objects
- server process immutable-object cache
- request-local object maps
- no-store viewport responses
- browser arbitrary viewport cache

With Render Tiles, target cache hierarchy should likely become closer to:

immutable Render Tile in object storage
→ CDN/HTTP immutable caching
→ browser persistent/network cache
→ in-memory active tile working set

Re-evaluate whether arbitrary viewport response caching remains necessary at all.

Avoid repeatedly wrapping the same immutable render data inside newly generated bbox responses.

## Renderer boundary

The RenderTile contract must not depend on SVG.

Possible conceptual package boundaries:

- `@moirai/render-contract`
  - shared renderer-neutral tile/primitive schemas

- `@moirai/render-compiler`
  - Lachesis/publication-side semantic graph → render publication

- `@moirai/render-runtime`
  - Atropos tile scene, camera, transitions, culling, interaction

Names are suggestions, not fixed decisions.

Shared code should primarily be contracts and small pure mathematical rules. Do not create a single cross-environment package that causes both FE and BE to execute the same rendering pipeline.

## Atropos runtime simplification remains required

Render Tiles solve most read amplification but do not automatically solve camera-frame cost.

Current runtime behavior must be inspected for:

- React state updates on pointer move
- broad memo invalidation
- world→screen work
- polygon projection
- clipping
- composite label placement
- semantic density selection
- opacity calculation
- relation geometry
- SVG DOM churn

The next plan must distinguish:

1. work that disappears because Lachesis precompiles it
2. work that remains necessary but should only happen on settle / tile change / LOD change
3. work that truly must run every animation frame

WebGL is not itself the architecture solution.

SVG may remain viable if gesture-time work is reduced to transforms and limited paint changes.

Renderer migration must not alter the Render Publication contract.

## Incremental publication

Strong precomputation introduces an invalidation problem.

When an Event changes, future Lachesis work may need to determine:

- affected Composite ancestors
- affected hulls
- affected relation geometry
- affected labels
- affected LOD representations
- affected XY×Level tiles

Long-term, dependency-aware dirty render-tile rebuilds are desirable.

However priority is:

A. correct Render Publication architecture
B. simplified Atropos runtime
C. incremental publisher

Do not overcomplicate A/B merely to achieve incremental rebuilding immediately.

First measure full-world publication cost at representative scales.

## Relationship to A5 Collection Discovery

Do not discard A5 UX decisions.

A5 intentionally increases demands on the render/read system:

- more simultaneously active Collections
- greater graphic density
- separate text density and geographic/graphic density
- background/context geometry
- richer exploration

Therefore A5 makes this architecture correction more important.

Do not silently mix this architecture rewrite into A5 implementation scope.

The Work session should determine whether this becomes a distinct follow-up IP or an explicit new phase of IP-011, based on the actual latest repository/docs state.

Concurrent work may be in progress. Verify main/branches/PRs before editing and avoid conflicts.

## Required investigation in the next Work session

Do not plan from this handoff alone.

Inspect the actual latest repository and authoritative docs.

At minimum inspect:

- v5 graph bootstrap
- V5AtroposRoot
- createV5GraphReadLoader
- /graph/v5/shell
- /graph/v5/viewport
- v5ShellReader
- createV5StagedAtroposReader
- publication storage/cache
- graph-shell.tsx
- viewport-cache
- composite geometry modules
- label/density modules
- current Lachesis/publication compiler pipeline
- IP-011 architecture
- A4 closeout/handoff
- A5 plan/handoff
- CURRENT
- architecture / requirements / glossary

Determine exactly:

- what geometry is already materialized at publication time
- what geometry Atropos reconstructs
- where composite hull source-of-truth currently lives
- whether all hull coordinates are currently persisted
- how relation geometry is currently produced
- where labels are currently selected
- actual server read amplification for dense viewports
- why many active Collections can become extremely slow

## Required deliverables

Produce an authoritative, implementation-ready plan containing:

1. current before-pipeline diagram
2. target Clotho → Lachesis Render Compiler → Render Publication → Atropos diagram
3. responsibility matrix for Clotho / Lachesis / Atropos
4. RenderTile contract draft
5. X/Y/Level partition model
6. transition/LOD model
7. label contract
8. cross-tile large-geometry strategy
9. cache/CDN strategy
10. mapping of current files/functions into:
   - delete
   - move to Lachesis
   - keep in Atropos
   - replace
11. staged migration plan that does not require an unsafe all-at-once cutover
12. benchmark plan and exit criteria
13. authoritative doc updates
14. ordered implementation checklist for the following session

## Benchmark requirements

Do not collapse all cost into one latency metric.

Measure separately:

- publication compile time
- publication storage size
- tile count
- geometry duplication ratio
- cold tile fetch
- warm tile fetch
- transferred bytes
- decode cost
- world→screen transform
- label work
- React/renderer work
- pan frame time
- zoom frame time
- tile-boundary crossing
- LOD transition
- runtime memory working set

Test at minimum:

- 1k Events
- 10k Events
- 100k Events
- 30+ active Collections
- dense composites
- mobile viewport
- continuous pan
- continuous zoom
- cold cache
- warm cache

Capture a before baseline for the currently observed severe slowdown with many active Collections and identify where the time is actually spent.

## Non-solutions

Do not substitute any of the following for the architecture correction:

- Redis alone
- Elasticsearch alone
- longer /shell caching
- React memoization alone
- worker threads alone
- WebGL alone

These may be useful later but do not eliminate runtime semantic graph → render scene reconstruction.

Also avoid prematurely fixing the final wire/storage encoding.

First stabilize semantic ownership and RenderTile contract. JSON vs binary, compression, encoding, and renderer-specific optimizations can follow measurement.

## Planning completion criteria

The next Work session is complete only when:

- the actual latest implementation has been traced
- this handoff has been reconciled with existing authoritative documents
- contradictions are resolved explicitly
- Render Publication ownership is clear
- Atropos runtime ownership is clear
- migration stages are actionable
- benchmarks/exit gates are specified
- the subsequent implementation session can begin without another architecture-design session

Do not implement major runtime changes before completing this planning baseline unless a very small diagnostic change is necessary to obtain missing evidence.
