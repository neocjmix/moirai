# IP-011 A2 gate review — 2026-09-24

A2 remains active. This review separates deployed inactive v5 code, disposable PostgreSQL CI, a migrated production-snapshot clone, and operational v4. The production schema/content and `current.json` have not been cut over.

## Gate status

| Gate | Evidence | Status |
| --- | --- | --- |
| Owner-full source inventory and recovery | Owner read includes withdrawn rows, 001–009 ledger, all installed Worlds, handles and locales; encrypted 19-table backup restored with schema/row/sequence digest equality; `a2-execution.md` | Passed for the recorded Revision 30 snapshot; refresh at A3 write freeze |
| ID, Narrative and history mapping | Preservation manifest, clone migration Revision 30→31, 127 Event/6 Collection/415 active Relation/153 membership/133 target Narrative, legacy Revision and Rev31 replay | Passed on named clone; semantic duplicate review remains judgment, not title uniqueness |
| World union invariants | Clone migration and `assertV5CanonicalState`, complete Publication candidate coverage including 125 placed and 2 unplaced Events | Passed at Rev31; later live writes require A3 recheck |
| Target writer and older-agent refusal | Inactive strict v5 schema, policy guard and HTTP/MCP tests reject v4/Canon-specific payloads; live v4 ingress remains active | Passed as isolated contract; actual old writer refusal is A3 cutover gate |
| Candidate reuse context | PR #181 strict World read, pinned Revision, paged owner Narrative/sources, memberships, relations and bounded neighbor previews; CI run 36013761750 including disposable PostgreSQL | Code/CI passed, actual named-clone `rehearse-detail` result missing |
| Content export and historical import | Actual clone ZIP64 v5 content round-trip and Rev30/Rev31 replay; v4 owner-full encrypted backup/restore | Migration-specific recovery path passed. Standalone owner-full v5 history package/import is not proved; do not describe content ZIP as an owner-full archive |
| Complete Publication and mobile navigation | Clone complete candidate, repeatable digest and synthetic mobile WebKit shared Event/Collection/Composite/unplaced scenario | Passed as A2 rehearsal only; no storage/pointer write and no production v5 serving |
| Read cost at large scale and discovery | 127-Event clone 48 pages/38 max object reads after #174 rawLimit change | A4/A5, not A2 exit |

## Eight-pass consistency check

1. **Reconstruct:** The operational service is v4; v5 routes/writer/reader are staged and not registered in live ingress. #181 and #182 are deployed as inactive code.
2. **Model:** World owns Event identity, Relation and Revision; Collection is a selection/membership; Event has one Narrative. A detail read requires the exact World and latest Revision.
3. **Contradiction search:** A title hit alone cannot prove reuse, and the zero `일본사` title match cannot prove absence. `event.get` now supplies bounded evidence; it does not make the semantic decision. A v5 content ZIP does not preserve the entire owner ledger, so a separate full-history portability claim would contradict the backup evidence.
4. **Scenario test:** CI exercises wrong World, stale Revision, strict v5-only input, Unicode Narrative paging, citations, adjacent Event, multiple relation pages; the actual clone title queries are only `단종 폐위` and `임진왜란`, while Japanese history requires broader candidate inspection. Existing migration/Publication proofs cover multiple Collection selection, hidden Composite children and unplaced Events. The nine end-to-end served scenarios belong to A3.
5. **Minimality test:** Detail queries fetch one Event/Narrative, up to 16 memberships, 16 relations, 32 neighbor previews and eight references per page. No new global entity index or search service was added. Relation lookup can scan a World's rows and is subject to A4 scale measurement.
6. **Implementation feasibility:** PostgreSQL integration/HTTP/MCP/CLI parity passed CI; the named clone detail script is present and sanitized. Railway connector has no exec capability. A browser console submission was rejected by automatic action review, so there is no actual clone result.
7. **Plan consistency:** A2 stays active until the missing clone gate and owner-full portability boundary receive an explicit disposition. A3 owns write quiesce, final backup, live schema/content migration, v5 ingress/worker activation and served pointer. A4 owns 1k/10k/100k latency and bounded cold cost; A5 discovery; A6 new historical authoring.
8. **Adversarial review:** Do not infer source integrity from a clone-only connection guard, infer production readiness from CI, infer semantic duplicate absence from title queries, or infer byte identity of #173 output from later digests. The #173 versus #175 page/read difference is explained by #174 rawLimit 4→16, not nondeterminism at one code version.

## Remaining A2 actions

- Run `IP011_REHEARSAL_DB=ip011_rehearsal_81811c151956e9af pnpm exec tsx scripts/ip011-v5-search-rehearsal.ts rehearse-detail` in a verified worker console at deployed SHA, record only the sanitized result and ensure no source/pointer writes. The command may create the trigram index **only on that named clone** if absent. Its browser submission currently requires an action-time approval after an automatic review rejection.
- Decide and prove the owner-full history/import/export boundary: the existing encrypted v4 backup→fresh clone→v5 migration/replay is migration recovery; a generic v5 owner-full package is still absent. Preserve this distinction in A2 exit and A3 rollback instructions.
- Re-run the actual-data semantic case matrix (계유정난/단종, 임진왜란, 일본 전국시대, shared Collection/Composite, distinct Worlds) against the final clone Revision without silently merging similar Event titles. Record the observed IDs/counts and unresolved judgments without leaking private prose.
