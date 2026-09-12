# M4.6 acceptance evidence

## Published runtime

E PR #60 merged as `2ec049c6156d37f65bd28c283cd39ebe5fc99a07`.
CI `34697184638` passed all quality, PostgreSQL, build, audit, secret and WebKit
jobs. Post-deploy smoke `34697294593` passed. The default production `/graph`
now displays Moirai Publication rather than the URDR mock fixture.

Direct production browser inspection found Graph Scope Observatory, four Canons,
and the actual `Signal detected` Event. Its sheet displayed Revision 4, stable
Event ID `019f4c00-0000-7000-8000-000000000201`, Canon membership, relative-only
time evidence and the `precedes` / `causes` Relations. Clotho `world_get` at
Revision 4 independently returned current/target/served Revision 4 and `ready`.
No canonical data was changed for this acceptance read.

Direct clicking identified a host integration issue: the original sheet drag
captured pointerdown on the new same-site link. PR #61 isolates pointerdown on
that link only; the E2E now clicks it rather than navigating to its copied href.
The original viewport gesture and layout algorithms are unchanged.

## Scale and interaction protocol

`moirai-scale.spec.ts` bakes 100,000 synthetic precomputed points into the original
spatial artifact format. Its network harness replaces only the artifact storage
input and runs the production spatial reader. The browser receives bounded
responses through its ordinary loader, pans and wheel-zooms using native inputs,
and must encounter new points without downloading the entity index or semantic
sidecar. Assertions limit each response to 500 cells and 1 MiB. Response counts,
bytes, object reads and a mobile screenshot are attached to the CI result.

This verifies artifact reading and browser loading, not quadratic force-layout
generation at 100k or real canonical membership for those synthetic points.
The real Publication, identity, membership and navigation flow is covered by the
separate E2E and the production observation above.

`urdr-pinch.spec.ts` uses WebKit's native held mouse pointer and native touch
pointer, followed by a DOM move of the active touch, to exercise the original
two-pointer handlers and pointer capture. It checks that both viewport spans
decrease. No application handler or capture method is replaced. This is
automated two-pointer integration coverage, not a physical iPhone test.

## Retained backlog

- Original temporal cluster bound defect: issue #57; no solver change.
- Unsupported/unplaced Composite geometry remains explicit; no invented dates.
- Existing shared composer direction/Subject filter limitations remain deferred,
  as recorded in the E evidence. All surfaces continue to use the shared query.

On `412cf409ed48c77550cd33a570cc2b362f3bfd2e`, direct production browser
clicks completed Event selection → stable Event page → Return to graph. The
restored sheet retained the same ID, Canon and Revision 4. A public spatial POST
returned HTTP 200, 8,863 bytes, one object and the real Signal point; repeating
the request reused the immutable cache. Three unplaced Events remained explicit.

The first F CI stopped before browser execution because the ESM test runner
could not resolve a directory import in the production reader. PR #62 makes
that import an explicit index path. Local test discovery and all six reader
tests, including the distant 100k viewport, pass.

Final F CI, deployed SHA and smoke are pending.
M5 remains inactive.
