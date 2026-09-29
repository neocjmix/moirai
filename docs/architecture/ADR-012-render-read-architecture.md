# IP-012 Render Read Architecture Decisions

Status: **authoritative decision record**
Date: 2026-09-29
Scope: Render Publication read architecture and Atropos working-set invariants.
This document records decisions only. It intentionally does not prescribe implementation sequencing or detailed algorithms.

## 1. Purpose

Render Publication exists to move World-stable render decisions out of Atropos runtime while preserving the established Atropos visual and interaction language.

The architecture must scale by allowing Publication storage and compile cost to grow with the World while keeping the cost of one viewport bounded.

## 2. Preserved product experience

Performance work and the tile architecture may introduce minor visual degradation or small consistency differences, but they must not replace the essential visual language or primary interactions.

The following remain semantic product concepts rather than implementation accidents:

- authored Composite hierarchy;
- Composite hulls and their established visual role;
- Composite point/hull and child-visibility transitions across scale;
- Event, relation and label representations;
- Collection selection without changing the meaning of the scene;
- existing navigation, selection and Event-detail interaction.

Spatial proximity alone is not a semantic grouping rule.

The prototype spatial Event-count cluster is therefore **not** an authoritative replacement for authored Composite representations. Spatial clustering may only be introduced later if it is explicitly designed as an additional visual representation and does not erase semantic hierarchy.

## 3. Publication cost model

Publication is asynchronous and occurs much less frequently than reads. The architecture deliberately spends more compute time and storage at publication time when that reduces interactive read cost.

It is acceptable for:

- Lachesis compile cost to increase with World size;
- immutable Publication storage to increase substantially with World size;
- future Publication work to be distributed or scaled out when budget justifies it.

It is not acceptable for Atropos viewport cost to grow proportionally with total World size.

## 4. Primary scalability invariant

World size and viewport working-set size are separate quantities.

As Event and Collection counts grow, a viewport at a given scale must converge toward a bounded representation budget through semantic LOD and visibility decisions.

In particular, growth from 1k to 10k to 100k Events should primarily increase Publication storage and compilation work, not the number of geometries, labels, relations, or primitives that Atropos must render in one viewport.

The authoritative target property is therefore:

> **World complexity may grow without causing unbounded viewport render complexity.**

LOD/visibility design is a higher-priority scalability mechanism than geometry byte compression.

## 5. Spatial addressing and manifest role

Atropos must not require a manifest containing every tile descriptor in order to discover viewport data.

The current manifest form, which enumerates all tile keys, bounds and hashes, is transitional and must not become the large-scale read contract.

A normal viewport read is addressed by:

- World;
- viewport coordinates;
- scale / representation level;
- optional generation/revision consistency information.

The read service resolves the spatial buckets directly from deterministic spatial addressing. The underlying addressing may use a fixed grid, hierarchical prefix, Morton/Z-order, geohash-like key, or another deterministic scheme; that choice is deliberately not fixed here.

The top-level manifest may remain for Publication integrity, operation, diagnostics and generation metadata, but it is **not required in the Atropos viewport critical path**.

## 6. Fixed spatial frame

Tile/bucket identity must not be derived from the current occupied World bounds.

Adding an Event outside the previous extrema must not shift all existing tile boundaries.

The spatial frame therefore requires stable addressing with a fixed reference frame. Details such as exact L0 size, origin, signed level semantics and key encoding remain open.

## 7. Viewport read contract

The normal read contract is viewport-oriented, not asset-list-oriented.

Atropos supplies the World, viewport and scale. The read layer resolves all spatial buckets intersecting the requested coverage and returns the relevant representation metadata as one logical response.

The server is a thin spatial resolver/assembler over immutable Publication buckets. It must not reconstruct the domain graph or perform World-semantic layout work at read time.

The target normal request shape is conceptually:

```
World + viewport + scale
  -> deterministic spatial bucket resolution
  -> representation metadata response
```

Pan reads should be able to request only newly entering coverage.

## 8. Two-phase representation and geometry read

Geometry remains separable from representation metadata.

A viewport response should contain enough information for Atropos to:

1. deduplicate representations;
2. apply active Collection filtering locally;
3. apply LOD/visibility state;
4. deduplicate geometry references;
5. remove geometry already present in the local immutable cache;
6. request only the missing geometry needed now or soon.

A second geometry round trip is acceptable and intentional.

The desired steady-state behavior is:

- cold viewport: representation read + active geometry read;
- warm viewport: representation read, with geometry commonly satisfied from cache;
- Collection toggle: normally zero network requests, with at most a missing-geometry read when newly visible representations are not cached.

Geometry references should remain immutable/content-addressable where practical so the same geometry can be reused across buckets and cached independently.

Whether small geometry is inlined and the precise inline/external threshold remain open.

## 9. Geometry lazy loading and buffer

Geometry is fetched according to representation visibility, not merely because its entity is present in the spatial index.

Representations are conceptually divided into:

- **active** — geometry is needed for the current rendered state;
- **buffered** — geometry is not currently rendered but is likely to be needed by a nearby pan/zoom/LOD transition;
- **dormant** — geometry is outside the useful spatial/LOD buffer and is not fetched.

For example, when a Composite is currently represented as a point, its hull geometry does not belong on the critical path. It becomes eligible for background prefetch as the camera approaches the point-to-hull transition.

The buffer applies in both spatial and scale dimensions.

Buffered fetches must not block the active scene and may be aborted when navigation changes direction.

## 10. Collection selection

Collection selection is an Atropos visibility/filter operation over already fetched representation metadata.

Changing active Collections must not trigger domain-graph traversal, Publication recompilation, or Collection-specific spatial reads.

Representation metadata therefore carries sufficient Collection membership information to filter locally before geometry fetch.

The exact encoding of Collection membership is open. Repeated UUID arrays are transitional; compact dictionaries/bitsets or another bounded representation may be adopted later.

## 11. Semantic LOD ownership

Lachesis owns World-stable semantic representation decisions and materializes the information needed to express them.

Atropos owns viewport-local interpolation, visibility evaluation and interaction.

The division must preserve the existing semantic behavior:

- Composite may transition between point and hull;
- children may become visible/invisible according to semantic LOD;
- labels and relations may have scale-dependent visibility;
- prepared representations may crossfade/interpolate rather than forcing geometry regeneration.

Atropos must not traverse the domain graph to recover these decisions.

## 12. Read request budget

The current production prototype demonstrated that a broad 30-Collection cold viewport could require about 11 Render API calls. This is not the target architecture.

The target is:

- normal cold viewport: approximately **2 critical round trips** — representation metadata and missing active geometry;
- warm viewport: approximately **1 critical round trip**;
- Collection-only visibility change: **0 critical round trips** in the common case;
- buffered prefetch may add non-blocking requests.

Request count is a first-class performance constraint. Asset-count batching limits such as the current fixed 16-asset batch are transitional and should not dictate the architecture.

## 13. Current payload observation

The current production Render generation is small enough that geometry byte volume is not considered the primary bottleneck:

- the measured complete Render generation was approximately 1.9 MiB at the then-current World size;
- the current manifest was approximately 26 KiB;
- the generation contained tens of tiles and external geometry objects rather than a data volume that can explain multi-second rendering by bandwidth alone.

These measurements do not justify a naive whole-World read contract for future scale. They do justify prioritizing LOD/visibility, request orchestration and bounded viewport working sets ahead of geometry compression.

Exact geometry size-distribution work remains useful for future packaging decisions but is not a prerequisite for the architecture above.

## 14. Cache and immutability

Render assets for a generation are immutable.

Atropos may retain geometry and representation assets across pan, zoom and Collection changes when their immutable identity remains valid.

A generation/revision boundary must prevent mixing incompatible render metadata with Event detail from another canonical revision.

Cache reuse is expected to be a primary mechanism for making repeated navigation cheaper.

## 15. Invalidated / transitional assumptions

The following current/prototype behaviors are explicitly non-authoritative:

- downloading a global manifest containing every tile descriptor before viewport reads;
- client-side linear scanning of all manifest tile descriptors;
- fixed batching by a small asset count such as 16 regardless of byte budget;
- requiring tile reads before the client can discover every geometry dependency when equivalent metadata can be published more directly;
- spatial Event-count clustering as the default semantic LOD mechanism;
- deriving tile boundaries from each revision's occupied World bounds;
- treating the current external-geometry threshold as a settled architecture decision.

## 16. Open decisions intentionally deferred

This record does **not** decide:

- exact tile/bucket dimensions;
- exact L0 origin or signed level convention;
- geohash vs Morton/Z-order vs another spatial key;
- exact LOD thresholds and per-viewport primitive budgets;
- exact geometry inline/external threshold;
- exact Collection membership encoding;
- exact spatial/scale prefetch buffer size;
- exact compression or binary encoding;
- detailed incremental invalidation algorithm;
- detailed force-layout localization algorithm;
- queue/distributed compilation implementation.

Those choices must be made against this decision record rather than changing its core invariants.
