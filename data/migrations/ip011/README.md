# IP-011 revision-30 preservation manifest

This is an operator migration input, not a new public API or a completed migration. It is pinned to the exact public revision-30 snapshot and must be combined with the owner-full encrypted backup (including withdrawn rows and private history). No runtime imports this directory.

`world-r30-preservation.json` contains all 160 original public Narrative records with digests, explicit dispositions and 133 target owner Narratives. It preserves 119 existing Narrative identities, allocates 14 fixed UUIDv7 identities, and retires 41 superseded identities after preserving their information. All 22 annotations become notes inside their owner's Narrative. All original citation records survive. Retired rows remain in historical revisions; their content is not physically deleted.

The editorial review compares existing content; it does not claim a new independent verification of every historical source. In particular, the Myeongnyang conversion discrepancy remains an explicit source/date note. Temporal constraints are unchanged by this manifest.

## Review decisions

- Hunminjeongeum: retain the old Narrative ID, distinguish creation from completion of the explanatory text, and preserve the unique explanation of the five commentaries and examples. Preserve the commemorative-date distinction as a note.
- Danjong: preserve the distinction between the 1453 coup and the 1455 forced abdication, and between kingship loss, exile, demotion and death. The separate Event for his change of status/residence is retained alongside Sejo's accession; shared context does not imply identical acts or outcomes.
- Naval battles: compare both accounts for each of eleven shared Events. Retain the complete main account and integrate reviewed unique detail about reconnaissance, supplies, injuries, command continuity, fleet rebuilding and allied operations. No Collection-specific Narrative remains.
- The Hunminjeongeum process summary is integrated with its account of the purpose of the script. The Danjong process that previously had only a summary retains that summary's identity as its one Narrative.
- Eight reign/founding Events retain their IDs and existing constituent relations. Their new prose explains the historical process, not the act of curating a timeline. Remove only the `curation` attribute and replace the process-commentary summary. Contains assertions still require the v5 World invariant rehearsal.
- Four additional missing Event Narratives use their existing cited Event content. Two missing Collection Narratives explain the historical reading scope and use citations already present on selected Events.

The ID choice for existing owners is explicitly materialized in the manifest. It prioritizes stability of an existing primary ID (or the sole summary where no primary exists); body selection is separately reviewed. The validator does not choose content or concatenate competing accounts.

## Read-only validation

```sh
node --import tsx scripts/ip011-preservation.ts /secure/path/revision-30.json data/migrations/ip011/world-r30-preservation.json
```

Checks: snapshot drift, complete/unique owner and source coverage, source and target digests, owner/world/locale, UUIDv7, one retained identity per existing owner, no retired ID reuse, note/citation preservation, unchanged Event/Canon/Relation identity mappings and membership/provenance, and narrow metadata patch scope. Errors write no data and expose no content.

Expected result: 133 owners, 160 source Narratives, 133 targets, 14 created, 41 retired, 22 notes, 8 metadata patches. Machine checks do not prove semantic preservation; the editorial decisions above and the preserved source records allow that review.

Before A3, the v5 migration must additionally verify the current revision under a write lock, apply all required World/Collection metadata corrections, preserve all withdrawn/history rows from the owner-full database, pass World-level invariants, and prove old-revision and new-export fidelity on the isolated restore. This manifest alone is not authorization to bypass those gates.
