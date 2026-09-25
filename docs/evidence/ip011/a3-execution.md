# IP-011 A3 controlled cutover — execution ledger

Status: **in progress**. A2 passed on the isolated Revision 31 clone. The
operational World was last observed at v4 Revision 30. No production v5
schema/content migration or Publication pointer handoff is claimed by this
document.

## Ordered cutover gates

1. Ship inert cutover code. Keep `CLOTHO_CONTRACT_MODE=v4` and
   `PUBLICATION_CONTRACT_MODE=v4`. Verify CI, web/API/worker build SHAs, smoke,
   and the public v4 pointer. The API's current v4 pre-deploy command must be
   removed before any v5 deployment: its IP-003 check expects v4 columns.
2. Set API `CLOTHO_CONTRACT_MODE=quiesced` and worker
   `PUBLICATION_CONTRACT_MODE=quiesced`, then verify the deployed SHA and
   authenticated HTTP/MCP old Change Set refusal. Allow in-flight writes to
   drain and check World Revision, pending Publication jobs, and DB digest.
3. The restricted `scripts/ip011-a3-cutover.ts cutover-v5` command requires an
   exact operational database name, `IP011_WRITE_QUIESCED=1`, the quiesced
   worker mode and backup key. It performs a fresh encrypted backup and
   readback, restores a new isolated database, repeats the reviewed migration
   and history readback there, checks source image equality, then runs the
   same transaction on the frozen source and installs the versioned title
   index. It reports sanitized count/digest evidence and leaves the pointer
   unchanged. A failure after canonical migration requires forward repair
   while writes stay closed; a prior v4 application rollback is insufficient.
4. Deploy API `v5-readonly` and worker `v5-hold`; the former checks the actual
   v5 schema before accepting ingress, the latter refuses Publication claims.
   Web `/graph/v5` must pass a synthetic mobile journey. The public `/graph`
   route switches only when a complete v5 pointer verifies; configure its
   cutover World ID before that handoff.
5. Switch worker to `v5` for the queued migration Revision. It builds a
   complete tree, verifies readback and conditionally swaps the pointer, then
   marks the job served. Compare target/served Revision and candidate counts,
   read the public v5 graph and Event URL, and run nine acceptance scenarios.
6. Only after API/worker/web, pointer and old writer rejection agree, switch
   API from `v5-readonly` to `v5`. Keep v4 write routes absent. Capture CI,
   Railway deploy IDs, public SHA/status/smoke, and recovery evidence here.

## Evidence pending

- Fresh source backup digest/object and isolated restore equality at the
  frozen Revision.
- Live migration ledger 010/011, 127 Event, six Collection, 415 Relation,
  153 memberships, 133 owner Narrative or an explicitly reviewed mapping.
- V5 target/served pointer and complete-root readback; old writer denial on
  the deployed public API and policy-bound v5 write/replay after reopening.
- Nine served E2E scenarios, including shared Event, Collection toggle,
  Composite child, unplaced Event, direct URL, old history, authorization,
  stale policy and mobile navigation.

The existing A2 clone evidence remains a rehearsal, not evidence for any
unchecked item above.
