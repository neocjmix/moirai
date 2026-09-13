# IP-004 semantic authoring acceptance

This is an agent-authored, public-history scripted acceptance scenario authorized
by IP-004, not a transcript of additional messages typed by the user. Natural
language lives in each plan's `intent`; context discovery and interpretation are
recorded in the evidence packet. Plans are submitted through the actual connected
Clotho interface, not replayed directly into production PostgreSQL.

The existing public Joseon World is the only authorized connection World. No World
reset or alternate grant is required. Canon and Event identities are reused;
fixed new UUIDv7 IDs make the write and readback reproducible and idempotent.
Never rerun a completed stage with a new Change Set ID. If a concurrent revision
conflict occurs, reread relevant context and author a new plan explicitly.

## Stage 1 — coarse creation

`01-coarse.change-plan.json`, expected revision 1 → resulting revision 2.
Intent: organize letter creation and explanatory-book completion as one process,
reusing the existing Hunminjeongeum record in the Joseon chronicle.

- Read World → Canon list → search **훈민정음** and **창제** at revision 1.
- Search returns existing Event `019f5b00-0000-7000-8000-000000000112`, no creation Event.
- `event.get` intentionally returns depth-zero context; its `depth_boundary`
  is not absence of neighbors. A `context.slice` with `contains`, depth 2 and
  both directions discovers the existing **세종 치세** parent `...0204` and
  retains its Relation `...107f` to the existing record.
- Create one Composite `019f60ab-0000-7000-8000-000000000101`, adopt it in the
  existing Canon, add process→record and Sejong-period→process containment,
  and add one source-linked summary Narrative scoped to the process/Canon.
- Do not manufacture an exact date, a ceremony, a participant-as-Event, a new
  Canon, or a replacement for the existing 1446 identity.

Source: [National Institute of Korean Language](https://www.korean.go.kr/hangeul/origin/001.html).
Its distinction between letter creation and book completion is paraphrased, not
imported as raw text. Grouping these records is explicitly an editorial inference.

## Reproduction

Stage 2 (`02-time-detail.change-plan.json`) is the first progressive refinement:
expected revision 2 → revision 3. It adds a distinct letter-creation Event while
reusing the process and 1446 record identities. Six Relations express containment,
ordering, conservative 1443-inclusive/1445-exclusive Gregorian bounds and the
process's start/end Events. Lunar month precision is not converted into an exact
Gregorian date or duration. Run the same live command below with revision `3`.
See [actual Revision 3 evidence](../../../evidence/ip-004-prb2-time.md).

Stage 3 (`03-motivation.change-plan.json`) is the second progressive refinement:
expected revision 3 → revision 4. It adds a source-linked motivation Narrative to
the existing process and a qualified editorial `enables` Relation from creation
to the existing book record. No Event or Canon is created. Historical purpose
and editorial causal interpretation remain explicitly distinct. Live readback
with revision `4` passed; [Revision 4 evidence](../../../evidence/ip-004-prb2-motivation.md)
also records the real Island Narrative-search defect discovered by this stage.

Stage 4 (`04-canon-interpretation.change-plan.json`) is the third refinement:
Revision 4 → 5. The existing process, creation and book Events gain membership in
훈민정음 — 기록과 해석; ten existing Relations are adopted, not recreated. A
Canon Narrative explains this reading and a book-scoped Narrative distinguishes
the record from a claimed official promulgation ceremony or exact date. The
original chronicle, its Narratives and all World Event/Relation identities remain.
The recovery acceptance first submitted the same intended operations with stale
expected Revision 3 and Change Set `...000004`; actual Clotho rejected it with
`revision_conflict`, current Revision 4 and `refresh_context`. After refreshing
World/affected context, the revised plan uses Change Set `...000005` and Revision 4.
See [Revision 5 evidence](../../../evidence/ip-004-prb2-canon.md).

Read/validate/commit uses the repository Clotho skill and actual contract 4.
Connected tool metadata still advertises legacy `"0.3.0"`; deployed Clotho accepts
numeric `4`. Do not change canonical semantics or auth policy to fit stale metadata.

Run the deterministic acceptance first:

```sh
pnpm exec vitest run scripts/clotho-semantic-acceptance.test.ts
```

After actual commit and Publication propagation, run the explicit public read-only
acceptance. It compares full Event/Relation fields, membership, Narrative bodies
and sources with the authored fixture, and exact identity sets with Graph query:

```sh
IP004_PUBLIC_READBACK_URL=https://moirai-production-8ed1.up.railway.app \
IP004_PUBLIC_READBACK_REVISION=2 \
pnpm exec vitest run scripts/clotho-semantic-acceptance.test.ts
```

Default CI skips that live-network test. Passing the deterministic test does not
establish semantic E2E. Public browser Island/Event/Graph navigation and actual
Clotho readback must also be recorded for each stage. PR-B2/B3 and PR-C remain open.
