# M4.6-C preserved layout conflict

Status: reproduced; C is not accepted or wired into production.

Pinned source: URDR `0267c8fd081ca9a3cd556f8f7319c600248c3760`,
`shared/domain/src/chart-plane-projection.ts`,
`redistributeCandidateClusterYears`.

## Reproduction

The test `reproduces the pinned producer moving a bounded Event outside its own
interval` in `packages/graph-presentation/src/urdr-chart-plane.test.ts` calls the
copied producer with original Gregorian anchor inputs. It passes no Moirai
pre-resolved extent or constraint option.

- A has interval [2004, 2006].
- B has interval [2000, 2010].
- A PRECEDES B.
- Board midpoint is 2005; original year spacing is 140.
- Original output A.y is approximately -588, hence displayed year 2000.8.
- A is therefore outside its own interval, although a valid ordered placement
  inside both intervals exists.

The producer forms a cluster-wide union [2000, 2010], applies 8% padding, then
distributes its topologically ordered candidates across that union. It does not
intersect each final candidate position with the candidate's own interval.

This is a characterization test of an existing defect, not a passing M4.6
semantic acceptance test. Golden parity and the original force constants remain
unchanged. The draft Moirai seam rejects out-of-bound output instead of publishing
false temporal geometry.

## Decision boundary

M4.6 §2.1 requires preserving this producer and explicitly requires separate user
direction after reproducing defects. The same plan requires positions inside
their allowed temporal intervals. Both cannot hold for this input without a
bounded exception to producer parity. No accepted semantic requirement has been
weakened and no renderer, force constant or spatial-query rule has been changed.

Recommended next decision: permit a narrowly scoped, separately tested correction
to temporal cluster redistribution that respects individual bounds and temporal
edge constraints. Keep the renderer, free-X force, gestures, band splitting and
spatial loader unchanged. A simple per-point clamp is insufficient because it can
violate strict ordering; feasibility and ordering need acceptance tests together.

## Checkpoint scope

A and B were merged in PRs #54 and #55. C currently contains copied producer and
band/object-document functions, parity tests, and an incomplete semantic-layout
seam. Immutable publication integration, spatial runtime loader, actual data
wiring and 100k acceptance remain unfinished. `/graph` still uses the mock loader.

Clotho was reused after the initial successful connection. No reconnection loop,
canonical write, synthetic Time System insertion or production data reset was
performed to accommodate the viewport.
