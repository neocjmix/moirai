# IP-004 PR-C2d — bound Event detail reads before composition

Status: PR #92 merged as `8fd6973e4d681495f08e5d4204ce5e6ce498738c`;
PR CI `34782925865` passed, all three Railway services SUCCESS. Public status
reports this SHA and Graph baseline rendered. IP-004 active, M5 inactive.

The measured public full-query path read 10,008 immutable objects for a 10,000
Event World even though its response budget was 1,000 Events. Filter and stable
ID selection now run on the Canon's Event summaries before fetching Event detail
documents. Each World contributes at most the query's global Event budget;
the final World-qualified sort and global cap remain in force. Omitted records
produce partial/truncated output and the existing narrower-scope hint.

No canonical object, publication artifact, renderer or layout changes. Composite
projections only attach to selected Events. Relations are checked again after
the final global Event cap so a dropped World's persisted endpoints cannot
remain in the response. Canon N:M membership and pinned historical Revision
selection remain covered by the existing tests.

Failing acceptance before implementation: reversed 1,000-Event input with an
atomic filter and budget five fetched all 1,000 documents. It now reads exactly
the first five matching IDs. A separate two-World test reproduced relations
surviving after their World was dropped by the global cap; it now passes.
All 18 relevant publication/composition/detail tests, strict Next typecheck
and changed-file lint pass locally.

The same synthetic 10k fixture derived from the public Revision 5 knowledge
patterns was rebuilt and exercised through the actual Atropos functions and
route handlers, without production writes. The five-round run passed; the full
query is a single sample, not a p95 estimate:

| Full query metric | PR-C2b baseline | Bounded reads |
| --- | ---: | ---: |
| Immutable object reads | 10,008 | 1,008 |
| Artifact bytes | 93,850,294 | 48,011,417 |
| Application time | 2,500 ms | 631 ms |
| Response JSON bytes | 10,446,808 | 3,523,334 |

Runs use local immutable filesystem artifacts, not S3 network latency. Remaining
48 MB primarily includes whole Canon and temporal artifacts: this is not a claim
that every read is fully windowed. The builder's peak RSS was 2,149,784 KiB and
the separate read process peaked at 1,189,996 KiB. Existing retained caches still
need byte accounting and a measured resource policy before Scale acceptance.

Reproduction: `IP004_SCALE=10000 IP004_SCALE_ROUNDS=5 IP004_SCALE_KEEP=1 pnpm exec
vitest run apps/atropos-web/src/lib/ip004-scale.test.ts`. The logged artifact
directory can be supplied as `IP004_SCALE_READ_DIR` for read-only reruns. Fixtures
are synthetic; these measurements do not substitute for connected Clotho E2E
or the remaining genuine independent LLM-session refinement.

Public Revision 5 POST readback passed: source-critical search returned the one
existing Event, detail returned its reader data, and full query returned 200.
Server application timings were 433 / 409 / 626 ms for search/detail/query;
external wall times were 11.0 / 9.9 / 11.8 seconds and remain separate. The actual
42-Event World is below the 1,000-Event cap, so its full query still reads 50
objects; the 10k improvement must not be attributed to this small-World sample.
Main CI `34783117455` and its post-deploy smoke are tracked separately.
