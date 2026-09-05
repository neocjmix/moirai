# 기술 명세 인덱스

기술 명세는 헌법과 비즈니스 요구사항을 구현 가능한 구조와 계약으로 구체화한다. 기술 명세는 제품 의미를 새로 만들거나 상위 계층의 결정을 구현 편의에 맞게 약화해서는 안 된다.

## 상태와 변경 규칙

- 기술 명세의 초기 상태는 `draft`다.
- 설계 검토와 구현 검증을 통과한 문서는 `accepted`로 변경한다.
- ID는 의미를 바꾸어 재사용하지 않는다.
- 구현 중 명세와 현실이 충돌하면 구현만 조용히 변경하지 않고 명세 또는 상위 요구사항에 변경을 반영한다.
- 구체적인 기술 선택이 아직 필요하지 않은 부분은 결정하지 않은 이유와 다음 결정 문서를 명시한다.

## 명세

| ID     | 문서                                                                    | 주요 책임                                                                   | 상태     |
| ------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------- |
| TS-001 | [시스템 아키텍처와 책임 경계](TS-001-system-architecture.md)            | 런타임 경계, 정본 소유권, 의존 방향                                         | accepted |
| TS-002 | [정본 데이터 모델](TS-002-canonical-data-model.md)                      | 식별자, 저장 모델, 파생·운영 데이터 경계                                    | accepted |
| TS-003 | [변경·Revision·Publication 모델](TS-003-change-revision-publication.md) | 변경 원자성, 충돌, 이력, 복구, 공개 전파                                    | accepted |
| TS-004 | [Clotho 탐색·작성 계약](TS-004-clotho-contract.md)                      | LLM 탐색, Change Plan, 오류 회복                                            | accepted |
| TS-005 | [파생 모델과 Canon 간 비교](TS-005-derived-models.md)                   | Subject·Process·State·Duration·Timeline                                     | accepted |
| TS-006 | [Atropos 공개 읽기와 그래프 탐색](TS-006-atropos-publication.md)        | Snapshot, URL, 검색, JointJS graph                                          | accepted |
| TS-007 | [반출·복구와 스키마 진화](TS-007-portability.md)                        | package, import, migration, 의미 보존                                       | accepted |
| TS-008 | [보안·운영·성능과 배포 품질](TS-008-operations-quality.md)              | 인증, backup, SLO, 관측성, 배포                                             | accepted |
| TS-009 | [잠재 3D 그래프 레이아웃과 2D 투영](TS-009-latent-3d-graph-layout.md)   | Y-constrained XZ-free layout, yaw projection, 기존 2D region·routing 재사용 | draft    |
| TS-010 | [Event 관계 기반 시간 모델](TS-010-event-relational-time.md)            | virtual Time Event, 관계 기반 시간 제약, Placement 호환 전환                | accepted |

## 1차 기술 기준선

현재 문서 묶음은 다음 결정을 기준선으로 채택한다.

- 하나의 Lachesis 서비스가 정본 데이터와 모든 변경을 소유한다.
- 정본 저장소는 PostgreSQL이다.
- Clotho application과 Atropos는 정본 저장소에 직접 접근하지 않는다. API bootstrap만 내부 Lachesis와 DB를 조립한다.
- 하나의 의미 있는 작성 작업은 한 World에 대한 원자적 Change Set이다.
- 현재 상태와 변경 이력을 같은 트랜잭션에서 기록한다.
- 성공한 Change Set은 별도 승인 없이 Publication의 목표 Revision이 된다.
- Atropos는 완성된 불변 Publication Snapshot만 읽는다.
- 파생 모델과 공개 읽기 모델은 정본 데이터로부터 다시 만들 수 있어야 한다.
- Clotho는 skill·CLI·HTTP·MCP·외부 인증과 작업 맥락 구성을 소유하는 운영 인터페이스다. Lachesis는 내부 최종 인가·정본 실행기다.
- 파생 모델은 근거와 algorithm version을 가지며 Canon의 새 사실을 만들지 않는다.
- Atropos는 React·Next.js와 JointJS를 사용하고 Revision별 공개 artifact를 읽는다.
- World export는 화면이나 DB dump가 아닌 versioned portable package다.
- 운영 장애와 공개 전파 지연은 콘텐츠의 draft·승인 상태로 표현하지 않는다.

TS-009의 잠재 3D 레이아웃은 현재 `draft`이며 위 기준선의 필수 요소가 아니다. 검증·승인되기 전까지 TS-006의 2D constrained layout이 accepted 기준선이다.

TS-010의 Event 관계 기반 시간 모델은 2026-09-05 accepted됐다. 문서 의미는 TS-002~007의 관련 시간 계약에 반영됐지만 runtime·schema와 기존 데이터는 아직 M4-D 기준선에 있다. IP-002 checkpoint 없이 구현 상태를 문서 상태와 같다고 간주하지 않는다.

## 일괄 검토 초점

세부 문구보다 먼저 아래 기준선에 동의하는지 확인한다. 하나가 바뀌면 연결된 여러 명세를 함께 수정해야 한다.

| 판단 지점   | 채택한 기준선                                                                                                             | 주 영향 문서           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 서비스 구조 | TypeScript modular monolith와 PostgreSQL에서 시작하고 API·worker·public web의 배포 경계를 분리한다.                       | TS-001, TS-008         |
| 변경 단위   | 한 World의 Change Set을 유일한 쓰기 단위로 삼고 revision, audit, outbox를 같은 트랜잭션에 기록한다.                       | TS-002, TS-003         |
| Clotho 책임 | 운영상 접근·외부 인증·도구 계약과 작성 경험을 소유하며 작은 도구를 조합한다. 최종 인가·정본 규칙은 Lachesis에 둔다.       | TS-004                 |
| 정체성 의미 | 동일 개체의 연속성은 equivalence로 묶고 분기·병합 계보는 별도 lineage로 보존한다.                                         | TS-002, TS-005         |
| 공개 경계   | Atropos는 정본 API가 아니라 CDN의 revision별 불변 snapshot만 읽는다.                                                      | TS-001, TS-003, TS-006 |
| 그래프 표현 | JointJS와 semantic zoom을 사용하고 복합 영역은 시간축 sweep envelope로 계산한다. 잠재 3D 확장은 TS-009에서 별도 검증한다. | TS-006, TS-009         |
| 이동 가능성 | `.moirai` versioned package를 표준 반출·복구 형식으로 사용하고 의미 fingerprint로 이관을 검증한다.                        | TS-007                 |
| 운영 기준   | 공개 전파와 graph rendering을 포함한 SLO·용량 한계·복구 목표를 출시 조건으로 다룬다.                                      | TS-008                 |

## 상위 요구사항 추적

| 기술 명세 | 주요 상위 근거                                                              |
| --------- | --------------------------------------------------------------------------- |
| TS-001    | CON-001, CON-002, CON-005, CON-006, CON-007, BR-002, BR-003, BR-006, BR-007 |
| TS-002    | CON-003, CON-004, CON-007, BR-002, BR-004, BR-006                           |
| TS-003    | CON-004, CON-005, BR-002, BR-005, BR-006, BR-007                            |
| TS-004    | CON-002, CON-004, CON-005, BR-001, BR-002, BR-005, BR-007, JRN-001, JRN-002 |
| TS-005    | CON-003, CON-004, BR-002, BR-003, BR-004, JRN-004, JRN-005, JRN-007         |
| TS-006    | CON-002, CON-003, CON-005, BR-003, BR-004, BR-007, JRN-003, JRN-005         |
| TS-007    | CON-007, BR-002, BR-006, JRN-006                                            |
| TS-008    | CON-002, CON-004, CON-005, CON-007, BR-002, BR-003, BR-005, BR-006, BR-007  |
| TS-009    | CON-003, BR-003, BR-004, JRN-003, JRN-005                                   |
| TS-010    | CON-003, CON-006, BR-002, BR-004                                            |
