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
