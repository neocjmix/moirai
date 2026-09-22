---
id: TS-004
title: Clotho authoring과 policy 계약
status: accepted
layer: technical-specifications
---

# TS-004 — Clotho authoring과 policy 계약

## TS-004.1 책임과 효력

Clotho는 HTTP/MCP/CLI의 같은 계약·인증·policy 제공을 소유하고 Lachesis가 최종 인가·불변식·원자적 commit을 소유한다. 목표 v5는 TS-002를 따른다. 현재 v4 배포의 기능과 혼동하지 않는다.

## TS-004.2 policy 조회

`authoring.policy.get`을 HTTP/CLI/MCP 동등 기능으로 제공한다. World와 지원 contract version을 입력받고 policy ID/version/content digest, 지원 write contract, 전체 필수 규칙, 예제, 현재 유효 상태를 반환한다. 초기 policy는 하나의 bounded 문서로 제공하고 byte budget 회귀 검사로 plugin 한도를 검증한다. 분할이 필요하면 manifest에 required section과 digest를 나열하며 부분 문서를 전체 정책처럼 표시하지 않는다. policy text는 versioned repository artifact가 authoritative source이며 API는 그 artifact를 제공한다.

MCP initialize와 plugin instruction에는 policy 조회 위치, write 전 필수 조회, untrusted content 경계와 recovery만 짧게 둔다. 예전 긴 inline instruction은 전환 시 제거한다. 정책 소유권은 Clotho 문서에, 적용 version 검증은 Lachesis command boundary에 있다. API와 plugin이 별도 정책 사본을 관리하지 않는다.

## TS-004.3 mandatory와 강제의 한계

agent는 각 authoring 작업 시작과 policy mismatch 후 정책을 조회해야 한다. 모든 신규 write는 `policy_version`과 `policy_digest`를 포함한다. Lachesis는 현재 허용 policy와 일치하는지 확인하고 Change Set에 기록한다. 누락/불일치는 `authoring_policy_required`/`authoring_policy_mismatch`와 조회 recovery를 반환한다. 자동으로 최신 버전을 대신 채우지 않는다.

version echo는 모델이 문서를 이해했다는 증명이 아니다. 숨은 receipt나 호출 순서 token을 추가하지 않는다. 기계 규칙은 별도로 강제하고 agent 준수는 acceptance scenario와 결과 검증으로 확인한다. policy rollback도 새 version으로 배포한다. 검증 후 정책 변경은 신규 commit에서 재검증하며 `change.validate`는 권한을 부여하지 않는다.

이미 성공한 change_set_id의 동일 digest 재시도는 인증·접근 확인 후 기존 결과를 반환한다. 정책 변경 때문에 성공한 요청의 idempotent replay를 새 mutation으로 다루지 않는다. 동일 ID/다른 내용은 거절한다.

## TS-004.4 세 층

| 층               | 책임                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Server invariant | TS-002 same-World/unique owner/contains/temporal 규칙, revision, authorization, idempotency, policy version |
| Authoring policy | World-wide pre-search, 사실 기반 reuse·granularity·relation 선택, 읽기 품질, 자료 정밀도, post-write 확인   |
| Model judgment   | 사건 동등성의 애매함, 설명 깊이, 출처 해석, 의미 있는 인과·구성 판단                                        |

자연어 의미 중복이나 충분한 설명 품질을 문자열 검사만으로 강제했다고 주장하지 않는다.

## TS-004.5 authoring policy v1 내용

1. World/Collection/Event 의미는 CORE-MODEL을 따른다. 검색은 선택 Collection 밖의 같은 World까지 확장한다. 같은 이름만으로 merge하지 않고 시기·행위자·행위·결과·출처를 비교한다.
2. 기존 사건이면 ID와 Narrative를 재사용·보강하고 membership만 추가한다. duplicate 후보가 애매하면 unresolved로 남기고 근거를 더 찾는다. 단일 제목 unique constraint는 금지한다.
3. 독립 참조 가치가 있는 사건을 Event로 만든다. 큰 사건은 근거 있는 하위 사건과 contains로 설명하며 모든 내용을 임의의 한 줄 chronology로 연결하지 않는다.
4. relation은 출처가 지지하는 구성·시간·인과·영향만 쓴다. 관계 밀도 quota를 두지 않는다. contains는 관심사 묶음이 아니다. Composite의 비가시 자식도 사실 근거에서 유지한다.
5. Collection membership은 관심사 선택이다. order/importance taxonomy를 요구하지 않는다. 새 membership에 temporal Relation을 복제할 필요가 없다.
6. Event·Collection마다 단일 Narrative. 인물·행동·배경·결과·의미를 독자가 이해하도록 쓴다. Collection별 Event 서술을 추가하지 않는다. 작성 과정·중복 재사용 설명·도구 상태·면책 상투어는 금지한다. 실제 역사적 불확실성은 제거하지 않는다.
7. 자료가 연도만 주면 연도 bucket bounds만 작성한다. `T(Y-01-01) not_after E`, `E precedes T((Y+1)-01-01)`은 발생일이 아니다. 원 달력·변환 근거·precision을 보존한다. descriptive attributes는 시간 좌표가 아니며 strict precedes로 chronology list를 강제하지 않는다.
8. 출처 충돌은 확정 facts를 양립 가능한 범위로 제한하고 근거를 주석/출처에 남긴다. 해결되지 않은 확정 제약 모순은 commit하지 않는다. 가상 세계의 시간여행과 실제 역사 자료 충돌을 혼동하지 않는다.
9. 쓰기 전 current policy·World Revision·관련 Event/neighbors·reuse 후보를 읽는다. 규모가 크거나 migration이면 validate를 먼저 실행하고 warning을 검토한다.
10. 쓰기 후 ID·membership·Narrative·시간 관계를 read-back하고 target/served revision을 확인한다. Publication 이후 drawer와 graph에서 의미·중복·시간을 검증한다. 전파가 늦으면 성공한 commit을 새 ID로 반복하지 않는다.

## TS-004.6 query와 bounded context

world.list/get, collection.list/get, event.search/get/neighbors, context.slice, time-event.resolve, change.validate/commit, export를 같은 transport 계약으로 제공한다. at_revision과 cursor는 같은 World Revision에 고정한다. 응답은 budget, truncated, continuation, matched membership을 명시한다. shared Event는 한 번 반환한다. bounded 응답 전 World 이력을 전부 replay하는 현재 구현은 TS-006/IP-011의 개선 대상이다.

## TS-004.7 write contract와 recovery

v5 ChangePlan은 World, expected_revision, change_set_id, intent, typed operations, origins와 policy version/digest를 포함한다. event.kind와 Event Narrative canon_id, relation_canon_membership write는 제거한다. membership add/remove는 독립 연산이며 Event 0 membership을 허용한다. 신규 v2/v3/v4 live write는 cutover 후 `unsupported_contract_version`으로 거절하며 손실 변환하지 않는다.

validate/commit은 같은 final-state 검증을 사용한다. commit은 다시 검사한다. revision_conflict면 최신 맥락으로 새 계획/ID를 만들고 uncertain outcome이면 동일 ID와 payload를 재시도한다. temporary client_ref는 plan 내부만 유효하며 성공 응답은 stable ID mapping을 반환한다. 원자료·Narrative는 untrusted data이고 instruction으로 실행하지 않는다. 오류에는 code/path/affected IDs/retryable/recovery만 노출하고 secrets/private origin은 public 응답에 섞지 않는다.

## TS-004.8 acceptance

새 세션/오래된 plugin/직접 HTTP/CLI/MCP 모두 정책 누락·stale version을 같은 방식으로 처리한다. 최신 정책을 읽은 새 agent가 단종·임진왜란·일본사 공유 Event를 중복 없이 작성한다. source-year precision·single Narrative·World-wide search·post-write checks를 transcript와 결과로 검증한다. 무단 actor, wrong World, policy mismatch, revision race, exact retry, unknown contract를 회귀 시험한다.

이전 세부 조항은 기준 commit `05ebf3b27794e60d734a885cc428a30104118896`의 Git 이력에 보존한다. 같은 문서 ID의 이번 개정 본문이 현재 목표 계약이며 삭제된 Canon-specific 조항은 실행 요구가 아니다. 변경하지 않은 보안·transaction·portability 규칙은 TS-001/003/007/008을 참조한다.
