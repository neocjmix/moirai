# IP-011 A3 controlled cutover — execution ledger

Status: **live cutover executed; acceptance in progress**. The operational
World moved from Revision 30 to 31 on 2026-09-25. A policy-bound production
write and exact replay advanced it to Revision 32; the v5 complete Publication
pointer serves Revision 32. The nine served scenario gate still requires
production unplaced Event and mobile navigation evidence, so A3 exit is not yet
claimed.

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

## Live execution evidence — 2026-09-25 UTC

- PR #188 merged as `eb13481147df6436da98c93831c29f21fec81787` after CI
  run 36077259000 passed all three jobs. PR #189 supplied a quiesced-only,
  explicit startup operator gate when Railway's edited pre-deploy/start command
  did not execute on redeploy; it merged as
  `dfae64fb5f089ac8c384a12bba12f961fadf275d` after CI run 36079404944
  passed typecheck/integration/build/audit, mobile WebKit and secret scan.
  The worker gate requires `PUBLICATION_CONTRACT_MODE=quiesced` and
  `IP011_WRITE_QUIESCED=1`; its action variable was cleared after execution.
- API quiescence deployment `d7993536-3bce-4444-9945-2e80e75a2109` was
  SUCCESS. A public POST to old `/v1/clotho/change.validate` returned 503
  `writes_quiesced`. Worker quiescence deployment
  `8d24ec8e-d10e-4e08-938c-ea9bc735d2ec` was SUCCESS. The read-only
  operator preflight on deployment `09f23003-fb4e-4d13-bbc0-aacb6715efae`
  reported database `railway`, sole World Revision/target 30 and zero pending
  Publication jobs. Web cutover World ID was set before pointer handoff.
- Operator deployment `38330e5a-62be-49ce-b5a4-289fce1c15b6` reported
  `canonical_migrated_pointer_unchanged`, fresh AES-256-GCM object
  `operational-backups/ip011/48348dda66daf652.aes256gcm.json`, source/restore
  image digest `54de490a2a68bde58aafc1b1804cc06ded188404c2fa0f06bedd59212a3e4950`,
  restored DB `ip011_rehearsal_48348dda66daf652`, and clone/source candidate
  digest `fb2b56ce16d01c7e064f24e0c4ca02d4f05478d7a3e5deb2de0c3344045be371`.
  Its guarded command did backup readback/decryption/digest equality, fresh
  restore equality, clone migration/history replay and unchanged source digest
  before live migration. It installed migrations 010 and 011, verified v5
  schema/history, then reported Revision 30→31, 127 Events, 6 Collections,
  415 Relations and 133 Narratives. The six served Collection member counts
  sum to 153; their union is 127 Event IDs. The v4 pointer still served
  Revision 30 immediately after migration.
- API `v5-readonly` deployment `49eb3ec0-d60c-481f-9e4d-5746c92d1e4f`
  was ready with merged SHA, and old v4 change route returned 404. Worker
  `v5-hold` deployment `4dc39fca-19ba-41b7-889a-8160b8645009` was ready.
  Worker `v5` deployment `8b81a449-6b64-4d28-a47a-612ab60f9513`
  recorded `publication_v5` result `served` for Revision 31. Public pointer
  now reports `v5-publication/1`, served/current/target 31, ready, manifest
  digest `1fe6c4485cb4d1cdaf1f8d2cf7841b91bab181610c718f24f40dcb583273bb8f`.
  The complete-root reader returns 200 for `/graph/v5`; `/graph` emits its v5
  redirect marker. API `v5` deployment
  `d3a52ba2-b9f6-4cb9-af73-c78524e0f223` was SUCCESS. The web deployment
  was `c1940d31-fa67-47fa-99b4-ab8b6d452e33`; all run at `dfae64fb`.
- PR #191 (`63afab88b12e9e671ef6c091424f0f693e13d6fe`, CI 36090333763)
  introduced a one-shot production acceptance action under the v5 API mode.
  Its first attempt failed before any write because the search request lacked
  `contract_version: 5`. PR #192
  (`0af67ec17ec65deb5eff6dac17579d95981420da`, CI 36091165137)
  corrected that DTO; the subsequent API deployment
  `bf83a9c9-9137-4bfb-b70b-5bf36286d60a` reported
  `policy_write_replay_preserved`, `stale_policy_rejected=true`,
  `idempotent_replay=true`, Change Set
  `01996a80-0000-7000-8000-000000000001`, Revision 32, and unchanged
  127/6/415/133 entity counts. It performed an authorized same-content World
  update, then replayed the exact request. The operator action was cleared;
  final API deployment `ad2d5a14-aaba-479a-b4a0-9a18ad8d5aa0` succeeded.
  Worker deployment `eb557412-1faf-4d19-a9d0-f3539b57092e` served Revision
  32, and web deployment `9f7966af-15f5-4de6-9cfb-6778bc9f0cce`
  succeeded. Public v5 pointer served/current/target are all 32 with manifest
  digest `8ed8a73bac3d920b218c38b44846a6d98a025d0f167ea4f8c9b4e9d54e316f56`.
- PR #193 (`196a9f7a56ad795149bc46477a1c12d014a892dc`, CI 36092253026)
  updated the post-deploy smoke to inspect the v5 pointer, membership identity,
  Event/Composite/spatial readback and authorized v5 policy/search/detail,
  stale-policy rejection and MCP tool discovery. Post-deploy smoke run
  36092738608 passed public readiness and authenticated v5 authoring checks
  for this SHA. The preceding v4-only smoke run 36091587320 failed at public
  readiness after the contract switched, before the authenticated stage.

## Served scenario review

| Scenario | Live observation | Status |
| --- | --- | --- |
| Shared Event | `019f5b00-0000-7000-8000-000000000115` reads at 32 with one owner Narrative and appears in two served Collection memberships | Passed |
| Collection toggle | Browser switched from `조선 전기 연표` to `단종 폐위` while the same Event detail remained open | Passed |
| Composite child | Served `composite_children` for `01a0c40a-a761-7fc7-aef2-10211e0ecb0e` returned 14 child IDs; browser clicked child `019f5b00-0000-7000-8000-000000000116`, changing URL and drawer to `세조 즉위` at Revision 32 | Passed |
| Unplaced Event | Served spatial summary reports 125 placed and 2 unplaced; Collection union contains all 127 Events | Count passed; direct unplaced Event navigation pending |
| Direct Event URL | Browser loaded `계유정난` by exact World/Event URL and rendered its Narrative | Passed |
| Old history | Public Revision 30 immutable manifest remained 200 after v5 handoff; the guarded API acceptance read historical Event detail at Revision 31 | Passed |
| Authorization | Unauthenticated `/v2/clotho/change.commit` returned 401; old v4 change route returned 404; production smoke 36092738608 passed authenticated policy/search/detail and MCP discovery | Passed |
| Stale policy | Guarded API production acceptance rejected a stale policy digest before the Revision 32 write and replayed the same Change Set idempotently | Passed |
| Mobile navigation | Green CI mobile WebKit covers the synthetic complete-root journey; live desktop browser loaded Revision 32 and navigated Collections and a Composite child | Production mobile journey pending |

The connected Moirai Live tool catalog still advertises v4 input; the guarded
production API action supplied the authenticated v5 write/replay evidence.
Do not substitute the A2 clone or synthetic mobile run for the pending live
mobile and unplaced Event scenarios. Recovery
remains the fresh encrypted owner-full backup and isolated restored clone
above; forward repair is required for any post-migration defect.
