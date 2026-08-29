# 개념 엔티티 후보 인덱스

이 목록은 비즈니스 시나리오를 작성하기 위한 1차 어휘다. 여기에 등록됐다는 사실은 독립 저장 대상, ontology primitive, API resource 또는 데이터베이스 테이블임을 의미하지 않는다.

모든 항목은 현재 `candidate` 상태다. 사용자 여정을 작성한 뒤 다음 질문으로 재검토한다.

- 다른 개념과 구분되는 안정적인 정체성이 필요한가?
- 독립적인 생명주기를 가지는가?
- 사용자가 직접 만들고 선택하고 관리하는가?
- 다른 엔티티에서 계산되는 파생 개념인가?
- 단순 속성, 역할 또는 관점으로 충분한가?
- 어느 시스템이 그 개념의 의미를 소유하는가?

## 세계 범위

| ID | 후보 | 임시 정의 | 성격 가설 |
|---|---|---|---|
| ENT-001 | World | 함께 이해되고 관리되는 하나의 세계 범위 | 운영 |
| ENT-002 | Canon | 같은 World 안에서 독립적으로 참인 사실들이 성립하는 맥락 | 세계 범위 |
| ENT-003 | Time System | 사건을 시간상에서 읽기 위한 좌표와 해석 체계 | 운영 또는 규칙 |

## 세계 내용

| ID | 후보 | 임시 정의 | 성격 가설 |
|---|---|---|---|
| ENT-004 | Event | 특정 Canon 안에서 발생하거나 성립하는 사건 | 사실 |
| ENT-005 | Relation | 특정 Canon 안에서 사건과 사건 사이에 성립하는 의미 있는 관계 | 사실 |
| ENT-006 | Narrative | 특정 Canon 안의 단일 Event 또는 여러 Event로 이루어진 범위를 사람이 읽을 수 있게 설명하는 서술 | 내용 |
| ENT-007 | Source | 사건·관계·서술을 작성하거나 판단할 때 사용한 자료 | 근거 |

## 작성과 관리

| ID | 후보 | 임시 정의 | 성격 가설 |
|---|---|---|---|
| ENT-009 | Change | 세계에 가하려는 하나의 의미 있는 변경 | 운영 |
| ENT-010 | Revision | 변경이 반영된 세계의 식별 가능한 상태 | 운영 |
| ENT-011 | Contributor | 작성·판단·검토에 관여한 인간, LLM 또는 외부 주체 | 운영 |
| ENT-012 | Review | 변경 또는 출판 대상에 대한 인간의 검토 결과 | 운영 |

## 출판

| ID | 후보 | 임시 정의 | 성격 가설 |
|---|---|---|---|
| ENT-013 | Publication | World의 어떤 내용을 어떤 독자 경험으로 공개할지 정한 출판물 | 출판 |
| ENT-014 | Edition | 특정 시점에 독자에게 제공되는 식별 가능한 공개본 | 출판 |
| ENT-015 | Public Reference | 독자가 공유·인용할 수 있는 안정적인 공개 식별 대상 | 출판 |

## 파생 가능성이 높은 후보

다음은 사용자에게 중요한 개념이지만 다른 엔티티에서 계산되거나 해석될 가능성이 높다.

| ID | 후보 | 임시 정의 | 성격 가설 |
|---|---|---|---|
| ENT-016 | Subject | 여러 사건에서 동일한 인물·조직·장소·사물로 읽히는 대상 | 파생 |
| ENT-017 | Process | 여러 사건을 하나의 진행 과정으로 읽은 결과 | 파생 |
| ENT-018 | State | 특정 시점 또는 범위에서 성립한다고 해석되는 상태 | 파생 |
| ENT-019 | Duration | 사건 경계와 시간 근거로부터 읽히는 지속 기간 | 파생 |
| ENT-020 | Timeline | 선택된 기준과 범위에 따라 사건을 시간상으로 배열한 관점 | 파생 |

## 제외된 후보

제외된 ID는 다른 개념에 재사용하지 않는다.

| ID | 후보 | 상태 | 제외 이유 |
|---|---|---|---|
| ENT-008 | Claim | rejected | Moirai의 개념과 목적을 잘못 이해하면서 도입된 중간 개념이다. Source와 Event·Relation·Narrative 사이에 일반화된 Claim 엔티티를 두는 것은 현재 비즈니스 요구사항이 아니다. |

## 현재 쟁점

### Source와 Event

`ENT-007` Source는 Event·Relation·Narrative를 작성할 때 사용한 자료다. Source는 작성의 유래를 남기지만 Canon 안에서 성립한 사실의 지위를 대신하지 않으며, 그 사이에 별도의 일반화된 주장 엔티티를 두지 않는다.

### Narrative의 범위

`ENT-006` Narrative는 단일 Event의 서술이면서 여러 Event를 관통하는 서술일 수도 있다. 하나의 Narrative 개념이 다음 범위를 가질 수 있다.

- Canon
- Process
- Composite Event
- 단일 Event

범위가 다르다는 이유로 서로 다른 종류의 Narrative를 전제하지 않는다. Process에 Narrative가 존재해도 Process가 정본 엔티티로 바뀌는 것은 아니며, Composite Event는 Event의 구성 형태로 본다. 상위 범위의 Narrative는 하위 Event의 Narrative나 구조를 대체하지 않는다.

### Publication과 Edition

`ENT-013` Publication과 `ENT-014` Edition이 실제로 다른 생명주기를 갖는지 출판·갱신·철회 시나리오에서 검증한다.

### 파생 후보의 수동 개입

`ENT-016`부터 `ENT-020`까지의 파생 결과에 사람이 이름을 붙이거나 교정할 때 별도 관리 개념이 필요한지 검증한다.

## 1차 사용자 여정 검토

검토 대상: [JRN-001부터 JRN-007](../journeys/INDEX.md)

이 평가는 엔티티를 최종 확정하지 않는다. 여정에서 독립적인 정체성과 생명주기가 실제로 요구됐는지를 기준으로 후보의 강도를 조정한다.

### 강하게 확인된 후보

| ID | 후보 | 여정에서 확인된 이유 |
|---|---|---|
| ENT-001 | World | 작성, 확장, canon 추가, 반출의 일관된 최상위 대상이다. |
| ENT-002 | Canon | 같은 대상에 관해 서로 다른 사실을 각각 독립적으로 참이게 유지해야 하며 Canon 사이에 우열을 두지 않는다. |
| ENT-003 | Time System | 세계와 canon에 따라 서로 다른 시간 해석 체계를 선택하고 구분해야 한다. |
| ENT-004 | Event | 작성·정정·탐색·공유의 핵심 내용 단위다. |
| ENT-005 | Relation | 사건의 맥락과 인과·순서·포함을 작성하고 탐색하는 핵심 내용이다. |
| ENT-006 | Narrative | Canon, Process, Composite Event와 단일 Event의 범위에서 사람이 읽을 수 있는 서술이 필요하다. |
| ENT-007 | Source | 작성 근거로 사용되고 독자가 확인하며 반출 시에도 보존되어야 한다. |
| ENT-009 | Change | 작성·확장·정정을 하나의 의미 있는 작업으로 추적해야 한다. |
| ENT-010 | Revision | 내부 변경 전후와 공개본의 기반 상태를 구분하고 복구해야 한다. |
| ENT-012 | Review | 작성 결과와 출판 대상을 인간이 검토한 결과를 추적해야 한다. |
| ENT-013 | Publication | World에서 무엇을 공개할지 선택하고 관리하는 지속적인 출판 대상이다. |
| ENT-014 | Edition | 최초 출판, 갱신, 정정과 철회 과정에서 독자에게 제공된 공개 상태를 구분해야 한다. |

### 추가 시나리오가 필요한 후보

| ID | 후보 | 남은 질문 |
|---|---|---|
| ENT-011 | Contributor | 독립 엔티티인지, 인간·LLM·외부 기관이 수행하는 역할인지 협업 요구가 정해지지 않았다. |

### 엔티티보다 다른 성격이 강한 후보

| ID | 후보 | 1차 판단 |
|---|---|---|
| ENT-015 | Public Reference | 독립 생명주기를 가진 엔티티보다 공개 대상에 부여되는 안정적인 참조 요구에 가깝다. |
| ENT-016 | Subject | Event와 Relation에서 읽히는 파생 정체성으로 유지한다. |
| ENT-017 | Process | 여러 Event의 구성을 읽은 파생 결과로 유지한다. |
| ENT-018 | State | 사건 구조를 특정 관점에서 해석한 파생 결과로 유지한다. |
| ENT-019 | Duration | 시간 근거와 사건 경계에서 계산되는 파생 결과로 유지한다. |
| ENT-020 | Timeline | 선택한 범위와 시간 체계에 따른 독자 관점으로 유지한다. |

### 여정에서 새로 드러났지만 아직 추가하지 않은 후보

- 출판 범위: Publication과 공개 대상 사이의 관계로 충분한지 검토한다.
- 철회 기록: Change, Review와 Edition의 상태로 충분한지 검토한다.
- 독자 관점: Public Reference와 Timeline 같은 파생 관점으로 충분한지 검토한다.
- 자료 묶음: 여러 Source를 하나의 작성 입력으로 관리할 독립 개념이 필요한지 검토한다.

## Narrative 범위 결정

ENT-006 Narrative의 의미는 다음과 같이 확정한다.

- Narrative는 Event 구조를 사람이 읽을 수 있게 서술하는 세계 내용이다.
- 단일 Event, Composite Event, Process와 Canon 단위에 각각 Narrative가 존재할 수 있다.
- 여러 Event를 관통하는 Narrative도 동일한 Narrative 개념이다.
- Narrative의 범위가 Process라고 해서 ENT-017 Process가 정본 엔티티로 승격되지는 않는다.
- Narrative의 범위가 Composite Event라고 해서 별도의 엔티티 종류가 생기지 않는다.
- Canon 단위 Narrative도 해당 Canon의 Event와 Relation을 서술하며 다른 Canon의 사실을 병합하지 않는다.
- 범위가 큰 Narrative는 더 작은 범위의 Narrative와 Event·Relation 구조를 대체하지 않는다.

이 결정은 Narrative의 기술적 저장 방식, 식별 방식 또는 한 범위에 허용되는 Narrative 수를 정하지 않는다.

## JRN-007 검토 결과: Canon 내부 정체성과 Canon 간 대응

검토 대상: [JRN-007 Canon을 가로지르는 동일 대상의 연결과 비교](../journeys/JRN-007-connect-and-compare-across-canons.md)

### ENT-016 Subject

Subject는 계속해서 Canon 내부의 Event와 Relation에서 읽히는 파생 개념으로 유지한다.

JRN-007은 비교 기능이 필요하다는 이유만으로 서로 다른 Canon의 대상을 하나의 Subject로 병합할 수 없음을 확인했다. Canon별 Subject는 각 Canon의 서로 다른 사건 이력과 관계를 독립적으로 유지해야 한다.

### 새로 확인된 비즈니스 개념

서로 다른 Canon의 대상들이 비교 가능하다는 인간의 판단을 보존하는 **Canon 간 대응**이 필요하다.

이 대응은 다음 성격을 가진다.

- 어느 Canon 안에서 참인 세계의 사실이 아니다.
- Canon별 Event, Relation 또는 파생 Subject를 소유하거나 대체하지 않는다.
- 작성자가 승인·정정·제거할 수 있다.
- Atropos의 Canon 비교와 탐색에 사용될 수 있다.
- 반출과 복구 시 의미가 보존되어야 한다.
- 일대일 관계로 제한할 근거가 없다.

### 아직 결정하지 않은 것

현재 단계에서는 Canon 간 대응에 엔티티 ID를 발급하지 않는다. 필요성은 확인됐지만 다음 중 어느 성격인지 아직 결정되지 않았기 때문이다.

- 독립적인 생명주기를 가진 엔티티
- 여러 Canon별 대상을 묶는 관계
- 작성·관리와 탐색을 위한 운영상 연결

URDR의 `figureHandle`은 이 문제를 해결했던 증거이지 Moirai가 그대로 채택할 이름이나 구조가 아니다.

### 엔티티 재검토에 미치는 영향

- ENT-016 Subject를 ontology primitive로 승격하지 않는다.
- World가 여러 Canon을 함께 묶는 이유 중 하나로 Canon 간 비교 가능성이 확인됐다.
- Relation이 Canon 내부의 사실 관계만을 뜻하는지, 운영상 대응 관계까지 포괄하는지는 이후 관계 책임을 정할 때 구분해야 한다.

### 다음 검증 과제

- Canon 간 대응이 독립 엔티티인지, 관계인지, 운영상 연결인지 관계 책임을 정하며 검증한다.
- 여러 인간과 LLM이 공동 작성·검토하는 요구가 실제 범위인지 결정한 뒤 ENT-011 Contributor를 검증한다.
