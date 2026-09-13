# IP-004 PR-C2b — identical spatial output with indexed force work

Status: complete 10k workload measured; **Scale acceptance remains open**.

PR #89 deployed as `b2e2845324ca427ca417f949de7f90a266ac85a9`.
PR CI `34780018113`, main CI `34780163568`, smoke `34780301572` passed.
Railway Atropos `f294c3de-798d-4465-8571-53f07179a3ad`, Clotho
`1f9a587e-fb44-4af4-be20-f493b5038b2d`, worker
`47859ed9-958a-4e68-b7b0-61e1d7b97012` were SUCCESS at that SHA.
Public health/status identified the build, and all five actual R5 semantic
readback tests passed (both Canons, exact Event identities/memberships, temporal
relations, Narratives and public sources). Immutable R5 data was not rewritten.

## Measured producer bottleneck

The 1k V8 profile recorded 909 / 4,268 ticks directly in
`optimizePointXPositions`, 893 in string equality and 670 in locale comparison.
The producer rescanned all force edges for each node on every iteration, and
repeated invariant lexical comparisons for coincident x positions.

The change indexes incident edges in their original order and assigns lexical
tie ranks once (including equal-collation classes). Repulsion pairs, force
addition order, iteration count, cooling, step limits and renderer remain the
same. No approximate force algorithm, changed layout or geometry budget.
Original port provenance: `neocjmix/urdr@0267c8fd081ca9a3cd556f8f7319c600248c3760`,
`shared/domain/src/chart-plane-projection.ts`; Moirai's semantic boundary remains
in `semantic-layout.ts`.

The complete pre-change 1k spatial bundle SHA-256 is frozen in a regression:
`a30b317ecf7c66d4ee781f11068b45e8c3334b16cd5b1c6be44002efc9f91314`.
Every artifact byte, coordinate and digest remains identical after the change.
1k spatial generation fell from 2,775 ms to 654 ms in exploratory local runs;
the latter overlapped the compatibility test, so this is not a controlled SLO.

## Complete 10k run

Synthetic World `019f60ac-2710-7000-8000-000000000001`: 10,000 Events,
31,662 Relations, 8,573 Narratives, two Canons; real R5 topology copies.

- Canonical build: 56,298 ms; 98,561,798 bytes / 10,008 objects.
- Spatial input: 1,068 ms; spatial build: 35,675 ms; 166,437,465 bytes / 20 objects.
- Full benchmark: 110.5 seconds, exit 0, one opt-in test passed.
- Peak RSS: 2,606,640 KiB across build and queries; this is still too large to
  claim an economical production resource bound.

| Path | app p50 / p95 ms | Object reads | Artifact bytes | JSON bytes |
| --- | ---: | ---: | ---: | ---: |
| Initial cold (one sample) | 1,653 / — | 16 | 65,803,746 | 6,229,303 |
| Initial warm | 536 / 597 | 3 | 2,233,495 | 6,229,303 |
| Event reading | 11.04 / 16.58 | 3 | 2,240,783 | 7,622 |
| Drawer warm | 10.75 / 13.42 | 1 | 8,313 | 13,109 |
| Spatial warm | 182 / 190 | 0 | 0 | 33,942 |
| Narrative search | 89.51 / 113.65 | 21 | 7,088,889 | 20,469 |
| Full Graph query (one sample) | 2,500 / — | 10,008 | 93,850,294 | 10,446,808 |

Ten warm samples, local filesystem, no S3/network latency. Initial JSON remains
an approximation of client data, not actual Next HTML or browser render time.
The first complete measurement encountered Vitest's RPC timeout after long
synchronous builds. Yielding to the event loop between separately timed phases
resolved the harness failure; the repeated run above passed without ignoring
unhandled errors or relaxing an acceptance assertion.

## Remaining work

Reduce unused initial client data and expensive full-query reads. Bound and
measure cache/resource retention by World/Revision; verify actual large-fixture
browser/network behavior. The existing 100k spatial budget tests still pass.
No new cache infrastructure or paid provider was added. Product final review
and a genuine new-session Clotho refinement remain required; M5 inactive.

Validation: root/Next strict typecheck, lint, 246 local unit tests passed with
two explicit opt-in skips; the separate 10k workload passed. CI/deployment and
public verification follow this checkpoint.
