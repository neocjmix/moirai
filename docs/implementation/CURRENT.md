# 현재 구현 상태

세션과 에이전트 사이의 짧은 상태판이다. 다음 milestone은 사용자 지시 없이 활성화하지 않는다.

| 항목                       | 현재 값                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 기준 계획                  | [IP-001 — 첫 제품 구현 계획](IP-001-first-product-plan.md)                                                                    |
| 실행 상태                  | `in_progress` — IP-002 Slice 7 clean-slate 단일 Event/Relation 체계와 production 재검증 |
| 활성 milestone             | M4 — 파생 모델·비교·그래프                                                                                                    |
| 현재 slice                 | IP-002 Slice 7 — legacy 제거, 첫 E2E, 리팩터링, 두 번째 E2E; 완료 뒤 IP-001 M4-D 다음으로 복귀 |
| 업로드·배포 승인           | 2026-09-02 KST 사용자가 공개 `neocjmix/moirai` main 업로드·기존 Railway 배포를 명시 승인; 현재 synthetic World 검증 범위 유지 |
| 완료 milestone             | M0 전달·관측·보안 기반; M1 최초 vertical slice; M2 세계 확장; M3 Clotho 최소 작성; M3-R 책임 분리·배포; M3-C 실제 연결        |
| M4-A 검증 application SHA  | `0bbabae947761b0cc380951a56677bd7e443db09`                                                                                    |
| public integration URL     | <https://moirai-production-8ed1.up.railway.app/>                                                                              |
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
| 최근 bearer smoke          | [33787516972](https://github.com/neocjmix/moirai/actions/runs/33787516972) `success`; 실제 OAuth 검증과 별도 근거             |
| 실제 OAuth 검증            | [M3-C 검증 기록](M3-C-VERIFICATION.md), [재현 가능한 synthetic plan](evidence/m3-c-oauth-recovery-plan.json)                  |
| 현재 배포 SHA·마지막 smoke | Atropos·worker M4-D `350920bbdb3928f34e406940b9d9f0d95f7e8c65`; Clotho migration-ledger bridge `3ac0b0deafbe00b5aaa4aa474b7ad4a8e9cc6bb8` |
| 문서 기준선                | `52dc241aeb7d48d658c4fbb7465c8a1fd448928a`; branch `baseline/m4d-2026-09-05`                                                  |

## 시간 모델 재정렬 Slice 0

[드리프트 분석](TEMPORAL-MODEL-DRIFT.md)을 바탕으로 2026-09-05 사용자가 [TS-010](../technical-specifications/TS-010-event-relational-time.md)의 strictness, virtual Time Event reference와 Time System 계약을 승인했다. [표현력 종단간 수용시험](TEMPORAL-EXPRESSIVENESS-ACCEPTANCE.md)과 [IP-002](IP-002-temporal-model-realignment.md)를 accepted 방향으로 정렬하고 [machine-readable fixture](fixtures/temporal-expressiveness/)를 고정했다.

Slice 0 완료 뒤 다음 checkpoint는 Slice 1 기존 동작 특성화다. 실제 schema migration 실행, 배포와 시험 World write는 별도 승인 전 수행하지 않는다. JointJS 다음 단계도 계속 비활성이다.

IP-002 Slice 7의 두 차례 production 종단간 검증 완료 뒤에는 IP-001 M4-D 다음의 JointJS graph·scope artifact 기본 탐색으로 복귀한다. 100k scope·LOD와 Canon 비교를 포함한 M4 종료조건을 통과하기 전에는 M5로 넘어가지 않는다.

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

다른 State family와 일반 LLM 추론은 현재 범위가 아니다. 다음 계획 단계인 JointJS canvas·subject lane 기본 탐색, 이후 100k scope·LOD와 Canon 비교는 아직 활성화하지 않았다.

2026-09-06 Slice 4 완료: `203763a89ac96bfb15bfc56daa61c3875491a9da`, PR CI [34014969062](https://github.com/neocjmix/moirai/actions/runs/34014969062) 전체 성공(PostgreSQL corpus commit/read/resolve·거절 검증, migration, mobile, Gitleaks 포함). Slice 5 완료: `eff9d359cd917bb139a65bcfcc4ef97d19008ed1`, PR CI [34015422657](https://github.com/neocjmix/moirai/actions/runs/34015422657) 전체 성공. 실제 cloud 시험 World 쓰기·배포는 미수행이며 Slice 6 제품 표면·이식성 종료 검증을 진행한다.
