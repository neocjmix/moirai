# Moirai 문서 인덱스

Moirai의 규범 문서는 세 계층으로 관리한다.

1. [헌법](constitution/INDEX.md): 목적, 권한, 시스템 경계와 바뀌지 않아야 할 원칙
2. [비즈니스 요구사항](business-requirements/INDEX.md): 사용자가 무엇을 할 수 있어야 하는지와 제품이 무엇을 보장해야 하는지
3. [기술 명세](technical-specifications/INDEX.md): 요구사항을 구현하기 위한 시스템 구조, 데이터 계약과 동작 규칙

헌법은 비즈니스 요구사항보다 우선하고 비즈니스 요구사항은 기술 명세보다 우선한다. 하위 계층이 상위 계층과 충돌하면 하위 문서를 수정하거나 상위 계층의 변경을 명시적으로 결정해야 한다.

## 비규범 로드맵

- [RM-001 — 개인화·다중 Tenant 확장 안전장치](roadmap/RM-001-personalization-multitenancy.md)

로드맵은 미래 방향과 현재 설계의 금지선을 기록하지만 현재 구현 범위, 수용 기준 또는 선행 개발 지시가 아니다. 로드맵의 기능을 구현하려면 별도의 비즈니스 요구사항과 기술 명세가 명시적으로 승인되어야 한다.

## 구현 운영 원칙

- [IS-001 — 에이전트·모바일 중심 구현 전략](implementation/IS-001-agent-mobile-strategy.md)
- [IP-001 — 첫 제품 구현 계획](implementation/IP-001-first-product-plan.md)
- [현재 구현 상태](implementation/CURRENT.md)
- [Milestone 0 infrastructure inventory](implementation/M0-INFRASTRUCTURE.md)

구현 운영 원칙은 제품 의미를 정의하지 않지만 에이전트가 코드를 작성·검증·배포하고 사용자에게 결과를 전달하는 방식을 구속한다.

## ID 규칙

- 헌법 조항: `CON-NNN`
- 비즈니스 요구사항: `BR-NNN`
- 비즈니스 개념: `ENT-NNN`
- 비즈니스 개념 관계: `BCR-NNN`
- 사용자 여정: `JRN-NNN`
- 기술 명세: `TS-NNN`
- 로드맵: `RM-NNN`
- 구현 전략: `IS-NNN`
- 구현 계획: `IP-NNN`
- 문서 내부의 세부 조항: `CON-NNN.M`, `BR-NNN.M`, `JRN-NNN.M`
- ID는 한 번 발급하면 의미를 바꾸거나 재사용하지 않는다.
- 폐기된 항목도 삭제하지 않고 상태와 대체 항목을 기록한다.
- 다른 문서에서 참조할 때는 ID와 링크를 함께 적는다.

예: `[BR-003.2](business-requirements/BR-003-atropos-publication.md#br-0032-독자-탐색)`

## 상태

- `candidate`: 존재 여부와 성격을 검토할 후보
- `operational`: 필요한 운영 책임이지만 세계 의미의 독립 개념은 아님
- `deferred`: 필요성은 있으나 독립 개념으로 만들지는 이후 결정
- `rejected`: 현재 모델에서 독립 개념으로 사용하지 않음
- `draft`: 논의 중
- `accepted`: 합의됨
- `deprecated`: 더 이상 적용하지 않음
- `superseded`: 다른 항목으로 대체됨

## 계층별 범위

헌법과 비즈니스 요구사항에는 기술, 프레임워크, API, 데이터베이스, 배포 방식과 구체적인 스키마를 기록하지 않는다. 그런 결정은 기술 명세 계층에서 다룬다.

개념 엔티티와 사용자 여정은 비즈니스 요구사항을 구체화하는 하위 문서다. 별도의 규범 계층을 만들지 않는다.
