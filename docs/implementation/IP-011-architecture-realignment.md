---
id: IP-011
title: Dogfooding 기반 architecture realignment baseline
status: accepted
layer: implementation-plan
---

# IP-011 — Dogfooding 기반 architecture realignment baseline

## 1. 상태·권한·근거

A0는 PR #129 병합으로 완료했다. 2026-09-22 사용자가 IP-011 전체 실행과 쓰기·삭제·수정·병합·배포를 위임했다. A1부터 dependency와 rehearsal/backup/검증 gate를 지키며 A6까지 진행한다. 기존 M5의 별도 후속 범위는 활성화하지 않는다.

[실제 상태](../evidence/ip011/reconstruction.md), [데이터 감사](../evidence/ip011/data-audit.json), [자기검증](../evidence/ip011/review.md)을 근거로 한다. 관측된 배포 v4와 accepted target v5는 명시적으로 다르다. 이 차이는 허용된 migration backlog이며 문서끼리의 모순을 허용한다는 뜻이 아니다.

## 2. authoritative source map

| 책임                       | 유일한 기준                         | 추적                                                  |
| -------------------------- | ----------------------------------- | ----------------------------------------------------- |
| 제품 경계                  | CON-003                             | World reality / Collection selection / Event identity |
| 용어·관계                  | entities/CORE-MODEL, entities/INDEX | BCR-001~011, 신규 ENT-021; ENT-002 superseded         |
| authoring / reader 수용    | BR-001/003/004, JRN-004             | policy·single Narrative·discovery·bounded reads       |
| canonical schema/invariant | TS-002                              | 기존 저장 능력 재사용, 바뀌는 cardinality·ownership   |
| transaction·policy         | TS-003/004                          | 원자성·현재 policy 검증·stale write rejection         |
| projection·read            | TS-005/006/010                      | World facts / selection / time / bounded cost         |
| export·운영                | TS-007/008                          | 내용·이력 보존, 성능·보안 gate                        |
| 실행 순서                  | IP-011                              | 아래 dependency와 exit                                |
| 활성 상태                  | CURRENT                             | 관측 상태와 다음 작업                                 |

이전 IP-001~010의 완료 이력은 유지한다. Canon별 Event Narrative를 요구한 IP-007과 Canon별 facts/1..N membership을 요구한 IP-003은 목표 설계를 더 이상 소유하지 않는다. 기존 미완료 M4/M5 항목은 다음 표로 이관하며 암묵적 활성화를 금지한다.

## 3. milestone 재구성

| 단계                                      | 선행                         | 범위                                                                                                                         | exit / 검증                                                                                                                               |
| ----------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A0 baseline·계측 설계                     | 현재                         | 실상 재구성, authoritative 문서 정합화, 병목 instrument 지점·시나리오 정의                                                   | 문서 모순 0, 데이터 영향 목록, PR; 실측 latency는 후속 A1에서 고정                                                                        |
| A1 policy delivery + baseline measurement | A0 채택                      | 배포 중인 v4 의미를 정확히 설명하는 transition policy 조회와 target guard prototype; 경계별 계측                             | HTTP/CLI/MCP 동일 정책, 격리된 v5 prototype에서 stale/missing reject·exact retry, cold/warm·DB·worker·browser baseline과 성능 budget 결정 |
| A2 v5 contract + migration rehearsal      | A1                           | Collection 전환, kind 파생, World Relation, 단일 Narrative, DB/contract/UI/MCP/tests/export 동시 수정; snapshot copy dry-run | owner-full inventory, ID/본문 mapping, World union 제약 검사, 모든 아래 migration 검증; production 변경 없음                              |
| A3 controlled cutover                     | A2                           | 백업·write quiesce, versioned schema/content migration, v5 배포·Publication 재생성                                           | old writer 거절, restore rehearsal, target/served 일치, 127 Event·6 Collection 보존 또는 검토된 mapping, 9 scenario E2E                   |
| A4 bounded read scalability               | A3 (설계·prototype은 A1부터) | World/Collection 전체 materialization 제거, paged index·stable layout·incremental client·bounded authoring query             | TS-006 cold/warm/dense/scale suite·고정 latency/frame budget 통과, N 증가 대비 local query bounded cost                                   |
| A5 Collection discovery                   | A4                           | membership/temporal/adjacency 기반 candidate·relevance·ON/OFF·설명 UX                                                        | shared node 안정, empty/no-time case, 대규모 후보 paging·budget, 모바일 container 구분                                                    |
| A6 역사 dogfooding 재개                   | A3+A4+A5                     | 단종·임진왜란·일본사 신규 세션 작성과 더 깊은 병렬 서사                                                                      | 정책 준수 transcript, reuse·Narrative·temporal 품질과 read performance 기준, 회귀 없음                                                    |
| 이후 M5 재편                              | A6                           | 아래 잔여 lifecycle·portability·governance/release                                                                           | 현 target 계약 기준으로 별도 실행 활성화                                                                                                  |

A1 transition policy는 v4 서버에 v5 semantics를 쓰라고 지시하지 않는다. A2에서 target policy를 구현하고 A3에서 contract와 함께 교체한다. policy guard는 A1의 격리된 v5 prototype에서 검증하고 A2 contract에 통합한 뒤 A3에서 신규 production write에 강제한다. 기존 strict v4 payload에 policy 필드를 조용히 추가하지 않는다. v4를 영구 호환하지 않는다. A4까지 bulk 역사 입력은 멈추고 회귀용 소규모 fixture만 사용한다. 계획 단계 A0 완료는 A1 구현의 자동 승인이 아니다.

## 4. 기존 milestone/backlog disposition

| 기존 항목                                                    | 새 위치 / 판단                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| M0~~M3, M4 조기 종료, M4.6/4.7, IP-004~~010                  | 완료/조기종료 사실은 보존. 새로운 의미의 수용 증거로 재사용하지 않음                   |
| M4 남은 100k E2E·성능                                        | A1 측정 + A4; 기존 spatial fixture 통과만으로 완료 아님                                |
| M4 Canon 비교·correspondence / IP-003 Canon-specific Subject | 보류. A5 Collection discovery로 reader 필요 우선 해결; 같은 기능으로 둔갑시키지 않음   |
| M5 Event/Canon lifecycle                                     | Collection 철회·membership 0·Narrative 이관 등 cutover 필수 부분 A2/A3로 앞당김        |
| M5 revision diff / export-import                             | migration 검증에 필요한 before/after·legacy reader·round-trip A2/A3, 일반 UX는 이후 M5 |
| M5 governance/access/release readiness                       | 기존 보안 유지, 확장은 이후 M5; 새 Tenant/ACL/private Publication 불활성               |
| dogfood chronology·duplicate·reader narrative 품질           | IP-008/009/010 회귀 보존 + A2/A3 의미 migration + A6 품질 재검증                       |
| TS-009 latent 3D                                             | draft/deferred; 안정적 현재 SVG 읽기 비용 해결이 선행                                  |

## 5. migration과 validation plan

### 5.1 inventory와 preservation manifest

A2 시작 시 최신 main/deployment/World Revision을 다시 고정한다. 현재 근거는 historical World revision 30이고 전체 설치 inventory를 대체하지 않는다. 모든 World·withdrawn rows·Narrative locales·correspondence·Subject handles·grant/export 형식은 owner-full read로 추가 감사한다. DB migrations 001–009와 현재 실제 applied schema를 대조한다. A0에서는 운영 DB의 applied migrations를 직접 확인하지 않았다. A2에서는 owner-full read로 실제 001–009 적용을 확인했고, 19개 테이블·sequence·실제 schema fingerprint를 포함한 암호화 backup의 격리 복원 digest 일치까지 검증했다([실행 증거](../evidence/ip011/a2-execution.md)). 이 증거는 v5 migration rehearsal 완료를 뜻하지 않는다.

World/Event/Collection/Relation/Narrative별 old→new ID, membership, old body digest, 보존 문단·인용, 이관 사유, reviewer disposition, revision mapping을 기록한다. backup restore를 복제 환경에서 시험한다. 현재 IDs를 제목이나 새 Collection으로 재발급하지 않는다.

### 5.2 실제 revision 30 대상

6 Canon→6 Collection ID 보존; 153 Event membership 재사용. 127 Event(atomic101/composite26)의 kind를 143 contains로 파생하고 불일치가 0임을 다시 검증한다. World의 현재 title `동아시아사 — 조선과 일본`을 reality 이름 `실제 세계사`로 바꾸며 1380~1615 coverage는 설명에 남긴다. World ID는 보존한다.

415 Relation ID/endpoint/attributes를 보존 대상으로 삼고 477 Canon Relation memberships를 사실 적용 조건에서 제거한다. 먼저 전체 union에 contains DAG·strict/non-strict/equality·Time System capability 검사를 실행한다. 모든 Canon이 개별 유효해도 union은 모순될 수 있다. 충돌은 자동 삭제하지 않고 근거와 정정안을 기록하며 A3를 막는다.

160 Narrative는 event155/canon5; primary136/summary2/annotation22이며 locale은 ko다. 17 Event에 여러 Canon의 Narrative가 있다. owner별 모든 본문을 비교하여 중복은 제거하고 고유 정보·출처·역사적 관점은 단일 본문의 적절한 문단 또는 보조 주석으로 보존한다. 첫 Canon 선택·마지막 값 overwrite·기계적 concatenate는 금지한다. 각 owner의 기존 primary ID 중 명시적으로 선택한 하나를 보존하고 다른 ID의 이관/철회를 기록한다. 본문 없는 Event12개와 Collection2개는 근거 있는 Narrative를 보강한다. 목표는 active Event127 + Collection6에 Narrative133개이며 정본 중복 Event 판정 결과에 따라 검토된 mapping으로만 바꿀 수 있다.

정확히 같은 Event title과 정규화된 type/endpoints/direction/attributes의 완전 중복 Relation은 이번 export에서 0이다. 의미상 duplicate가 없다는 증명은 아니다. 계유정난·단종 상왕화/세조 즉위·전쟁/하위전투·사망/권력재편 등 서로 가까운 사건을 시기·행위자·행위·결과로 검토한다. “같은 제목” unique 제약이나 Composite/Collection 이름 일치로 merge하지 않는다.

### 5.3 실행 방식

schema와 canonical content 변환은 versioned migration 및 Lachesis의 동일 불변식을 보장하는 제한된 관리 명령으로 수행한다. v4 public update가 owner/kind 이동을 지원하지 않으므로 MCP 호출 몇 개로 우회하지 않는다. event.kind 제거, Narrative owner 이동, Relation membership retirement는 한 compatibility boundary로 배포한다. staging copy에서 새 invariant 검사를 먼저 수행한다. 필요 migration metadata만 두고 generic taxonomy는 추가하지 않는다.

A3에서는 write quiesce→final revision/digest 검증→backup→migration→v5 API/worker/web→new manifest 검증→served pointer→write 재개 순서를 따른다. 정책·schema·contract가 불일치하면 write를 열지 않는다. cutover 중 실패하면 write 정지 상태에서 검증된 backup restore 또는 forward repair를 선택하며, 성공한 v5 write 이후 단순 application rollback을 데이터 rollback으로 주장하지 않는다.

### 5.4 검증

- same-World 참조, unique pair, membership 0 유효, Collection 철회가 Event/Relation을 보존.
- 모든 active owner에 정확히 한 Narrative, canon_id 없음, 본문/주석/인용 preservation manifest 대조.
- old Revision30 및 earlier export bytes/digest와 역사적 의미 유지; v5 round-trip semantic fingerprint.
- Event/Relation ID와 temporal bounds/partial order 비교; union conflict 0 또는 검토된 명시적 정정.
- World-wide search, direct Event URL, shared node, Collection toggle 시 본문·시간 불변, Composite overlap/비가시 children.
- latest policy guard, stale v4 writer, malformed/unauthorized/revision-conflict/idempotent retry.
- deterministic Publication·public/private leakage·DB migrate/restore·mobile drawer/history/close focus.

## 6. 의도적 보류와 위험

추천 weight·전용 search/graph DB·latent 3D·다국어 편집·새 Claim/Subject ontology·membership importance/order는 근거 부족으로 보류한다. 실제 union temporal conflict와 의미 중복 여부, 이력/handle 수, latency/frame 수치는 후속 실측·rehearsal에 남는다. 보류된 알고리즘 parameter가 domain 의미를 재결정하게 두지 않는다.

single reality는 모든 역사 지식의 완전성/무오류성을 뜻하지 않는다. 서로 모순되는 확정 제약을 동시에 수용하지 않되, 불확실성과 출처 견해는 Narrative/annotation/origins에 보존한다. 장기적으로 대립 assertion 자체의 탐색이 필요하면 별도 요구로 확장한다.

## 7. 완료 판정

A0는 9개 질문에 대해 정의·근거·migration·다음 exit가 연결되고 자기검증의 unresolved 설계 모순이 없을 때 완료한다. 미측정 runtime 성능이나 migration 미실행을 이미 해결됐다고 쓰지 않는다. PR의 문서 diff·링크·보안 검사와 review evidence를 남긴다. main 반영 전에는 branch의 baseline이며 배포 v4는 계속 관측 기준이다.

## 8. contract / implementation surface inventory

A2 변경 묶음: packages/contracts schemas·DTOs·export, domain validation·relation registry, persistence migrations/query/history/import, Lachesis commands, Clotho application/HTTP/MCP schemas·descriptions, skills/clotho client/CLI/SKILL.md, plugin discovery contract tests, projections/publication artifacts, graph-query/presentation, Atropos loader/URL/selectors/drawer, fixtures/goldens/mobile E2E. 단순 search/replace로 history contract나 canonical 문자열을 손상시키지 않는다. runtime SKILL/MCP inline instructions는 현 v4 동작을 설명하므로 이번 문서 PR에서 v5 행동으로 바꾸지 않았다. A1/A3에서 서버와 함께 전환하고 schema·instructions byte budget을 시험한다.

A2 authoring 검색 계약은 World 전체 Event를 앱 메모리로 읽지 않고 World 범위의 활성 Event 제목 후보를 Revision 고정 cursor로 제한해 제공한다. 제목 검색만으로 동일성·부재를 판정하지 않는다. 후보의 Narrative·시공간 증거·graph neighborhood를 읽는 제한된 상세 조회와 실제 clone의 index rehearsal을 별도 검증한 뒤 작성 전 reuse workflow가 준비됐다고 판정한다. 활성 운영 v4 DB에는 격리된 v5 검색용 index migration을 등록하거나 실행하지 않고, A3의 write quiesce·migration 순서에 포함한다. A4에서 큰 World의 검색 query plan/latency를 측정하고 필요할 때만 구조를 조정한다.

초기 policy artifact의 내용 기준은 TS-004.5다. 구현 시 artifact를 생성/서비스하고 문서가 artifact를 참조하게 하여 장기적으로 두 정책 사본을 유지하지 않는다. policy API 제공 실패 시 신규 write는 진행하지 않고 이미 성공한 요청의 조회·idempotent recovery는 유지한다.
