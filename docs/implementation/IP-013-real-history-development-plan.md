---
id: IP-013
title: 실제 역사 기반 병행 개발 계획
status: accepted-planning-baseline
layer: implementation-plan
---

# IP-013 — 실제 역사 기반 개발과 검증

2026-10-04 UTC 사용자 재계획. **이 문서는 이전 A5 완료 → A6 역사 입력 순서를 대체한다.** World 관리와 Clotho 입력 검증을 먼저 완료하고, dot의 실제 역사 축적과 Codex의 개발·검증을 병행한다. 개발 우선순위는 Composite 표현·전환 → 격리된 X 배치 실험실 → Collection 자동 ON/OFF·discovery다. 합성 규모 사례는 회귀·부하 시험으로 보존하며 제품 탐색·수용의 주 입력은 실제 역사로 바꾼다.

이번 작업은 문서 정합화와 draft PR까지다. 코드·설정·운영 데이터 변경, merge·배포는 하지 않는다. 이 계획의 채택만으로 입력이나 구현을 시작하지 않는다. 사용자는 이 문서 작업 후 중단된 World 구현과 실제 역사 작업의 재개를 별도로 승인했다. 후속 구현은 PR-first·자동 merge 금지를 유지하며, 아래 선행 수용을 기록한 뒤 제한 pilot을 시작한다. 사용자 pilot 검토 전 자율 대량 확장은 금지한다. [CURRENT](CURRENT.md)가 활성 상태를 소유한다.

## 출발점과 상태

- **구현됨:** IP-011 A1–A3, HUD·수동 선택 제한 제거·표현 분리 일부, IP-012 Render 기본 읽기와 generation/scheduler 초기 구현. 상세 범위는 CURRENT 및 기존 evidence를 따른다.
- **수용·종료:** #321(`e6c927a`)는 #320 runtime의 모바일 체감을 사용자 수용으로 종료했다. p95 수치 전체 통과가 아니며 기존 frame/heap 미달은 deferred다. 숫자만으로 튜닝을 재개하지 않는다.
- **미구현/검증 필요:** main의 `packages/contracts/src/v5-wire.ts`에는 World list/get은 있지만 create/delete wire가 없다. `apps/atropos-web/src/components/v5-graph-page.tsx`는 명시 World ID·Time System을 요구하며 단일 World catalog를 만든다. 빈 World와 World 전환의 종단간 완료를 주장할 수 없다.
- **재사용 후보:** `task-3/moirai`에 World 관리 로컬 구현이 있고 usage-limit으로 중단됐다는 인계가 있다. 이 checkout에서는 확인하지 못했으며 미병합·미배포 작업으로 취급한다. 후속 담당자가 원래 작업을 보존한 채 diff·테스트·계약을 확인하고 필요한 부분만 재사용한다.
- **계획됨:** 아래 W/C/D/R/L/A. 완료로 표시하지 않는다. 새 production history World는 synthetic World의 삭제/reset이나 다른 사실 우주를 만드는 작업이 아니다. 실제 역사는 하나의 reality이며 조선·일본·명은 같은 World 안의 coverage/Collection이다. 기존 실제 자료의 재사용·이관 여부는 inventory 후 결정한다.

## 순서·책임·진입과 종료

| 단계                          | 책임·진입                                            | 결과와 종료 조건                                                                                               |
| ----------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| W World 관리                  | Codex. 후속 실행 지시, 최신 main/기존 작업 inventory | 생성·선택·복구 가능한 삭제 정책, 빈 World→첫 Event 경로를 구현·검증하고 사용자에게 확인 가능한 결과 제공       |
| C Clotho·발행 입력 검증       | Codex, dot가 작성 경로 확인. W 이후                  | 아래 정상/실패/재시도와 Publication 검증 통과. 승인된 깨끗한 history World ID·policy·입력 경로 기록            |
| D1 제한 역사 pilot            | dot. W+C 수용 및 pilot 실행 지시                     | 조선/임진왜란과 인접국 Composite·출처·불확실 시간, 읽을 수 있는 다중 규모 사례. 사용자 pilot 검토              |
| R Composite 표현·전환         | Codex. W+C 이후 D1 자료가 생기는 대로 병행           | 실제 사례의 줌 단계·전환·조정 가능한 임계값을 눈으로 비교하고 사용자 수용. 전체 역사 축적 완료를 기다리지 않음 |
| L X 배치 실험실               | Codex. R 수용 후, 같은 실제 사례 사용                | 격리된 비교 환경, 교체 가능한 알고리즘과 재현 가능한 설정·결과. 후보 채택/보류 근거와 사용자 검토              |
| D2 범위 확장                  | dot. D1 사용자 검토로 범위 확정 후                   | 검토된 지역·시대만 작은 batch로 확장하며 Codex에 사례 전달. 인물별 구성과 자율 광역 확장은 별도 범위 확인      |
| A Collection 자동화·discovery | Codex. R·L 검토 이후 별도 활성화                     | 기존 A5 의도 보존·자동 ON/OFF·discovery backlog를 실제 역사 과업으로 재검증                                    |

W/C 완료는 전체 A5 S0–S7 완료, 1k/10k/100k 합성 규모 통과, 모든 IP-012 증분 최적화 완료를 요구하지 않는다. 다만 실제 쓰기의 무결성·인가·복구·발행 실패를 무시하는 허가는 아니다. blocking 실패가 있으면 dot 입력을 멈추고 Codex가 좁은 원인을 해결한다.

## W/C — World에서 첫 사건 읽기까지

1. **생성·정책:** World 생성 주체와 권한, 이름/identity, 초기 Time System, Revision·Publication 초기 상태를 정한다. Clotho 인증과 Lachesis 최종 인가를 유지하고 World 간 데이터·선택·cache 누출을 검증한다. legacy-development / real-history / experiment 용도를 명확히 구별하고 이전 synthetic write/reset 허가를 real-history World에 적용하지 않는다. 새 history World를 선택·확인하고 기존 World를 보존한다.
2. **선택·빈 상태:** World 목록·명시 URL·재방문 선택을 일관되게 연결한다. 0 World, 빈 World, Time System/Collection이 아직 없는 상태, 잘못된/철회된 ID, 발행 대기를 구별한다. 빈 상태를 404 또는 실패한 fetch의 빈 장면으로 대신하지 않는다. 명시 링크와 사용자 camera/선택 의도를 보존한다.
3. **삭제 범위:** 우선 recoverable archive/withdraw와 복구를 검토한다. 대상 World·영향·인가를 확인하고 읽기/쓰기/목록/URL/Publication·복구 시 동작을 명세화한다. 정본과 이력의 영구 purge, 공유 자원 삭제, 기존 World reset은 별도 결정이며 이번 계획/작업에서 실행하지 않는다. 정책 미결정 상태를 구현 완료로 표시하지 않는다.
4. **Clotho:** 현재 v5 schema와 `world.list/get`, `authoring.policy.get`을 조회한다. policy version/digest·`expected_revision`·field별 `origin_refs`를 포함한 작은 ChangePlan을 validate→commit→read-back한다. validate는 rollback 진단이며 commit 승인이 아니다. HTTP/MCP/CLI 중 사용하는 경로의 계약 parity와 권한을 검증한다.
5. **실패·멱등성:** invalid/stale policy·권한·시간 제약·cross-World 참조 거절, revision conflict, timeout 후 같은 Change Set ID/같은 plan 정확 재시도, 재시도 중복 0을 검증한다. conflict는 context refresh 후 수정 plan과 새 ID를 사용한다. 오류를 알려주고 불확실한 commit을 새 ID로 반복하지 않는다.
6. **첫 Event·수동 읽기:** 첫 사실 Event, 출처/Narrative, 필요한 Time System·Collection membership을 발행하고 Atropos에서 찾기·선택·detail을 확인한다. membership 0도 유효하며 unplaced/불확실 시간을 이유로 내용을 소실시키지 않는다. 수동 World/Collection 선택, 새 Collection의 수동 발견, 해제/all-off의 빈 선택 유지, Event/detail 접근, 명시 URL·camera 복원을 필요한 범위에서 확보한다. 완전한 pin/catalog 자동화 제품을 gate로 요구하지 않는다.
7. **발행 준비:** World Revision·target/served·Render generation을 구분해 commit이 완전한 공개본으로 도달하는 것을 증명한다. 실패·재시작·재시도 때 이전 일관된 공개본을 유지하고 혼합 revision·반쪽 노출이 없어야 한다. 작은 연속 batch의 lag·오류·복구와 첫 Event 가시성을 기록한다. full compile이 안전하게 처리하면 pilot을 허용하고 selective invalidation·payload reuse·X locality 최적화는 측정된 병목에 따라 진행한다.

C 종료 evidence는 테스트/관찰 결과, World ID, policy digest, commit·served revision과 generation, 모바일 URL, 미검증 한계, 입력 중단·복구 절차를 포함한다. W/C 검증용 쓰기도 후속 실행 범위에서만 한다. 현재 문서 PR에서는 운영 조회/쓰기를 수행하지 않는다.

## D — 실제 역사 데이터와 검토 경계

pilot은 조선/임진왜란의 제한된 사건군과 연결된 명·일본 사건을 같은 World에서 구성한다. 시대→전쟁/과정→전투/외교·세부 사건을 함께 읽을 만큼 밀도를 확보하되 목표 숫자를 채우려고 사실을 만들지 않는다. 중첩·겹치는 Composite, 긴 기간과 짧은 사건, 여러 Collection의 shared Event, 희소/밀집 구간을 포함한다. Composite는 authored contains 근거이며 시각 cluster나 국가별 membership의 다른 이름이 아니다.

dot는 신뢰할 수 있는 공개 출처·링크·근거 요약, source-explicit/human-instruction/LLM-inference 구분, 달력과 확정/추정/불명 시간, 기존 Event 검색·재사용을 책임진다. 연·월·일만 알려진 자료에 분 단위 정밀도를 발명하지 않는다. 불확실성·출처 충돌은 현 temporal 계약 안에서 드러내며 layout을 위해 시간을 바꾸지 않는다. 인물은 사건 근거 없이 이름만으로 identity를 합치거나 인물별 구성을 대량 생성하지 않는다.

작은 idempotent batch마다 policy·revision·출처·검증/발행 결과와 실제 읽기 URL을 남긴다. dot는 대표 Event/Composite IDs·World revision·읽기 과업·문제 화면을 Codex에 넘기고, Codex는 같은 snapshot에서 재현해 개선한다. dot가 Clotho를 통한 researched canonical 입력을 맡고 Codex는 구현·compiler·실험실을 맡는다. Codex는 시험을 위해 real-history World를 reseed하거나 정본 사실을 고치지 않는다. 사용자에게 pilot의 역사 정확성·범위·표현을 보여준 후 수정/확장 범위를 기록한다. **pilot 검토 전 autonomous broad expansion/person compositions는 보류한다.**

## R — Composite 표현을 먼저 결정

같은 실제 Composite를 overview→중간→상세 및 독립 X/Y zoom에서 관찰한다. hull→ordinary point→small point→hidden, 자식·label·relation의 등장/퇴장, 큰 ancestor 억제와 HUD hand-off를 확인한다. partial/nested/overlap, 화면 밖 자식, 밀집 연도, 긴 시간 범위도 포함한다. 표현 변화는 같은 Event identity를 유지하며 HUD는 화면 관련 후보가 있으면 정확히 하나를 고르는 기존 계약을 보존한다.

변화 threshold·fade 구간·hysteresis·density 설정을 눈으로 읽고 조정·reset할 수 있는 제한된 관찰 도구를 계획한다. threshold 전후와 양방향 줌의 화면·짧은 replay, 설정 version, source revision을 함께 기록한다. Semantic/Geographic 밀도·입력 구별을 유지하고 threshold는 표현만 바꾸며 authored contains/identity를 바꾸지 않는다. 선택·camera를 고정한 비교로 깜빡임·사건 누락·급작스러운 튀어오름과 의미 오독을 평가한다. 사용자 iPhone 17 Safari/PWA 체감과 emulation 결과는 구별한다. 숫자 frame gate를 다시 여는 작업이 아니라 실제 역사 표현의 채택 작업이다. 기존 자동 회귀는 유지하고 구체적 회귀는 보고·수정한다.

## L — 격리된 수평 배치 실험실

production main UX와 분리된 실험 경로/환경에서 동일 World snapshot·camera·Collection 선택·표현 설정을 고정하고 **X placement만** 비교한다. 좌표는 Collection 선택에 독립적이며 실험 입력은 immutable snapshot으로 고정한다. 현 force-directed graph를 baseline으로 두고 deterministic lane/slot, 제약 기반 배치, 국소 relaxation 등 대체 알고리즘을 교체할 수 있게 한다. 후보는 예시이며 선제 구현 의무가 아니다. 느린 실험도 허용하며 main UX의 성능 수용 기준을 실험 자체의 진입 gate로 삼지 않는다.

시간 해석·Y 시간축·불확실성·placed/unplaced 의미는 고정한다. Event identity, contains, Collection membership·수동 선택·camera 의미를 유지한다. 실험은 정본이나 served pointer를 자동 변경하지 않는다. 알고리즘/version/seed/parameters·입력 revision을 남겨 재현하고 겹침·관계 가독성·Composite 형태·편집 후 흔들림·실행 비용을 함께 비교한다.

사용자 검토로 채택한 알고리즘/파라미터만 정식 구현으로 승격한다. 승격 시 [IP-012](IP-012-render-publication-plan.md)의 compiler version·완전한 generation 검증·원자적 pointer 전환·rollback을 적용하고 필요한 canonical Publication 재생성/backfill을 별도 작업으로 수행한다. layout 결과를 정본 사실로 저장하거나 시간을 보정하지 않는다. 다중 Publication 선택 제품, Tenant/ACL 또는 새 배포 인프라를 선제 설계하지 않는다.

## 짧은 다음 작업과 남은 결정

1. 이 문서 draft PR을 검토한다. 후속 작업에서 최신 main·관련 PR과 `task-3/moirai` 작업을 대조한다.
2. W의 생성/선택·복구 가능한 삭제 의미와 깨끗한 history World 대상을 확정하고 W→C를 종단간 검증한다.
3. dot와 제한 pilot 범위·출처·검토 과업을 고정한다. W/C 수용 후 D1∥R을 시작한다.
4. pilot 사용자 검토 후 D2 확장 범위를 정하고, R 수용 후 L에서 X 후보를 비교한다. A5 자동화/discovery는 그 뒤다.

남은 결정은 recoverable 삭제/복구의 정확한 노출 정책, 기존 실제 자료 이관 범위, pilot의 구체적 사건·출처·범위, 표현 threshold와 X 후보 채택이다. 이를 미리 구현하거나 이번 문서 PR로 해결됐다고 주장하지 않는다. [IP-011](IP-011-architecture-realignment.md), [A5 disposition](IP-011-A5-collection-discovery-plan.md), [IP-012](IP-012-render-publication-plan.md), [로드맵](../roadmap/RM-001-personalization-multitenancy.md)은 이 순서를 따른다.
