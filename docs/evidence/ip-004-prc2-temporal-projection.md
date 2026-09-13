# IP-004 PR-C2a — temporal projection work

Status: measured improvement, **Scale remains open**. M5 inactive.

## PR-C1 deployed checkpoint

PR #88 merged as `9351bd0580027ee0172e239090bd39d26dec7dc4`.
Final PR CI `34779293709`, main CI `34779467101`, post-deploy smoke
`34779578358` passed. Initial CI found fixture imports that root typecheck
resolved but the Next application did not; explicit relative package imports
fixed both the application typecheck and mobile build, without weakening gates.

Railway SUCCESS at that SHA:

- Atropos `efb781dc-c9c3-4fd1-92e7-de3ebf2d831c`.
- Clotho `2efe326c-c161-4553-b4b1-f865bf492483`.
- Worker `53a5abf1-bbab-463d-b78d-cacd2bc96553`.

Public health/status reported that SHA. Browser reloaded Graph, retained its
baseline chart, and found one 훈민정음 반포 by `사료비판`. Island showed the matched
interpretation Canon and both memberships; the Graph Event drawer retained its
1446 range, qualified Narrative and public source. Initial browser navigation
was slow; this observation does not establish an acceptable initial-load SLO.

`scripts/ip004-public-query-timing.ts` reproduced actual R5 public reads:

| Request | Network wall ms | Server app ms | Summed object I/O ms | Reads | Object bytes | Response bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Narrative search | 10,579 | 183 | 180 | 2 | 38,675 | 848 |
| Event drawer | 11,129 | 872 | 870 | 1 | 8,495 | 13,121 |
| Full Graph query | 17,922 | 7,888 | 26,826 | 50 | 559,834 | 453,868 |

One sample each; no p95 claim. Concurrent reads explain summed I/O exceeding
wall time. The approximately ten-second external overhead is not attributed
to application CPU. The full query's 50 object reads are a separate follow-up.

## Diagnosis and exact-output preservation

A 20-second V8 sample of the 1k workload after skipping discarded solver
witness unions showed repeated relational-time proof traversal as the largest
JavaScript contributor (3,295 / 18,290 ticks directly in that function, plus
its string/lookup operations). It scanned all constraints for every visited
node and every candidate Event within every complete composite.

The improvement indexes ordered outgoing constraints, computes one forward
proof tree for a composite start and one reverse distance map for its strict
end. Forward reconstruction keeps the original BFS shortest path and ordered
tie breaking. Maps are local to one projection/composite, never a global
mutable World cache. No accepted temporal meaning or version is changed.

The solver also indexes coincidence evidence and Event constraints, skips
empty right-edge rows, visits existing targets in the same lexical order, and
avoids allocating witness unions that cannot replace an existing edge.

Verification preserves evidence as well as dates:

- 80 deterministic mixed graphs compare every pair against the frozen old
  proof traversal, including cycles, strict/non-strict paths and coincidence.
- 100 mixed solver graphs reproduce an independently measured old-solver
  SHA-256: `70520345d7adcfaf73af332ec70014ec195485202e2b8c30c13d083c710feae5`.
- The entire 100-Event Publication byte stream retains pre-change SHA-256
  `52546ffdad4a8cce99bf64cad78ca59f3e7fb1ec74140f132a13fad04e4565f9`.
- Existing temporal corpus, contradiction, membership and Graph tests pass.

## Measurements and remaining limit

1k full workload after the change:

- Canonical Publication 1,035 ms, 1,008 objects, 11,982,939 bytes.
- Spatial Publication 2,775 ms (input 33 ms), 16,776,810 bytes.
- Initial cold 118 ms; warm p50/p95 19/30 ms; serialized props 5,284,063 bytes.
- Event reading p50/p95 1.43/3.00 ms; drawer warm 2.11/3.21 ms.
- Spatial warm 18.60/23.82 ms, zero existing-cache object reads, ~26 KB payload.
- Narrative search 11.09/16.21 ms, 21 reads, 840,167 artifact bytes.
- Full query 286 ms, 1,008 reads, 3,175,498 response bytes.
- Peak RSS for the whole local workload 401,872 KiB; ten warm samples per path.

At 10k, canonical Publication completed in **53,576 ms**, with 10,008 objects,
98,561,798 bytes and 1,756,812 KiB peak RSS by that point. The 60-second process
budget expired during subsequent spatial work. Full 10k read and browser
measurements remain unverified. This is not a production-ready resource bound.

Measurement correction: the first PR-C1 runner used Vitest-buffered console
output for phase completion. Its timeouts prove the workload did not finish,
but missing completion output alone cannot locate the exact phase. CPU samples
independently confirmed substantial canonical projection work. Phase completion
now writes directly to stdout, and the 10k figures above use that correction.

Next: profile spatial construction while preserving the frozen Graph layout;
reduce measured full-query object reads and initial props; measure complete
10k server/network/browser behavior. No Redis or new infrastructure added.

Validation at this checkpoint: root and Next strict typechecks, lint, 245 unit
tests passed / two opt-in tests skipped; separate 1k workload passed. Full CI
and deployed build verification follow. Product final review and genuine new
LLM-session semantic acceptance are still required.
