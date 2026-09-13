# 현재 구현 상태

후속 도그푸딩 수정: Composite 레이블 후보 전환에 화면 기준 히스테리시스 적용.
이전 변을 유지하면서 좌표는 계속 갱신하고, 충분한 개선·화면 이탈 시 전환한다.
M4.7 완료 이력 유지, M5 비활성. 검증·배포 진행 중.

M4.7 완료 — [viewport 연속성과 탐색 경계](M4.7-VIEWPORT-CONTINUITY.md).
사용자 승인: 복귀 버튼 제외. A~C 완료, M5 비활성.
검증 checkpoint `7f1da7c`, CI `34733627018`·smoke `34733714577` success.
[완료 증거](../evidence/m47-viewport-continuity.md).

2026-09-12 사용자 승인으로 기존 production 샘플 3개를 모두 삭제하고
[조선 전기 도그푸딩 데이터](../evidence/joseon-dogfood.md)로 교체했다.
현재 World는 `조선 전기 — 건국에서 세조까지` 하나이며 revision 1 ready,
주요 사건 32개·Composite 8개·Relation 124개다. M5는 계속 비활성이다.
사용자 승인으로 도그푸딩 backlog를 수정했다: Gregorian 축·사건 설명 복구(PR #69)와
시간 cluster의 개별 범위·순서 준수(#57). [검증 기록](../evidence/dogfood-backlog.md).
완료 runtime `91f2230` — CI `34726121209`, smoke `34726218992` success,
Railway 세 서비스 배포 및 mobile WebKit 통과. M5는 비활성이다.

세션과 에이전트 사이의 짧은 상태판이다. M4.5-A~G의 데이터·query 작업은 유지한다.
M4.5-H와 남은 M4.5 계획은 폐기했다. M4.6은 현재 URDR renderer·layout·interaction·spatial
read pipeline을 유지하면서 입력을 Moirai Publication data로 교체한다. M5는 비활성이다.

| 항목                       | 현재 값                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 기준 계획                  | [M4.7 — viewport 연속성과 탐색 경계](M4.7-VIEWPORT-CONTINUITY.md); [IP-001](IP-001-first-product-plan.md)은 상위 제품 계획 |
| 실행 상태                  | `completed` — M4.7 A~C. 사용자 도그푸딩 대기 |
| 활성 milestone             | 없음 — M4.7 완료, M5 비활성                                                                          |
| 현재 slice                 | 없음. `7f1da7c` 검증 완료; unit 219/integration 25/mobile 17, CI·smoke success |
| M4.6-B checkpoint          | PR #55 merge `ad00da4ee10d55f8b948ba5fe3a2b737a15a570a`; PR/main CI `34683566545`/`34683671696`, smoke `34683794046` success; stable identity·Canon별 instance·lossless sidecar |
| M4.6-A checkpoint          | PR #54 merge `2427b9b14c448abd0c889e576d05c353eb462b14`; CI `34683157095`, smoke `34683255320` success; spatial/gesture 16개 및 WebKit screenshot 검증 |
| 업로드·배포 승인           | 2026-09-02 KST 사용자가 공개 `neocjmix/moirai` main 업로드·기존 Railway 배포를 명시 승인; 현재 synthetic World 검증 범위 유지 |
| 완료 milestone             | M0 전달·관측·보안 기반; M1 최초 vertical slice; M2 세계 확장; M3 Clotho 최소 작성; M3-R 책임 분리·배포; M3-C 실제 연결        |
| M4.6 runtime 기준선        | `dcad5305aadc8d0181e2b6ff33701385310ebb70`; Atropos `/graph`; URDR `0267c8fd081ca9a3cd556f8f7319c600248c3760`의 renderer·layout·interaction·spatial read 계승 |
| `/graph` 기준 application  | PR #19 merge `458cca0183a8b995b6a4edafa12fc104a0659574`; production route 렌더·interaction 확인                              |
| M4.5-A 계약 checkpoint     | [PR #21](https://github.com/neocjmix/moirai/pull/21) merge `6e8feace3b5d39466b725f44980aede714406a96`; [CI 34390674821](https://github.com/neocjmix/moirai/actions/runs/34390674821) success |
| M4.5-B App shell checkpoint | [PR #22](https://github.com/neocjmix/moirai/pull/22) merge `a012fad3b60df91f1a16819b82d243e5d1283801`; [CI 34392698639](https://github.com/neocjmix/moirai/actions/runs/34392698639) success |
| M4.5-B locale 후속          | [PR #23](https://github.com/neocjmix/moirai/pull/23) merge·production `cf0f5a7f747acb9c110cbea0c7db4a3ae068c6ce`; [CI 34393637840](https://github.com/neocjmix/moirai/actions/runs/34393637840) success |
| M4.5-C Sources checkpoint  | [PR #25](https://github.com/neocjmix/moirai/pull/25) merge·production `2c9002848e91c337876103d21e17804148d9f159`; [CI 34428583825](https://github.com/neocjmix/moirai/actions/runs/34428583825) success |
| M4.5-C 배포 smoke          | [34428902256](https://github.com/neocjmix/moirai/actions/runs/34428902256) `success`; 공개 `/__status` SHA 일치, `/graph` Sources island 확인 |
| M4.5-D1 완료               | [PR #38](https://github.com/neocjmix/moirai/pull/38) merge·production `5157962a821eba7b021db494f59c14bce5d6104e`; CI `34613884767` success; identity dedup·membership match·URL/no-JS 검증 |
| M4.5-D2 완료               | [PR #39](https://github.com/neocjmix/moirai/pull/39) merge·production `b3677cf0fad03d9643c0f09784ae5295a7b926eb`; CI `34615164602` success; R1 filter/evidence/diagnostics 검증 |
| M4.5-E 완료                | [PR #40](https://github.com/neocjmix/moirai/pull/40) merge `bb490bfb83b6e504dd220dc7a595a61bd5acb2e1`; CI `34616417588` success; Revision-fixed Publication composition·digest·budget·production query smoke |
| M4.5-F 완료                | [PR #41](https://github.com/neocjmix/moirai/pull/41) merge `e2260aafdf3ffa9e51bdd7fd7b9f4df29f9ce6c7`; CI `34617357534` success; mobile sheet·stable route 왕복·structured attributes·derived metadata |
| M4.5-G 완료                | [PR #42](https://github.com/neocjmix/moirai/pull/42) merge `f414f571def404070a0ea7f4812d1809437b0860`; v3→legacy bridge, observable loss, 2,500 visible-cell hard cap와 100k fixture; [결정 기록](evidence/m45-g-legacy-viewport-bridge-implementation-2026-09-11.md) |
| Publication→explorer 연결  | [PR #44](https://github.com/neocjmix/moirai/pull/44) merge·rollback 기준선 `0f5554926587bbd01193b57496d82e9c5f2743e3`; 이후 충돌 이력 #45–#48은 의도적으로 폐기 |
| legacy Relation 호환성     | [PR #49](https://github.com/neocjmix/moirai/pull/49) merge·production `e81f4eafd91046346e239d8883a18ff6ad53c3c3`; immutable v1/v2 Relation을 Publication read boundary에서 normalization |
| M4.5-H 철회                | [PR #50](https://github.com/neocjmix/moirai/pull/50)의 native viewport는 검증 이력만 보존하고 2026-09-12 사용자 결정으로 runtime 기준에서 철회; Publication query·검색은 유지하고 URDR 목데이터 viewport 복구 |
| M4.6 전환 결정             | M4.5의 남은 계획을 폐기; URDR graph pipeline을 보존하고 Moirai Publication을 presentation input으로 연결                     |
| IP-003 시작 기준선         | `main` `8854da284631f836cb34692f36070b718dce3e2d`; CI `34556657861`, post-deploy `34556777058` success; production `/__status`와 M4.5-C `/graph` 재확인 |
| IP-003 Slice 0 계획        | PR #28 merge `6eaa428d7e6e61ae3df574a091dcbc2f0a082d73`; CI `34558131634` success                                                    |
| IP-003 Slice 1 규범        | PR #29 merge `5a5aeb20cf853353847a9ef3185ff8e682bacefb`; CI `34558845653` success                                                    |
| IP-003 Slice 2 persistence | PR #30 merge·production `56b95a8b7b998326f6ab7adf302327288995f9b9`; CI `34561345766`, smoke `34561614061` success; [migration evidence](evidence/ip-003-slice2-production-migration-2026-09-11.json) |
| IP-003 Slice 3 write path  | PR #32 merge·production `57628ea6bd2d1f6481e78a13fb2b9a3692d7d0fe`; PR CI `34564009501`, main CI `34564158019`, smoke `34564302767` success; [write/migration evidence](evidence/ip-003-slice3-event-write-production-2026-09-11.json) |
| IP-003 Slice 4 read/public | PR #34 merge·production `16cc9508abbb8d1a2452ecc21607e921d1c8788d`; main CI `34566941074`, smoke `34567083988` success; production Revision 3 K1/K2/K3·A/B/C/D, orphan 0; [evidence](evidence/ip-003-slice4-shared-event-production-2026-09-11.json) |
| IP-003 Slice 5–7 R1/종료   | PR #36 merge·production `1bd88854bb45f20edf95e8a0f4e3c89c99a033bb`; PR CI `34576628203`, main CI `34576831599`, smoke `34577001008` success; production Revision 4 shared/K1/K2 Relation, Event·Relation orphan 0; [evidence](evidence/ip-003-slice5-r1-production-2026-09-11.json) |
| M4-A 검증 application SHA  | `0bbabae947761b0cc380951a56677bd7e443db09`                                                                                    |
| public integration URL     | <https://moirai-production-8ed1.up.railway.app/>                                                                              |
| M4.5 graph 기준 URL        | <https://moirai-production-8ed1.up.railway.app/graph>                                                                         |
| Clotho synthetic World     | <https://moirai-production-8ed1.up.railway.app/worlds/01995c2a-7b00-7000-8000-000000000101>                                   |
| Clotho 인증 API            | <https://desirable-vitality-production-eb95.up.railway.app>                                                                   |
| M4-A 구현 CI               | [33861480738](https://github.com/neocjmix/moirai/actions/runs/33861480738) `success`                                          |
| M4-A 배포 smoke            | [33861786238](https://github.com/neocjmix/moirai/actions/runs/33861786238) `success`; Clotho synthetic revision 21            |
| M4-B 검증 application SHA  | `a396a3a5c4e7dd64374813e56fd9e1d597a292e9`                                                                                    |
| M4-B 구현 CI               | [33879616711](https://github.com/neocjmix/moirai/actions/runs/33879616711) `success`                                          |
| M4-B 배포 smoke            | [33879771900](https://github.com/neocjmix/moirai/actions/runs/33879771900) `success`; Clotho synthetic revision 23            |
| M4-C 검증 application SHA  | `dc0728da0fb2a94770aace356ad92c4d1144679c`                                                                                    |
| M4-C 구현 CI               | [33895196445](https://github.com/neocjmix/moirai/actions/runs/33895196445) `success`                                          |
| M4-C 배포 smoke            | Railway 배포 성공; Clotho synthetic revision 27                                                                               |
| M4-D 검증 application SHA  | `350920bbdb3928f34e406940b9d9f0d95f7e8c65`                                                                                    |
| M4-D 구현 CI               | [33938273152](https://github.com/neocjmix/moirai/actions/runs/33938273152) `success`                                          |
| M4-D 배포 smoke            | [33942566968](https://github.com/neocjmix/moirai/actions/runs/33942566968) `success`; Clotho synthetic revision 28            |
| M4-E 검증 application SHA  | `e8d1434f0f59bd7a7bf836e28a47206fd3846bff`                                                                                    |
| M4-E 구현 CI               | PR #11 [34218821271](https://github.com/neocjmix/moirai/actions/runs/34218821271), main [34219040771](https://github.com/neocjmix/moirai/actions/runs/34219040771) `success` |
| M4-E production 검증       | Graph Scope Observatory revision 1; [machine-readable evidence](evidence/m4-e-graph-scope-production-2026-09-08.json)         |
| M4-F 검증 application SHA  | 구현 `43b0d8fea67d1afd679360a91203b501136ec84b`; production 검증 `5abc536527afa61dd34a8b760060a83e3e99aab8`              |
| M4-F 구현 CI               | PR #13 [34225538578](https://github.com/neocjmix/moirai/actions/runs/34225538578) `success`                                   |
| M4-F production 검증       | Graph Scope Observatory revision 2; [machine-readable evidence](evidence/m4-f-vertical-chronology-production-2026-09-09.json) |
| 최근 bearer smoke          | [34293280937](https://github.com/neocjmix/moirai/actions/runs/34293280937) `failure`; readiness 성공 후 stale bearer MCP 실패 |
| 실제 OAuth 검증            | [M3-C 검증 기록](M3-C-VERIFICATION.md), [재현 가능한 synthetic plan](evidence/m3-c-oauth-recovery-plan.json)                  |
| M4.5-C 구현 runtime 검증   | Atropos·Clotho·worker `2c9002848e91c337876103d21e17804148d9f159`; [M4.5-C smoke 34428902256](https://github.com/neocjmix/moirai/actions/runs/34428902256) `success` |
| IP-002 구현 CI             | PR #9 merge `e4265a627b121ef9d4274b693db094362146924c`; [CI 34125253511](https://github.com/neocjmix/moirai/actions/runs/34125253511) `success` |
| 보호 기준선                | branch `baseline/m4d-2026-09-05`; M4-D SHA `350920bbdb3928f34e406940b9d9f0d95f7e8c65`                                      |

## M4 종료, M4.5 폐기와 M4.6 활성화

2026-09-09 KST 사용자 결정으로 M4의 추가 구현을 즉시 중단하고 조기 종료했다. M4-A~F의
구현·CI·production 증거는 보존하지만 원래 M4 종료조건을 모두 만족한 완료로 보고하지
않는다. 남은 Canon 비교, 100k scope·LOD, subject lane, metro routing과 composite
region은 [M4.5 상세 계획](M4.5-ATROPOS-EXPLORATION-UI.md)으로 이관했다.

`/graph`의 fullscreen viewport, top floating island, bottom app navigation과 detail
sheet 배치는 유지한다. entity query, Time System compatibility, multi-World source,
Revision vector와 Publication 검색 결과는 Moirai-native 계약을 사용한다. 2026-09-12
사용자 결정으로 H의 native renderer는 철회했으며 graph viewport만 원본 URDR
`graphReadLoader`의 명시적 목데이터 기준선으로 복구했다. query island의 Publication
결과와 viewport의 목데이터가 다름을 UI에서 표시한다.

M4.5-A는 versioned `MoiraiGraphQuery`, `MoiraiGraphQueryResult`, URL state와 legacy loss
report를 `@moirai/contracts`에 고정하고 완료했다. 모든 canonical EventReference와 Relation
type의 JSON 왕복, World별 `7·42` Revision vector 보존, 명시적 adapter identity가 다른
동명·동종 Time System의 비호환, URDR import 금지를 golden test와 architecture 검사로
검증했다. 이어서 M4.5-B를 수행했으며 기존 viewport algorithm은 변경하지 않았다.

M4.5-B는 app-level screen registry와 reload 가능한 `/graph/private`, `/graph/explore`,
`/graph/settings` 경로를 추가하고 완료했다. Private·Explore는 명시적으로 unavailable이며
향후 auth-gated Operations slot은 하단 navigation에 노출하지 않는다. dock 전환은 graph
query string을 보존하고 `/graph/operations`는 `404`로 닫힌다.

M4.5-C는 Sources query island를 완료했다. Time System을 먼저 선택하고 native-compatible
World만 복수 선택하며, World별 peer Canon과 served Revision vector를 보존한다. 두 World·세
Canon 선택의 versioned URL 복원, 비호환 World 사유, Time System 변경 전 source 제거
preview와 apply/cancel을 unit·mobile WebKit E2E로 검증했다. 현재 데이터는 실제 Publication
composition이 아니라 화면 계약 검증용 `MOCK` fixture이며 이는 M4.5-E 범위다. Production
`2c9002848e91c337876103d21e17804148d9f159`에서 Atropos·Clotho·worker Railway 배포,
공개 `/__status` SHA와 post-deploy smoke 성공, `/graph`의 접힘·펼침·draft preview를
확인했다. IP-003 완료 후 기존 M4.5-D는 D1/D2로 분할됐고 D1→D2→E→F→G의
데이터·query 결과는 유지한다. H의 renderer 구현과 종료 판정은 이후 철회했다.

2026-09-12 검증된 Publication v1/v2 temporal Relation read normalization과 기본 `/graph`,
R1 `/graph/query` 결과는 유지한다. 같은 날 H native viewport의 시각·interaction 결과가
URDR 기준선보다 부적합하다는 사용자 판단에 따라 renderer와 layout만 철회했다. 현재
그래프는 URDR 조선사 목 fixture로 pan·zoom·selection·detail sheet를 검증하며 실제
Publication entity는 query island와 server-rendered fallback에서 계속 관찰할 수 있다.
이후 사용자는 남은 M4.5 계획 전체를 폐기하고 M4.6을 승인했다. M4.6은 고정 URDR commit의
renderer뿐 아니라 temporal-Y/free-X force layout, Composite geometry, viewport bbox와
y-band spatial read까지 보존하고 그 입력만 Moirai Publication으로 교체한다. 현재 M4.6-A는
문서·characterization은 A에서 완료했다. B의 presentation 입력을 구현 중이며 runtime은
아직 목 fixture 기준선이다. M5는 시작하지 않았다.

## 시간 모델 재정렬 Slice 0

[드리프트 분석](TEMPORAL-MODEL-DRIFT.md)을 바탕으로 2026-09-05 사용자가 [TS-010](../technical-specifications/TS-010-event-relational-time.md)의 strictness, virtual Time Event reference와 Time System 계약을 승인했다. [표현력 종단간 수용시험](TEMPORAL-EXPRESSIVENESS-ACCEPTANCE.md)과 [IP-002](IP-002-temporal-model-realignment.md)를 accepted 방향으로 정렬하고 [machine-readable fixture](fixtures/temporal-expressiveness/)를 고정했다.

Slice 0–7과 두 차례 production 종단간 검증을 완료했다. 이후 M4-E·F와 M4.5-D1~G를
완료했다. M4.5-H는 구현·검증 뒤 사용자 결정으로 철회했으며 M5는 비활성이다.

Slice 1은 [M4-D 시간 동작 특성화 기준선](M4D-TEMPORAL-CHARACTERIZATION.md)과 contracts·domain·projections golden test로 완료했다. current numeric Placement, 피코초 collapse, relative-only order, validate에서 허용되는 `precedes` cycle, descendant-span Process Duration, during 비-membership과 membership State 계산을 교정 전 관찰값으로 고정했다. 이는 TS-010 표현력 합격이 아니다.

Slice 2의 독립 adapter·resolver·solver와 graph validator를 완료했다. 기존 runtime에서는 호출하지 않는다. Gregorian lossless 좌표, custom 허구력, 빅뱅 이후 scalar와 지질 BP 범위, Composite 경계 순서, equality evidence, 입력 순서 독립성 및 원본 거절 corpus 5개를 검증했고 PR CI [33971023125](https://github.com/neocjmix/moirai/actions/runs/33971023125)는 성공했다. 이는 실제 제품 경로 표현력 합격이 아니다. canonical write·schema·Placement·projector·Atropos·배포·World revision은 미변경이다.

## M3-C 검증 상태

### IP-002 현재 실행 checkpoint

2026-09-05 Slice 2는 complete Composite 경계 순서, equality evidence·입력 순서 독립성 및 원본 JSON 거절 corpus 5개를 domain 검증에 연결하고 PR CI [33971023125](https://github.com/neocjmix/moirai/actions/runs/33971023125) 성공으로 마쳤다. 이는 Clotho 실제 validate나 제품 종단간 합격을 대체하지 않는다. Gitleaks는 변경 이력에서 secret 0건이었다.

2026-09-06 Slice 3은 legacy Placement를 변경하지 않는 shadow reader와 실제 Revision 29 read-only evidence를 추가했다. 같은 input에서 기존 `m4-timeline-v1`은 interval 3건을 `0..0` authored coordinate로 표시하고, 새 reader는 명시적 boundary Event가 없으므로 `ambiguous`로 남긴다. 정확한 ordinal point 9건은 lossless virtual Time Event 제약으로 전환되고 모순은 없다. corpus를 기존 `Clotho Synthetic Observatory`에 쓰지 않았으며 해당 World의 revision은 바꾸지 않았다. PR CI [34000329987](https://github.com/neocjmix/moirai/actions/runs/34000329987)는 성공했다.

2026-09-06 Slice 4는 numeric contract version `2`, tagged Event/virtual Time Event endpoint, strict `precedes`·`not_after`·`coincides`, deterministic resolver와 추가 migration을 구현했다. 기존 Relation ID columns와 Placement를 보존하고, v2 canonical write는 fixture의 `Temporal Expressiveness Observatory` source/import World ID로만 gate한다. commit `203763a89ac96bfb15bfc56daa61c3875491a9da`의 PR CI [34014969062](https://github.com/neocjmix/moirai/actions/runs/34014969062)가 성공했다. 실제 migration 실행, Railway 배포, 시험 World validate·commit은 아직 하지 않았다.

2026-09-06 Slice 5는 source/import 시험 World에만 `relational-time-v1` projection과 revision별 `temporal.json`을 연결했다. bounded·exact·relative-only, 명시적 boundary Duration과 descendant span, containment와 during, source evidence와 algorithm version을 분리한다. 기존 World의 M4 projector는 그대로 유지한다. commit `eff9d359cd917bb139a65bcfcc4ef97d19008ed1`의 PR CI [34015422657](https://github.com/neocjmix/moirai/actions/runs/34015422657)가 mobile 포함 전체 성공했다.

Slice 6과 IP-002 종단간 수용시험을 완료했다. 승인 SHA `8ee04b47843b8d080014325e39be3dda4aac88c6`를 배포하고 별도 source/import 시험 World에 실제 validate→commit→Canon read→resolve→projection→Atropos→export/import→거절 검증을 수행했다. source revision 2, import revision 1, 11 Event·23 Relation, virtual row 0, fingerprint `sha256:e5dd8fdb07743f963fd7823e18d2485222a64ce8274b264ef45f40dddbd4d9b8`가 일치했다. [실제 증거](evidence/ip-002-live-acceptance-2026-09-06.json)에 ID mapping과 사례별 판정을 기록했다.

임시 Clotho credential은 두 시험 World에만 제한해 사용한 뒤 제거했고 제거된 토큰의 `unauthorized`를 확인했다. exact M4-D rollback은 실행된 migration 006 파일 부재로 fail-safe 중단됐다. DB downgrade·trial row 삭제 없이 M4-D runtime에 migration 006 ledger 파일만 보존한 bridge `3ac0b0deafbe00b5aaa4aa474b7ad4a8e9cc6bb8`로 Clotho를 복구했다. Atropos·worker는 `350920bbdb3928f34e406940b9d9f0d95f7e8c65`다.

2026-09-07 PR #4를 merge commit `776029c38f9be8bbe403215397fec546982d7f93`로 병합했다. production DB의 `public` schema와 Publication Store `worlds/` 581개 object를 승인된 전체 삭제로 비웠다. 호환 migration 대신 clean schema를 구축하며 별도 환경·임시 이중화는 만들지 않는다. 복귀 지점은 IP-001 M4-D 다음 JointJS graph·scope artifact 기본 탐색이고 M5는 계속 비활성이다.

2026-09-08 Slice 7을 완료했다. PR #9 merge `e4265a627b121ef9d4274b693db094362146924c`는 contract v2 단일 write/read/publication 체계만 남기고 Placement·numeric coordinate·legacy adapter·World allowlist·자동 seed를 제거했다. 전체 CI [34125253511](https://github.com/neocjmix/moirai/actions/runs/34125253511)이 성공했고 세 production 서비스가 같은 SHA를 실행했다. clean reset 뒤 리팩터링 전 [E2E 34120376433](https://github.com/neocjmix/moirai/actions/runs/34120376433)과 리팩터링 후 [E2E 34195243154](https://github.com/neocjmix/moirai/actions/runs/34195243154)가 모두 통과했으며, 동적 메타데이터를 제외한 의미 차이는 0건이다. Canon 11 Event·23 Relation, virtual Time Event 비영속성, projection, 같은 served Revision의 Atropos 텍스트·JSON, `.moirai` 왕복 fingerprint와 설명 가능한 거절 5건을 [machine-readable evidence](evidence/ip-002-slice7-production-revalidation-2026-09-08.json)에 고정했다. IP-002는 종료됐다.

2026-09-08 IP-001 M4 Slice E를 완료했다. PR #11 merge `e8d1434f0f59bd7a7bf836e28a47206fd3846bff`는 bounded Canon overview scope artifact와 JointJS 4.x graph, stable focus URL, server-rendered text fallback을 추가했다. PR·main CI의 PostgreSQL 및 WebKit 검증이 모두 성공했다. production Graph Scope Observatory revision 1에 Clotho OAuth로 4 Event·4 Relation을 commit하고 Canon read-back, 8-cell/4-label immutable graph JSON, composite 구분, `contains`와 non-membership `influences` 분리, same-Revision SSR/focus 출력을 확인했다. 자동 post-deploy run `34219201148`은 공개 readiness와 정확한 Atropos SHA까지 통과했으나 별도 GitHub bearer credential의 MCP initialize가 실패했다. 실제 OAuth 제품 경로 검증은 성공했으며 이 bearer 운영 부채는 완료로 숨기지 않는다. 당시 다음 작업은 M4 Slice F 관계 기반 vertical chronology였다.

2026-09-09 IP-001 M4 Slice F의 production 검증을 완료했다. PR #13 merge `43b0d8fea67d1afd679360a91203b501136ec84b`의 relation-based vertical chronology가 검증 배포 `5abc536527afa61dd34a8b760060a83e3e99aab8`에 포함됐다. 실제 Clotho OAuth로 Graph Scope Observatory에 Canon annotation 하나만 append해 revision 2를 만들고 replay의 idempotency를 확인했다. immutable graph artifact v2는 `Signal detected`와 `Investigation`을 같은 relative component의 rank 0·1로 배치하고 원본 `precedes` Relation을 evidence로 보존했으며, 근거 없는 두 Event는 `unplaced`로 남겼다. Atropos 메인→Canon→JointJS→focus URL과 접근 가능한 텍스트, 8-cell/4-label budget, horizontal overflow 부재를 production 브라우저에서 확인했다. 자동 smoke [34293280937](https://github.com/neocjmix/moirai/actions/runs/34293280937)은 readiness 후 stale bearer MCP 단계에서 계속 실패하므로 별도 운영 부채다.

2026-09-02~03 실제 ChatGPT OAuth로 작업했다. 전달받은 revision 14 대신 작업 전 15를 재조회했다. validate 후 revision 15와 신규 Event 부재를 확인하고, 한 Change Set으로 Event·Relation·Narrative를 commit해 revision 16을 만들었다. 동일 요청은 replay되며, 같은 ID의 다른 내용은 거절됐다. Atropos의 current/target/served 16, manifest와 Event digest, 공개 Narrative·Relation을 확인했다.

허용 World 밖의 검증용 ID 조회는 실제 OAuth 호출에서 `forbidden`으로 차단됐다. scope 축소·권한 미승격·토큰 유효성·최종 인가·OIDC 미설정 거절은 OIDC/MCP/Lachesis 15개 자동 테스트로 확인했다. 별도 Auth0 read-only 토큰을 발급하는 live 검증은 하지 않았다.

세션 시작 시 Clotho OIDC 설정이 제거된 상태였다. 기존 설정을 복원한 배포 `a89a8b70-eee9-4aed-94fe-874dfc13aff3` 이후 MCP가 정상화됐다. 긴급 차단 배포 후 metadata 503을 확인했지만 MCP 호출은 인증 처리에서 완료되지 않고 중단됐다. 기발급된 유효 Auth0 토큰의 live 거부는 미완료로 남긴다. 원본 OIDC 설정 복원 배포 `c4eb2a7f-f60b-40e6-80a4-6c9a4e1d4790`의 Active, metadata 200, readiness 200·동일 SHA를 확인했다. 첫 복원 후 MCP 재조회는 시간 초과였지만, 후속 실제 OAuth 재조회는 성공했다. CI bearer smoke 이후 current/target/served revision 17·ready를 재확인했다. 후속 시험 앱과 [동일 토큰 검증 도구·운영자 실행 가이드](M3-C-OIDC-DRILL.md)를 준비했다. 긴급 차단 자체는 자동 테스트와 metadata fail-closed로 확인했고, 동일한 기발급 토큰의 live HTTP 401 증거만 운영자 후속 검증으로 보류한다. 이는 M3-C 마감을 막지 않되 완료한 것으로 과장하지 않는다. 이 준비 과정에서 Clotho OIDC 설정을 다시 변경하지 않았다.

## 유지하는 운영 경계

- Auth0 운영자 한 명·synthetic World 하나·read/write 교집합 제한을 유지한다. provider 식별자·subject·token·설정 JSON은 공개 문서에 넣지 않는다.
- Clotho가 외부 HTTP/MCP·인증·작성 맥락을, Lachesis가 내부 최종 인가·정본 질의·commit을 소유한다. Atropos는 공개, worker·DB·Lachesis application은 내부 경계를 유지한다.
- 원본 Lantern fixture revision 2를 유지한다. M3/M4 기존 검증 콘텐츠는 Clotho synthetic World 범위를 유지한다. IP-002 corpus는 별도 Temporal Expressiveness Observatory에만 쓰며 사전 대상·SHA·Change Plan·rollback 승인 후 실행한다.
- M3-R 구현 `edfc16ee74afe06ef2ae6152472dcd66b370c3ad`의 [CI 33543491177](https://github.com/neocjmix/moirai/actions/runs/33543491177)·[smoke 33543795041](https://github.com/neocjmix/moirai/actions/runs/33543795041) 성공 이력을 유지한다. [M3-R 경계](M3-BOUNDARY.md), [연결·복원 절차](M3-CONNECTION.md)를 따른다.
- 실제 iPhone 기기 시험과 application version rollback 실연은 하지 않았다. OIDC 설정 차단·복원과 application version rollback은 다른 검증이다.
- M3-C의 동일 토큰 긴급 차단 live drill은 [운영자 가이드](M3-C-OIDC-DRILL.md)에 따라 별도 수행한다. M4 작업이 이를 완료한 것으로 바꾸지 않는다.

## M4-A 완료

[M4 파생 모델 구현 기록](M4-DERIVED-MODELS.md)에 따라 기존 Canon·Event·시간 배치·`precedes` 관계만 읽는 결정적 Timeline projection, Revision별 immutable graph artifact와 Atropos의 접근 가능한 텍스트 탐색을 배포했다. `0bbabae947761b0cc380951a56677bd7e443db09`의 CI와 배포 smoke가 성공했다. smoke는 정확한 Clotho 배포 SHA 확인 후 승인된 synthetic World 하나에 원자적 Change Plan을 commit·재실행하고 revision 21의 Timeline artifact와 Canon SSR 공개를 확인했다.

M4-B Subject handle reconciliation과 공개 Subject 경로까지 완료했다. 이후 M4-C Process·Duration과 M4-D membership State도 완료했다. JointJS 상호작용, 100k scope·LOD와 Canon 비교는 아직 시작하지 않았다.

## M4-B 완료

[M4 파생 모델 구현 기록](M4-DERIVED-MODELS.md)의 Slice B에 따라 Canon별 identity equivalence component와 lineage를 결정적으로 계산한다. `subject_handles` 운영 식별 표면은 분리 시 anchor component에 유지되고 병합 시 오래된 handle을 대표로 두며 나머지는 redirect한다. Revision별 Subject artifact, Canon 진입점, stable Subject URL과 검색을 공개했다.

`a396a3a5c4e7dd64374813e56fd9e1d597a292e9`의 전체 CI와 Railway 3개 서비스 배포가 성공했다. 배포 smoke는 정확한 배포 SHA를 확인하고 승인된 synthetic World 하나에 identity Relation을 포함한 Change Plan을 commit·재실행한 뒤 revision 23의 Subject artifact·semantic digest·immutable cache header, Canon SSR과 stable Subject page를 검증했다.

## M4-C 완료

`kind = composite`이고 `roles`에 `process`가 있는 Event에서 직접 child와 전체 descendant, 포함 경로, 구조적 시작·종료 후보와 내부 Relation을 결정적으로 계산한다. descendant의 같은 Time System 시간 경계가 충분할 때만 정확한 Duration 또는 최소–최대 범위를 만들고, 근거가 부족하면 `process_duration_unresolved`로 남긴다. Canon의 Process 진입점과 기존 stable Event URL에서 같은 served Revision의 근거를 읽을 수 있게 했다.

PR [#1](https://github.com/neocjmix/moirai/pull/1)을 squash 병합한 `dc0728da0fb2a94770aace356ad92c4d1144679c`의 CI [33895196445](https://github.com/neocjmix/moirai/actions/runs/33895196445)와 Railway 배포가 성공했다. Clotho synthetic revision 27에서 Process containment, exact Duration, immutable artifact와 Atropos SSR을 확인했다.

## M4-D 완료

첫 State family를 `membership`로 제한한다. `state`·`state:membership` 역할이 있는 Composite Event와 그 Event를 향하는 `starts`·`ends` Relation만 읽는다. 경계 Event가 동일한 기존 Subject에 속하고 같은 Time System에 배치됐을 때만 상태와 완료 Duration을 계산한다. 종료 근거가 없으면 open-ended로 표시하되 현재까지 지속한다고 주장하지 않는다. 중복 경계·Subject 불일치·시간 근거 부족은 evidence와 unresolved 진단으로 보존한다.

Canon별 immutable State artifact를 발행하고 Subject page에서 해당 handle의 계산된 상태를 공개한다. PR [#2](https://github.com/neocjmix/moirai/pull/2)를 squash 병합한 `350920bbdb3928f34e406940b9d9f0d95f7e8c65`의 CI [33938273152](https://github.com/neocjmix/moirai/actions/runs/33938273152), Railway 배포와 [post-deploy smoke 33942566968](https://github.com/neocjmix/moirai/actions/runs/33942566968)이 성공했다. Clotho synthetic revision 28에서 complete State artifact, exact membership Duration 28 deployment와 Atropos Subject SSR을 확인했다.

다른 State family와 일반 LLM 추론은 현재 범위가 아니다. 당시 다음 단계였던 JointJS
graph·scope와 vertical chronology는 M4-E·F에서 완료했다. 이후 subject lane, metro
routing, composite region, 100k scope·LOD와 Canon 비교는 M4 조기 종료 뒤 M4.5로
이관됐다.
