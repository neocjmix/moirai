# IP-004 PR-B2 — third refinement and Canon N:M, Revision 5

Actual Clotho commit produced Revision 5; current/target/served 5 ready was
confirmed. Canon-scoped authoring-read defects found by this fixture are fixed
and verified in production. Independent-session acceptance and PR-C remain open;
M5 is inactive.

## Intent, abstraction and recovery

Authorized agent-authored natural language asks for a distinct source-critical
reading while retaining the existing chronicle and all Event identities. It does
not ask for a new World, duplicate Event or mutation of existing titles. The
source-critical Canon interprets the existing book record and explicitly avoids
making its own interpretation official or superior.

Primary public source, reread before planning:
[National Institute of Korean Language](https://www.korean.go.kr/hangeul/origin/001.html).
It distinguishes letter creation from the later explanatory-book completion
record and cautions against claiming a recorded official promulgation ceremony
or substituting the modern commemorative date. The source is paraphrased; old
Event title 훈민정음 반포 is retained while the new Narrative explains its limits.

World `01995c2a-7b00-7000-8000-000000000101`; old Canon
`019f5b00-0000-7000-8000-000000000002`; new Canon
`019f60ab-0000-7000-8000-000000000401`, 훈민정음 — 기록과 해석.
Fixture: `implementation/fixtures/ip004-semantic/04-canon-interpretation.change-plan.json`.

1. Actual Revision 4 bounded context rediscovered the existing process, creation
   and book plus ten relevant Relations. `truncated: false`, `depth_boundary: true`;
   the nearby Sejong period is outside this deliberately scoped adoption.
2. Deliberate stale-write acceptance used Change Set `...000004`, expected
   Revision 3, same intended operations. Actual commit returned `revision_conflict`,
   path `expected_revision`, retryable, `refresh_context`, current Revision 4.
   An exact retry had the same rejection; neither advanced the World or added a Canon.
3. Actual World and affected context were reread at Revision 4. Replanning kept
   the intended memberships and uncertainty; new Change Set `...000005` targets 4.
4. Actual validate: valid, errors/warnings empty, digest
   `3b78c475253316546aa53094548e9e6df5a6bf33fd7ac50f6c4d0905edc17cd4`.
5. Actual commit: current/target 5, initially served 4, non-idempotent first
   application, warnings empty. Later World read confirmed served 5 ready.

## Identity and meaning

- Same 42 Events (33 atomic, nine composite), same 133 Relations; two Canons.
- Process `...0101`, creation `...0102` and existing book `019f5b00-0000-7000-8000-000000000112`
  have membership in both Canons. Each World identity remains unique.
- Ten existing Relations are adopted: the book's lower/upper year bounds and
  process/component, creation bounds, order, start/end and qualified enables.
- Narrative `...0304` belongs to the new Canon as a whole. `...0305` belongs to
  the existing book in that Canon. Old Narratives remain in the original Canon.
- No exact lunar conversion, duration, official ceremony or canonical source
  authority is invented. The new Canon is an interpretation, not a separate World.

## Actual read defect and fix

At runtime `0f55516861b49835a284cf76fdb5dafd36cf3074`, actual Clotho search for
사료비판 returned the book in **both** Canons, although that word occurs only in
the new Canon's Narrative. The Event membership filter was correct but Narrative
text was not filtered by Canon. Bounded context also omitted Narrative `canon_id`,
title/kind and public references, making shared-Event interpretation unattributable.

Two tests first failed on these behaviors, then passed after a minimal read fix:
search filters Narrative Canon; each bounded Narrative fragment retains its
Canon identity, title, kind and public references. Body continuation and the
existing 100-fragment/body-character bounds remain. No canonical model, write
contract, authorization or Publication policy changes. A PostgreSQL-backed
transport assertion verifies the same metadata in the integration suite.

Full local suite: 241 passed, one explicit live-network test skipped. Live
Revision 5 semantic readback passed both Canons' exact Event/Relation identity
sets, fields, memberships, Canon Narratives and affected Event Narratives/sources.
Measured single client-path samples (ms/bytes): World 10,832/1,208; original Canon
9,813/22,952, temporal 9,874/137,063, graph 16,707/446,080; new Canon 9,723/4,260,
temporal 9,926/11,522, graph 11,334/22,887; process 9,558/7,247, creation
10,276/6,811, book 10,041/8,495. These are network/proxy-inclusive readback
samples, not server p95 or scale acceptance. Browser navigation, CI and deployed
Clotho-read verification follow below.

## Production reader and deployed fix — PR #87

Public Island searched 사료비판 and returned the existing book once. Matched Canon
was 훈민정음 — 기록과 해석; full membership showed both Canons. Its Graph Event
drawer opened in the matching Canon and displayed only the source-critical
Narrative and source. The stable Event reading page at Revision 5 displayed both
Canon-labelled readings, both bounded year contexts, shared related Events and
both Canon navigation links. No duplicate World Event was introduced.

[PR #87](https://github.com/neocjmix/moirai/pull/87) merged as
`28c1d3757531aa26cc3acc9982bab140fb02178e` after
[CI 34778196146](https://github.com/neocjmix/moirai/actions/runs/34778196146)
passed, including PostgreSQL, build/audit and mobile WebKit. Main
[CI 34778359114](https://github.com/neocjmix/moirai/actions/runs/34778359114)
and [smoke 34778492487](https://github.com/neocjmix/moirai/actions/runs/34778492487)
passed. Railway Atropos `d44d1483-04f3-4335-8c4d-22122b95aa69`, Clotho
`27d7fa19-417d-46c1-8003-1c36b926b751`, worker
`35c93698-3420-4116-b42f-8d3596428c32` all SUCCESS at that SHA. Public
health/status returned 200, the same SHA and the passed smoke result.

Actual connected post-deploy search at Revision 5: 사료비판 returned **zero**
Events in the original Canon and exactly the existing book in the new Canon.
Actual bounded context returned old book Narrative, new Canon Narrative and new
book Narrative with correct `canon_id`, title, kind and public references. This
closes the observed read defect; it is not a claim of fresh-session acceptance.
