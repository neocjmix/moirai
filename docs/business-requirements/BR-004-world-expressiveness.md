---
id: BR-004
title: 세계 모델의 표현 범위
status: accepted
layer: business-requirements
owner: Cross-system
---

# BR-004 — 세계 모델의 표현 범위

관련 헌법: [CON-001](../constitution/CON-001-purpose.md), [CON-003](../constitution/CON-003-world-truth.md)

## BR-004.1 사건과 구성

개별 사건과 여러 사건으로 이루어진 복합 사건 또는 과정을 표현할 수 있어야 한다.

## BR-004.2 관계

부분과 전체, 구조적 순서, 원인, 조건, 영향과 방해를 표현할 수 있어야 한다.

## BR-004.3 시간

정확하거나 부정확한 시간 정보, 여러 시간 체계와 구조적 순서를 표현할 수 있어야 한다.

## BR-004.4 정체성

인물, 조직, 국가, 장소와 사물의 정체성 및 시간에 따른 연속·변화·소멸을 표현할 수 있어야 한다.

## BR-004.5 상태와 기간

상태, 지속 기간, 생애, 통치, 혼인과 전쟁 같은 장기 과정을 사건 구조로부터 이해할 수 있어야 한다.

## BR-004.6 복수 Collection

[CORE-MODEL](entities/CORE-MODEL.md)의 selection semantics를 따른다. 하나의 Event를 관심사마다 복제하지 않는다. 실제 세계사는 하나의 World이며 삼국지연의·MCU와 reality를 구분한다.

## BR-004.7 복잡한 시간 서사

열린 루프, 닫힌 루프, 시간여행, 역행과 동일 정체성의 복수 인스턴스를 표현할 수 있어야 한다.

## BR-004.8 유래와 전달

정보, 지식과 물건의 유래 및 전달 경로를 추적할 수 있어야 한다.

## BR-004.9 관심사와 사실의 차이

Collection마다 선택 집합과 Collection 소개는 달라도 공유 Event의 Narrative·시간·Relation 의미는 같다. 출처 충돌은 근거·주석·불확실성으로 표현한다. 서로 모순되는 확정 제약을 Collection별로 감춰 수용하지 않는다.

## BR-004.10 범위별 서술

구조화된 Event와 Relation뿐 아니라 독자가 읽을 수 있는 Narrative를 함께 보존하고 표현할 수 있어야 한다.

Narrative는 다음 범위에 존재할 수 있어야 한다.

- Collection
- Process
- Composite Event
- 단일 Event

여러 Event를 관통하는 Narrative와 단일 Event를 설명하는 Narrative는 같은 개념이다. Narrative의 범위가 달라져도 Event·Relation 구조나 파생 개념의 성격을 바꾸지 않으며, 상위 범위의 Narrative가 하위 범위의 서술을 대체하지 않는다.
