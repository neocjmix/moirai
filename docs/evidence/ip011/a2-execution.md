# IP-011 A2 execution evidence

A1 shipped in [PR #130](https://github.com/neocjmix/moirai/pull/130), merge `1b837bf7457090da2d4225219fa72265865ec8bf`. Railway web/API/worker all SUCCESS at that commit. API readiness reports the same SHA; the new policy route returns 401 to unauthenticated callers. Live World still reports 30/30/30 ready. CI exercises authenticated HTTP/MCP policy equality and CLI policy-envelope preservation. This session's connected Live tool catalog predates the new method; a production authenticated `authoring_policy_get` call has not been exercised through that cached catalog. The source artifact and deployed commit are pinned; refreshing the app catalog is needed for a fresh authoring session.

## Owner-full inventory

[a2-owner-inventory.json](a2-owner-inventory.json) is an owner database read, not a World-scoped export. It used a repeatable-read, read-only transaction with a 20s statement timeout in the existing worker execution environment. No credentials or body/origin text were printed. Temporary worker startup instrumentation was removed from service configuration after collecting the result.

The installation contains one World, at revision 30; migrations 001–009 are actually applied. Counts: 127 active Events, 6 active Canons, 153 active Event memberships, 429 total Relations (415 active, 14 withdrawn), 491 Relation memberships (477 active, 14 withdrawn), 160 active Narratives, 1474 Change Operations and 30 Change Sets/Revisions. All Narratives use ko. There are no Subject handles/members and no correspondence tables. Thus no handle redirect migration or multi-locale conversion is needed for this installation. This does not remove the target invariant or future tests.

The public snapshot omitted the 14 withdrawn Relation rows and 14 withdrawn memberships. A `.moirai` content export alone is therefore insufficient as the rollback backup. Backup must include all table/history rows and sequence state.

## Rehearsal tooling

The operator-only `scripts/ip011-backup-rehearsal.ts backup-and-rehearse` captures the exact v4 table inventory in a read-only transaction, keeps PostgreSQL JSON text intact (including large numbers and microsecond timestamps), encrypts with AES-256-GCM before writing an immutable operational backup object, reads/decrypts it back, and restores into a newly created `ip011_rehearsal_<random>` database. It never restores over an existing database or writes a Publication pointer. The source's full row/sequence digest is checked again after rehearsal.

`IP011_BACKUP_KEY` is an independent 32-byte secret supplied through the worker's secret variables, never committed, logged, returned, or stored with the ciphertext. Object storage receives only authenticated ciphertext under `operational-backups/ip011/`, never plaintext private Change Set origins. This is a v4 migration backup format, not a new public export contract. Unknown tables or schema versions stop the operation. Columns/defaults, constraints, indexes, triggers, table ACL/RLS policies, public function definitions and views are fingerprinted and compared before restoring rows; matching migration ledger names alone do not prove absence of schema drift. Rehearsal DB names are recorded for subsequent v5 tests and explicit cleanup.

A PostgreSQL integration test verifies restore fidelity, numeric/date precision, source immutability, sequence state and refusal to overwrite an existing database. Local crypto tests verify wrong-key and ciphertext-tamper rejection. PR #131 merged at `f0331129f1a84d0bd3adf20ba9e63e0c262fb964` after all [CI checks](https://github.com/neocjmix/moirai/actions/runs/35784846155) passed. The actual production snapshot was encrypted, stored, read back and restored into an isolated database with identical schema/data/sequence digest and an unchanged source digest. See [a2-backup-result.json](a2-backup-result.json). Temporary worker startup configuration was restored. The clone is retained for v5 migration tests; no service points at it and its outbox is not processed.

## Content mapping findings

Revision 30 has 119 distinct Narrative owners and 160 Narrative rows. Preserving one current Narrative ID per owner, adding the 14 missing owners and retiring 41 superseded IDs yields 133 active target Narratives and 174 total retained IDs. One owner (`단종 폐위와 몰락의 과정`) has only a summary Narrative; its ID can be explicitly retained as the target owner Narrative rather than inventing a duplicate primary ID. Retired bodies and all citations remain in history and the preservation manifest; notes become components of the retained owner's Narrative.

The eight reign/founding Composite summaries are process/precision commentary and need reader-facing replacement based on their actual children and source Narratives. Four additional Event owners and two Collection owners lack any Narrative. These require reviewed prose, not mechanical concatenation or arbitrary first-Canon selection.

An offline v4-validator experiment over the revision-30 snapshot assigned all 127 Events and 415 active Relations to one synthetic scope and enabled all Time Systems there. The union passed with zero warnings. This is preliminary evidence that current temporal/contains assertions can coexist; the final v5 World invariant suite and a real restored-database migration remain mandatory.

## Remaining A2 gates

Narrative preservation manifest is now materialized and passes offline revision-30 validation ([input and editorial decisions](../../../data/migrations/ip011/README.md)); v5 canonical/contract/API/UI/MCP/export/tests transition remains; migration on the isolated restored copy; old Revision/export fidelity; World-level invariant and scenario tests. No production schema/content cutover has been executed. A3 remains gated on all of these.

## Adversarial review corrections

A restore through `jsonb_populate_recordset` could silently discard a manually added column if only migration names were compared. The rehearsal now compares actual schema definitions before inserting any backup rows and tests refusal on a mismatch. Application table/sequence fidelity is covered; cluster roles, provider settings and grants outside the versioned application schema are not a physical PostgreSQL cluster backup.

CI subsequently caught physical column ordinals changing after a migration down/up cycle. The schema comparison now sorts columns by name and compares their semantic definition; dropped-column position holes are excluded. Type/default/nullability/constraints and ACL/RLS checks remain enforced. Mismatch diagnostics expose only the names of schema sections, never private definitions.

## Historical reader boundary

The v2–v4 operation fold now lives in a separate read-only interpreter and uses explicitly versioned record shapes. The current v4 entry point delegates to it without changing runtime semantics. A raw historical-row regression fixture checks legacy Canon ownership, one Event shared by two Canons, per-Canon Narrative preservation, composite kind, membership removal and withdrawal at four revisions. It deliberately avoids generating history through the current writer. This prepares old-revision fidelity; it does not introduce v5 writes or assert that the remaining publication/export transition is complete.


The manifest covers all 160 public Narrative records with source/target digests and dispositions: 119 retained identities, 14 additions, 41 retirements, and 22 embedded notes. Eight early reign/founding Events also require removal of editorial `curation` metadata and reader-facing summary replacement. The original 127 Event, 6 Canon and 415 active Relation IDs and all exported membership rows are mapped without rekeying. This is reviewed migration input, not an applied canonical change or final semantic rehearsal.
