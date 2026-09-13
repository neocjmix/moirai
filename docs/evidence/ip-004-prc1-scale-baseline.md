# IP-004 PR-C1 — measured scale baseline

Status: instrumentation checkpoint; **Scale is not accepted**. M5 inactive.
Baseline main: `28c1d3757531aa26cc3acc9982bab140fb02178e` (PR #87).
The same SHA was verified on Atropos, Clotho and worker; PR #87 closure and
actual Revision 5 Canon-aware readback are recorded in [PR-B evidence](ip-004-prb2-canon.md).

## Workload and reproducibility

`scripts/ip004-scale-fixture.ts` derives synthetic 100/1,000/10,000 Event Worlds
from the public Joseon fixture plus all four actual semantic input stages.
Each 42-Event group preserves relations, shared Canon membership, composite
boundaries, uncertainty and Narrative/source shapes. Shared time coordinates
exercise dense inferred order across groups. IDs are disjoint from production;
these are synthetic copies, not additional historical assertions or user data.
The generator never commits to Clotho or production PostgreSQL.

`apps/atropos-web/src/lib/ip004-scale.test.ts` builds real canonical Publication
and spatial artifacts, writes a disposable local object store and calls the
actual Atropos initial, Event reading, drawer, spatial, search and full-query
functions/routes. A separate process per size gives cold caches and attributable
peak RSS. This measures application work and object bytes, not S3/network latency.
Initial payload is serialized data/props, **not measured Next HTML or browser render**.

```sh
IP004_SCALE=100 IP004_SCALE_ROUNDS=10 pnpm exec vitest run apps/atropos-web/src/lib/ip004-scale.test.ts
timeout 30s env IP004_SCALE=1000 IP004_SCALE_ROUNDS=10 pnpm exec vitest run apps/atropos-web/src/lib/ip004-scale.test.ts
timeout 30s env IP004_SCALE=10000 IP004_SCALE_ROUNDS=10 pnpm exec vitest run apps/atropos-web/src/lib/ip004-scale.test.ts
```

Recorded runs used the installed Vitest executable directly, avoiding package
manager startup. The timeout is a process budget, not a pure build duration.
The 10k run overlapped a short typecheck/unit run near its end; it is a failure
to complete within that budget, not a precise isolated throughput estimate.

## Results on 2026-09-13

100 Events / 301 Relations / 89 Narratives / 2 Canons:

- Canonical Publication: 387.92 ms, 108 objects, 1,587,150 bytes.
- Spatial input: 5.31 ms; spatial build: 89.64 ms, 20 objects, 1,838,796 bytes.
- Whole benchmark peak RSS: 165,760 KiB, including artifact build and queries.

| Path | Samples | app p50 / p95 ms | Object reads | Artifact bytes | JSON bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial cold | 1 | 18.80 / — | 16 | 1,361,074 | 790,890 |
| Initial warm | 10 | 2.79 / 4.37 | 3 | 25,791 | 790,890 |
| Event reading | 10 | 1.04 / 3.84 | 3 | 33,083 | 7,622 |
| Drawer cold | 1 | 10.95 / — | 1 | 8,313 | 13,107 |
| Drawer warm | 10 | 1.19 / 1.92 | 1 | 8,313 | 13,107 |
| Spatial cold | 1 | 13.11 / — | 12 | 652,291 | 26,453 |
| Spatial warm | 10 | 3.03 / 5.33 | 0 | 0 | 26,454 |
| Narrative search | 10 | 2.00 / 6.67 | 3 | 85,427 | 2,073 |
| Full Graph query | 1 | 50.03 / — | 108 | 1,540,062 | 393,109 |

Ten-sample nearest-rank p95 is exploratory (the maximum here), not a production
SLO estimate. Initial warm serialization/parse p95: 4.04 / 2.19 ms.
Warm spatial zero reads is existing revision-scoped reuse; instrumentation tests
verify nested route reads propagate to the outer measurement.

Both 1k and 10k exited 124 under the 30-second process budget after emitting
`canonical_publication_start`, before canonical Publication completion. Their
query latencies and payloads are **unmeasured**, not zero or passing.

## Instrumentation and next measured change

The four Graph POST routes return allowlisted `Server-Timing`: application wall
time, summed Publication I/O time, read attempts and UTF-8 object bytes. Parallel
I/O durations overlap and can exceed wall time. No IDs, text, credentials or
cache entries are emitted. AsyncLocalStorage metrics live only for the request;
concurrent-request isolation and nested-read accounting have regression tests.
No cache, source-of-truth or publication-access policy is introduced.

The temporal solver's all-pairs loop constructs and sorts witness unions even
when an existing edge makes the candidate unusable. PR-C2 will first measure
eliminating that discarded work while preserving exact closure/witness output.
The full-query 108 reads at 100 Events and large initial props are separate
measured follow-ups. No Redis or new provider is justified by this checkpoint.

The existing 100k geometry reader test passed in the full local suite. It verifies
bounded spatial exploration, not 100k canonical Publication throughput. Large
World browser/network/resource acceptance and production timing remain open.

Validation: root strict typecheck; 242 unit tests passed, two explicit opt-in
tests skipped; the opt-in 100-Event workload passed independently. Full CI,
deployment and public timing verification are required for this checkpoint.
