# Layout Lab v2 — P1 physics

`@moirai/layout-simulation` is an isolated, browser-compatible experiment. It has
no canonical-data, publication, database or legacy-layout dependencies. P0's
restored Force renderer remains the production baseline. No v2 promotion occurs.

## Model and integration

The pinned engine is **d3-force 3.0.0**, using its stopped simulation, many-body
repulsion, link attraction and `forceX` centering. Each node has an explicit
initial X, exact `y = fy`, zero initial velocity and a visual circle radius in
chart-coordinate units. Nodes and links are cloned and sorted by ID using code
point ordering. The explicit 32-bit LCG seed determines initialization and d3
jiggle; these have separate random streams. Caller input is never mutated.

At each manual tick d3 updates `alpha += (alphaTarget - alpha) * alphaDecay`,
applies forces in repulsion → attraction → center → collision order, multiplies
velocity by `1 - velocityDecay`, advances X, and projects Y to `fy` with `vy = 0`.
This follows **standard d3 fixed-position semantics**: an intermediate Y impulse
from many-body/link can enter a later link's predicted separation before the
end-of-tick projection. No Y position is integrated. This is not an independent
custom 1D integrator. All these force calculations may use full XY distance.

The custom collision force is necessary because standard circular `forceCollide`
can spend separation on forbidden Y motion. For overlapping pairs it computes
`requiredX = sqrt((radiusA + radiusB)^2 - dy^2)`, compares predicted X separation,
and divides the remaining X impulse equally between the two nodes. Equal X ties
use canonical ID order. It applies no Y impulse, does not depend on alpha, and
is a soft force: damping or competing forces can leave collisions. Radius is in
input chart units, not automatically a viewport CSS-pixel size.

Link distances are Euclidean. When `abs(dy) > targetDistance`, the target cannot
be reached while Y is fixed; diagnostics count these impossible targets rather
than changing authored time. Link strain is reported by the caller's generic
`kind` label, including disabled links as observable quality constraints. Link
multipliers, when supplied, multiply the independently configurable global link
strength. No Composite/Collection semantic adapter exists in P1.

## Iteration and replay

There is **no final-iteration parameter**. Defaults are constant alpha=1,
alphaDecay=0 and velocityDecay=0.4. Cooling, damping and initial state are explicit
independent settings. d3's timer is stopped immediately and never restarted;
`alphaMin` is not an automatic stopping criterion for manual ticks. `tick(N)`
advances N steps and `seek(N)` observes exactly step N. Seeking backward rebuilds
the deterministic initial state and replays the same prefix. Convergence only
annotates the observation; it never stops a requested run.

`state()` contains algorithm, tick, alpha and ID/X/Y/X-velocity only. Wall-clock
measurements are separate and must not be included in byte equality comparisons.
`exportRun` records complete input/configuration/tick/result and a compact FNV replay
checksum; `importRun` validates and recomputes it. This checksum detects accidental
mismatches, **not malicious tampering or source authenticity**. Source metadata is
caller-supplied provenance, not an authentication claim. Tests compare full state
JSON byte-for-byte, rather than relying on the checksum. Cross-JavaScript-engine
bitwise equality is not claimed without an actual browser comparison.

P1 has explicit limits of 256 nodes, 4,096 links and tick 10,000, independent of the
force schedule. Synchronous JSON import additionally rejects work estimates over
25 million operations; interactive callers should advance in small batches and
allow cancellation between batches. Collision and quality measurement are O(n²),
so this first implementation is intended for small physics fixtures, not a claim
of large-World performance. Public UI uses the 20-node synthetic fixture.

## Measurement and interpretation

Diagnostics report last-tick RMS/max X displacement, RMS X velocity, RMS/max
pre-damping X force impulse, collision count/max penetration, absolute relation
strain by kind, impossible-Y link targets, X variance/span and measured elapsed
simulation milliseconds plus the current diagnostic calculation. Wall time
varies with environment and diagnostic calls do not affect the trajectory.

The rolling window must contain `stabilityWindow` ticks before classification.
Stillness requires **every** max displacement within tolerance. Balance also
requires every pre-damping max force impulse within force tolerance. Stillness
with residual forces is `damping-stalled`; any alpha below 1 is conservatively
`cooled`, never proof of force balance. RMS trend compares the latest and earliest
halves of the window; its absolute value must also be at most half the displacement
tolerance for a stability classification. The fixed thresholds are
configuration, not a layout aesthetic score. A `balanced` state can still contain
collisions, impossible distances or poor spacing. Quality is always separate.

P2 semantic adapters, Composite/Collection cohesion, history ingestion, Y-sweep
paint, full A/B presets and real iPhone 17 acceptance remain future phases.
