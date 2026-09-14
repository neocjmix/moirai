# IP-004 PR-C3 — measured query reuse and bounded cache retention

Status: PR #93 merged and deployed as `c687fe94e751999d2df54d78abe94db188b34fbd`.
All three Railway services SUCCESS. PR CI `34783354536`, three-scale workflow
`34783354524`, main CI `34802375906` and post-deploy smoke `34802541817` passed.
Public verification is recorded in the [gate evidence](ip-004-gate-status.md).
IP-004 active, M5 inactive. This extends measured PR-C2 improvements, not canonical
semantics, storage authority or the Graph renderer.

## Why these changes

The 10k warm initial read remained about 558 ms after payload/read-budget fixes.
Inspection found a complete temporal/scope lookup and Narrative scan per Event.
Per-composition indexes reduced it to 152 ms. First-match order is preserved.
The full 1k query JSON remains SHA-256
`482e67153dd8449c88b73645fcf46d15208c04dbdad75335ad55b13c1820a768`, and the
previous full spatial-bundle hash also remains unchanged.

Repeated reader requests still recomposed the same immutable input. A bounded
reader-result cache reduced 10k warm initial read to 19.31 ms p50 / 46.82 ms p95
in ten local samples. A separate immutable-object cache addresses the measured
production S3 read cost: PR-C2a observed 7.89 seconds of application time and 50
object reads for the small actual World. Object-read instrumentation now counts
physical misses; aggregate cache hits/misses/evictions are reported separately.
No Redis, external provider, paid tier change or canonical write was introduced.

## Cache contract

| Cache | Key and scope | Retention limit |
| --- | --- | --- |
| Validated Graph revision | World + served Revision artifact prefix | 32 entries / 128 MiB accounted weight |
| Spatial query context | URL contract version + complete query including World/Revision/Canon/filter/scope/frame/budget; focus excluded | 4 entries / 128 MiB |
| Reader composition | composition version + complete query + World/Revision/Canon and validated snapshot instance identity | 16 entries / 32 MiB |
| Immutable object | configured-store namespace (or exact local fixture root) + complete World/Revision object key | 2,048 entries / 16 MiB |

Weights use V8 serialization plus UTF-8 key bytes. The sum of these retained-data
budgets is 304 MiB; it is **not an RSS guarantee**. Parsed object overhead, active
requests, transient buffers and garbage collection are measured independently.
Least-recently-used entries are evicted; oversized values are read normally and
not retained. Pending-map metadata is entry-bounded. Failed builders are removed,
and missing/non-200 immutable objects are never cached.

Canonical PostgreSQL remains durable source of truth. The immediate read source
is the immutable Publication artifact, rebuilt by the existing publisher. A
cache miss/restart/eviction rebuilds from those artifacts. Neither canonical
writes nor Publication completion depend on a cache purge.

`current.json` and World discovery always bypass object caching. Advancing the
pointer selects a new Revision key; explicit historical URLs continue to read
their requested old Revision. Reloading a validated snapshot also changes its
reader-cache instance identity. Failed-source results bypass reader-result
caching, so a same-Revision retry can recover. No cross-Revision stale fallback
or global mutable entity lookup is added.

RM-001 review: current published artifacts are public. These caches do not grant
access and must remain behind any future authorization/audience check; a future
private Publication policy would require an explicit audience/revocation design.
This slice does not implement or choose that deferred policy.

## Resource and acceptance budgets

The measured ten-round 10k read process peaked at 1,784,116 KiB; retained cache
weights were about 43.3 MB revision, 98.8 MB spatial context, 3.68 MB reader result
and 16.1 MB objects. These figures are not equal to retained heap or production
RSS. Actual Railway metrics reported existing 8 GB limits for Atropos and worker;
no limit or replica count was changed. Their small actual Revision 5 workload
uses much less memory than the synthetic 10k workload.

Budgets are fixed after the recorded baseline and enforced in the reproducible
scale workflow. They apply to the local immutable store / actual Next-WebKit CI
environment; public WAN/proxy time is reported separately.

| Path | Application p95 budget |
| --- | ---: |
| Initial cold / warm | 3,000 / 500 ms |
| Drawer cold / warm | 2,500 / 100 ms |
| Event reading page data | 100 ms |
| Spatial cold / warm | 2,000 / 750 ms |
| Narrative search | 500 ms |
| Full bounded query | 2,000 ms (single sample) |

Browser Graph-ready budget is 8 seconds and drawer budget 5 seconds. Builder
budget is 180 seconds; independent builder/read peak RSS budgets are 3 GiB each.
The existing 100k spatial fixture still enforces bounded geometry loading.

Tests cover LRU/byte/oversize behavior, failed-read recovery, pending coalescing,
World/Revision/Canon key separation, query-filter and snapshot changes, mutable
pointer updates, old/new Revision reads and missing-artifact retry. All existing
canonical/Graph regression gates remain required. Scale YES still requires the
same-head CI/browser and deployed public verification below; synthetic checks
cannot close the genuine new-session Clotho semantic acceptance.

## Same-head CI results

Ten server samples per warm path; browser and full-query values are single
samples. All fixed acceptance budgets passed without changing their thresholds.

| Events | Warm initial p95 | Event read p95 | Spatial warm p95 | Full query | Graph ready | Drawer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 2.68 ms | 3.67 ms | 14.52 ms | 50 ms | 1,869 ms | 375 ms |
| 1,000 | 6.19 ms | 2.08 ms | 34.74 ms | 320 ms | 2,223 ms | 384 ms |
| 10,000 | 42.61 ms | 5.19 ms | 219.51 ms | 810 ms | 3,091 ms | 1,176 ms |

10k builder total: 92.7 seconds, peak RSS 2,115,212 KiB. Separate read process
peak: 1,250,452 KiB. Reader cache recorded ten hits after one miss; immutable
objects recorded 239 hits, 1,056 misses and 52 evictions, staying below its
16 MiB weight cap. Warm drawer reads required zero physical object reads.

The fixture intentionally repeats public knowledge patterns to exercise dense
geometry and N:M semantics. Its compressed byte size is not a promise for all
natural-language corpora; decoded HTML and resource measurements are retained
alongside wire size. The 100k check covers bounded spatial geometry, not a full
100k canonical publisher/browser workload.
