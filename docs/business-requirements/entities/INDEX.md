# 비즈니스 개념 인덱스

이 문서는 Moirai의 비즈니스 개념을 분류한다. 개념으로 등록됐다는 사실은 데이터베이스 테이블, API resource 또는 ontology primitive임을 의미하지 않는다.

핵심 관계와 시스템 책임은 [핵심 비즈니스 개념 관계와 책임](CORE-MODEL.md)에서 정의한다.

## 분류

- `core`: 사용자가 직접 작성·관리·출판하거나 세계의 의미를 구성하는 핵심 개념
- `derived`: 핵심 개념으로부터 읽거나 계산되는 개념
- `operational`: 필요한 운영 책임이지만 세계의 의미를 구성하는 독립 개념은 아님
- `deferred`: 관련 요구는 있으나 독립 비즈니스 개념인지는 이후 판단
- `rejected`: 현재 모델에서 독립 비즈니스 개념으로 사용하지 않음

## 현재 용어 (glossary)

| ID      | 용어        | 분류       | 정의                                                               |
| ------- | ----------- | ---------- | ------------------------------------------------------------------ |
| ENT-001 | World       | core       | 하나의 reality와 Event identity boundary                           |
| ENT-002 | Canon       | superseded | 이전 의미를 보존한 ID. ENT-021 Collection으로 대체; ID 재사용 없음 |
| ENT-021 | Collection  | core       | World Event graph의 관심사별 선택·navigation 단위                  |
| ENT-003 | Time System | core       | 좌표·해석·비교 capability 정의                                     |
| ENT-004 | Event       | core       | 정확히 하나의 World에 속한 사건 identity; Collection 0..N          |
| ENT-005 | Relation    | core       | World-owned EventReference 사이의 assertion                        |
| ENT-006 | Narrative   | core       | Event 또는 Collection 하나가 소유하는 단일 서술                    |
| ENT-013 | Publication | core       | 한 World Revision의 공개 projection                                |
| ENT-016 | Subject     | derived    | World identity 관계로 읽는 대상                                    |
| ENT-017 | Process     | derived    | 과정으로 읽는 Event 구조의 역할                                    |
| ENT-018 | State       | derived    | 근거 사건으로 읽는 상태                                            |
| ENT-019 | Duration    | derived    | 지원되는 경계·시간으로 계산하는 기간                               |
| ENT-020 | Timeline    | derived    | 선택 범위·시간 체계에서 읽는 배열                                  |

Composite Event는 ENT-004의 contains 기반 파생 성격이며 새 type/ID가 아니다.
정확한 관계와 cardinality는 [CORE-MODEL](CORE-MODEL.md)을 따른다.

## 운영 개념과 보류된 후보

다음 운영 책임은 반드시 구현해야 하지만 세계의 의미를 구성하는 독립 엔티티로 채택하지 않는다. 구체적인 기록 구조와 식별 방식은 기술 명세에서 정한다.

| ID      | 후보     | 상태        | 현재 판단                                                                                      | 다시 검토할 조건                                                                 |
| ------- | -------- | ----------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| ENT-007 | Source   | operational | 원자료와 작성 유래를 비공개 운영 정보로 보존한다. 공개 인용은 명시적으로 작성된 세계 내용이다. | 자료 재사용, 참고문헌 관리, 라이선스 또는 출처별 탐색이 독립 사용자 목적이 될 때 |
| ENT-009 | Change   | operational | 의미 있는 작성 작업과 변경 이력을 일관성·감사 단위로 관리한다.                                 | 사용자가 변경 자체를 선택·관리해야 할 때                                         |
| ENT-010 | Revision | operational | 이전의 유효한 상태를 식별하고 복구할 수 있도록 이력을 보존한다.                                | 특정 내부 상태를 사용자가 직접 참조·비교해야 할 때                               |
| ENT-014 | Edition  | deferred    | 1차 구현은 현재 공개본만 제공하며 독립 Edition 개념을 전제하지 않는다.                         | 과거 공개본을 독자가 계속 열고 인용하거나 복원해야 할 때                         |

## 독립 개념에서 제외

제외된 ID는 다른 개념에 재사용하지 않는다. 관련 행위나 요구사항은 유지될 수 있다.

| ID      | 후보             | 상태     | 제외 이유                                                                  |
| ------- | ---------------- | -------- | -------------------------------------------------------------------------- |
| ENT-008 | Claim            | rejected | canonical content와 원자료 사이에 일반화된 주장 계층은 현재 필요하지 않다. |
| ENT-011 | Contributor      | rejected | 작성자, 출판자, LLM과 외부 주체가 수행하는 역할이다.                       |
| ENT-012 | Review           | rejected | 인간이 수행하는 검토 행위와 그 결과 상태이며 현재 독립 엔티티가 아니다.    |
| ENT-015 | Public Reference | rejected | 공개 대상에 요구되는 안정적인 주소와 식별 성질이다.                        |

## 대응의 상태

기존 Canon 간 correspondence는 [BCR-008](CORE-MODEL.md#bcr-008-대응--deferred)에 따라 deferred다. 기존 이력은 보존한다.
