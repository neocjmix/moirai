# 비즈니스 개념 인덱스

이 문서는 Moirai의 비즈니스 개념을 분류한다. 개념으로 등록됐다는 사실은 데이터베이스 테이블, API resource 또는 ontology primitive임을 의미하지 않는다.

핵심 관계와 시스템 책임은 [핵심 비즈니스 개념 관계와 책임](CORE-MODEL.md)에서 정의한다.

## 분류

- `core`: 사용자가 직접 작성·관리·출판하거나 세계의 의미를 구성하는 핵심 개념
- `derived`: 핵심 개념으로부터 읽거나 계산되는 개념
- `deferred`: 관련 요구는 있으나 독립 비즈니스 개념인지는 이후 판단
- `rejected`: 현재 모델에서 독립 비즈니스 개념으로 사용하지 않음

## 핵심 개념

| ID | 개념 | 상태 | 분류 | 정의 |
|---|---|---|---|---|
| ENT-001 | World | accepted | core | 함께 작성·관리·탐색할 여러 Canon을 묶는 최상위 범위 |
| ENT-002 | Canon | accepted | core | 같은 World 안에서 독립적으로 참인 사실들이 성립하는 문맥 |
| ENT-003 | Time System | accepted | core | Canon의 Event를 시간상에서 읽기 위한 좌표와 해석 규칙 |
| ENT-004 | Event | accepted | core | 특정 Canon 안에서 발생하거나 성립하는 사실의 핵심 단위 |
| ENT-005 | Relation | accepted | core | 특정 Canon 안에서 Event 사이에 성립하는 의미 있는 사실 관계 |
| ENT-006 | Narrative | accepted | core | 단일 Event부터 Composite Event, Process와 Canon까지 선택된 범위를 사람이 읽을 수 있게 서술한 내용 |
| ENT-013 | Publication | accepted | core | Atropos가 독자에게 제공하는 World의 현재 공개 표현 |

## 파생 개념

파생 개념은 사용자와 독자에게 의미가 있지만 별도의 정본 사실을 만들지 않는다.

| ID | 개념 | 상태 | 분류 | 정의 |
|---|---|---|---|---|
| ENT-016 | Subject | accepted | derived | Canon의 여러 Event와 Relation에서 동일한 인물·조직·장소·사물로 읽히는 대상 |
| ENT-017 | Process | accepted | derived | 여러 Event 또는 Composite Event를 하나의 진행 과정으로 읽은 결과 |
| ENT-018 | State | accepted | derived | 특정 시점 또는 범위에서 성립한다고 읽히는 상태 |
| ENT-019 | Duration | accepted | derived | Event 경계와 시간 정보에서 읽히는 지속 기간 |
| ENT-020 | Timeline | accepted | derived | 선택한 Canon, 범위와 Time System에 따라 Event를 배열한 관점 |

Process를 Composite Event로 표현하는 구체적인 방식은 이후 기술 명세에서 검증한다.

## 보류된 엔티티 후보

다음 항목과 관련된 비즈니스 요구는 존재하지만 독립 엔티티로 만들 근거는 아직 충분하지 않다.

| ID | 후보 | 상태 | 현재 판단 | 다시 검토할 조건 |
|---|---|---|---|---|
| ENT-007 | Source | deferred | 원자료와 작성 유래로 보존하며 독립 엔티티를 전제하지 않는다. | 자료 재사용, 참고문헌 관리, 라이선스 또는 출처별 탐색이 필요할 때 |
| ENT-009 | Change | deferred | 의미 있는 작성 작업과 변경 이력은 필요하지만 독립 엔티티 여부는 운영 설계에 가깝다. | 사용자가 변경 자체를 선택·관리해야 할 때 |
| ENT-010 | Revision | deferred | 복구와 이전 상태 보존은 필요하지만 Revision의 식별 방식은 이후 결정한다. | 특정 내부 상태를 사용자가 직접 참조·비교해야 할 때 |
| ENT-014 | Edition | deferred | 1차 구현은 현재 공개본만 제공하며 독립 Edition 개념을 전제하지 않는다. | 과거 공개본을 독자가 계속 열고 인용하거나 복원해야 할 때 |

## 독립 개념에서 제외

제외된 ID는 다른 개념에 재사용하지 않는다. 관련 행위나 요구사항은 유지될 수 있다.

| ID | 후보 | 상태 | 제외 이유 |
|---|---|---|---|
| ENT-008 | Claim | rejected | Canon 안의 사실과 원자료 사이에 일반화된 주장 계층은 필요하지 않다. |
| ENT-011 | Contributor | rejected | 작성자, 출판자, LLM과 외부 주체가 수행하는 역할이다. |
| ENT-012 | Review | rejected | 인간이 수행하는 검토 행위와 그 결과 상태이며 현재 독립 엔티티가 아니다. |
| ENT-015 | Public Reference | rejected | 공개 대상에 요구되는 안정적인 주소와 식별 성질이다. |

## Canon 간 대응

[JRN-007](../journeys/JRN-007-connect-and-compare-across-canons.md)에서 서로 다른 Canon의 대응 대상을 연결하고 비교해야 할 필요가 확인됐다.

이 연결은 다음 원칙을 따른다.

- 어느 Canon 안에서 참인 사실이 아니다.
- Canon 내부의 ENT-005 Relation과 구분한다.
- Canon별 Event와 파생 Subject를 병합하지 않는다.
- 작성자가 승인·정정·제거할 수 있다.
- Atropos의 Canon 비교와 탐색에 사용될 수 있다.
- 반출과 복구 시 의미가 보존되어야 한다.

현재는 독립 엔티티 ID를 발급하지 않고 [BCR-008](CORE-MODEL.md#bcr-008-canon-간-대응) 관리 관계로 정의한다.
