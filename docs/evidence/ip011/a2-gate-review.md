# IP-011 A2 gate review — 2026-09-24

A2 exit passed on the named migrated clone at Revision 31 after PR #186's CI and deployed worker check. This review separates inactive v5 code, disposable PostgreSQL CI, the migrated production-snapshot clone, and operational v4. The production schema/content and `current.json` have **not** been cut over; that is A3.

## Gate status

| Gate | Evidence | Status |
| --- | --- | --- |
| Owner-full source inventory and recovery | Owner read includes withdrawn rows, 001–009 ledger, all installed Worlds, handles and locales; encrypted 19-table backup restored with schema/row/sequence digest equality; `a2-execution.md` | Passed for the recorded Revision 30 snapshot; refresh at A3 write freeze |
| ID, Narrative and history mapping | Preservation manifest, clone migration Revision 30→31, 127 Event/6 Collection/415 active Relation/153 membership/133 target Narrative, legacy Revision and Rev31 replay; six actual Event IDs and semantic review below | Passed on named clone; similar titles were not automatically merged |
| World union invariants | Clone migration and `assertV5CanonicalState`, complete Publication candidate coverage including 125 placed and 2 unplaced Events | Passed at Rev31; later live writes require A3 recheck |
| Target writer and older-agent refusal | Inactive strict v5 schema, policy guard and HTTP/MCP tests reject v4/Canon-specific payloads; live v4 ingress remains active | Passed as isolated contract; actual old writer refusal is A3 cutover gate |
| Candidate reuse context | PR #181 strict World read, pinned Revision, paged owner Narrative/sources, memberships, relations and bounded neighbor previews; CI run 36013761750 including disposable PostgreSQL; named-clone `rehearse-detail` and six-case `rehearse-scenarios` at Revision 31 | A2 passed: bounded detail, distinct cases and explicit zero-title-hit limitation |
| Content export and historical import | Actual clone ZIP64 v5 content round-trip and Rev30/Rev31 replay; v4 owner-full encrypted backup/restore | A2 migration-specific recovery and conversion passed. Standalone TS-007 owner-full v5 package/import remains unimplemented, not a property of the content ZIP |
| Complete Publication and mobile navigation | Clone complete candidate, repeatable digest and synthetic mobile WebKit shared Event/Collection/Composite/unplaced scenario | Passed as A2 rehearsal only; no storage/pointer write and no production v5 serving |
| Read cost at large scale and discovery | 127-Event clone 48 pages/38 max object reads after #174 rawLimit change | A4/A5, not A2 exit |

## Eight-pass consistency check

1. **Reconstruct:** The operational service is v4; v5 routes/writer/reader are staged and not registered in live ingress. #181–186 have passed CI; #186's worker ran the named-clone scenario audit at Revision 31. This is not production v5 serving.
2. **Model:** World owns Event identity, Relation and Revision; Collection is a selection/membership; Event has one Narrative. A detail read requires the exact World and latest Revision.
3. **Contradiction search:** A title hit alone cannot prove reuse, and the zero `일본사` title match cannot prove absence. `event.get` now supplies bounded evidence; it does not make the semantic decision. A v5 content ZIP does not preserve the entire owner ledger, so a separate full-history portability claim would contradict the backup evidence.
4. **Scenario test:** CI exercises wrong World, stale Revision, strict v5-only input, Unicode Narrative paging, citations, adjacent Event, multiple relation pages and separate Worlds with compatible time definitions. The actual clone read six fixed Events and broadened title queries across Joseon, Imjin and Japanese history, found 26 shared Events and 143 distinct `contains` Relations whose parent and child share a Collection. There is exactly one installed World, so actual-data cross-World coverage is false; the synthetic World-isolation regression supplies that contract gate. Existing migration/Publication proofs cover hidden Composite children and unplaced Events. The nine served end-to-end scenarios belong to A3.
5. **Minimality test:** Detail queries fetch one Event/Narrative, up to 16 memberships, 16 relations, 32 neighbor previews and eight references per page. No new global entity index or search service was added. Relation lookup can scan a World's rows and is subject to A4 scale measurement.
6. **Implementation feasibility:** PostgreSQL integration/HTTP/MCP/CLI parity passed CI. After explicit action-time approval, the worker at `c2d0ce1b027c2217db69b10a69701e2ea8855d98` ran detail: Danjong 1 membership/14 relations, Imjin 2/12, both one page. The first scenario command failed because the audit itself passed a two-character search term to a >=3-character contract; PR #185 narrowed the sanitized phase, PR #186 fixed the query. CI run 36073589105 passed all three jobs. At deployed worker `b2dbc64e07f0085ce330caf2ec3c6d6f7e93702d`, the corrected scenario returned success at Revision 31 with source/pointer writes false. This is execution evidence, not a proof of production v5 cutover.
7. **Plan consistency:** IP-011 §4 assigns migration-specific before/after, legacy reader and round-trip to A2/A3, while general revision diff/export-import UX is later M5. The A2 proof is full v4 physical backup→fresh clone→v5 schema/content conversion→Rev30/31 replay plus v5 *content* ZIP round-trip. This does not satisfy TS-007's general owner-full v5 package/import acceptance suite and cannot be used as one after A3 v5 writes. A3 requires a fresh owner-full physical backup and restore plan at write freeze; no post-v5-write rollback assertion follows from this A2 snapshot. A3 also owns live migration, old writer refusal, v5 ingress/worker and served pointer. A4 owns 1k/10k/100k latency and bounded cold cost; A5 discovery; A6 new historical authoring.
8. **Adversarial review:** Do not infer source integrity from a clone-only connection guard, infer production readiness from CI, infer semantic duplicate absence from title queries, or infer byte identity of #173 output from later digests. The #173 versus #175 page/read difference is explained by #174 rawLimit 4→16, not nondeterminism at one code version.

## Actual-data scenario disposition and next gate

- The named-clone `rehearse-detail` command passed at deployed SHA; its existing trigram index was verified, not recreated. This is a read of the clone, not an independent source digest or a semantic-duplicate decision.
Actual clone detail at Rev31 (one page and nonempty single owner Narrative for each):

| Case | Event ID | Memberships | Relations |
| --- | --- | ---: | ---: |
| 계유정난 | `019f5b00-0000-7000-8000-000000000115` | 2 | 9 |
| 세조 즉위 | `019f5b00-0000-7000-8000-000000000116` | 2 | 11 |
| 단종 폐위 과정 | `01a0c40a-a761-7fc7-aef2-10211e0ecb0e` | 1 | 14 |
| 임진왜란 | `019f8c00-0000-7000-8000-000000001000` | 2 | 12 |
| 오닌의 난·전국시대 | `01a0c8c3-544c-725e-a664-d7966e1e0748` | 1 | 2 |
| 세키가하라 | `01a0c8c3-544d-7058-8150-16d9ee2e0fc0` | 1 | 5 |

Each valid title query returned the corresponding fixed ID. Twenty-six Events have membership in more than one Collection; the first-twenty sample includes 계유정난, 세조 즉위 and 임진왜란. `contains`/Collection overlap is 143 distinct Relations. No source DB or pointer write.
- Reviewed preservation mapping distinguishes the 1453 권력 장악 (계유정난) from 1455 강요된 양위·세조 즉위 and the 1452–1457 단종 과정 Composite; they share actors but are not title duplicates to merge. 임진왜란's one World Event is selected in two Collections while its single Narrative retains multiple perspectives. The 1467–1477 오닌의 난/전국시대 전개 and 1600 세키가하라 전투 have separate IDs/time/roles. This is a preservation judgment on the recorded source and target, not independent external historical fact-checking or proof that every semantic duplicate in a World is absent.
- A2 exit therefore covers the recorded snapshot, migration mapping/invariants, target contract, bounded authoring reuse context, content/history conversion, complete in-memory Publication and synthetic mobile navigation. A3 must refresh the owner-full backup and Revision under write quiesce, migrate live schema/content, reject old writers, validate target/served and nine end-to-end scenarios before moving the pointer. A4/A5/A6 retain their separate exits.
