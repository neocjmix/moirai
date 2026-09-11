---
id: JRN-004
title: 복수 Canon 추가와 비교
status: accepted
layer: business-requirements
---

# JRN-004 — 복수 Canon 추가와 비교

## JRN-004.1 목적

기존 World 안에 새로운 persistent, named interpretive knowledge scope를 추가하고, shared Event와 scope별 차이를 어느 하나에 authority를 부여하지 않은 채 탐색할 수 있게 한다.

정사 삼국지와 삼국지연의처럼 여러 Canon은 같은 Event를 공유할 수도 있고 서로 다른 Event, Relation, 시간과 Narrative context를 가질 수도 있다.

## JRN-004.2 행위자

- 작성자
- LLM
- 독자

## JRN-004.3 시작 조건

- 기존 World와 하나 이상의 Canon이 존재한다.
- 작성자는 같은 World에서 기존 Canon과 overlap하거나 다른 범위를 다룰 자료 또는 창작 의도를 가지고 있다.

## JRN-004.4 기본 흐름

1. 작성자는 새로 구성할 Canon과 함께 다룰 지식 범위를 LLM에 설명한다.
2. LLM은 기존 World와 Canon을 탐색하고 shared Event identity, 새 Event와 scope별 차이를 구분한다.
3. LLM은 기존 Event를 Canon마다 복제하지 않고 필요한 membership을 추가하며 별도 Canon을 구성한다.
4. LLM은 Event membership, 승인된 Relation 모델, Time System과 authored Narrative를 새 Canon scope에 맞게 작성한다.
5. Lachesis는 Canon 경계, same-World membership과 active Event 최소 cardinality를 검증하고 성공한 변경을 보존한다. Canon 내부 상충 자체는 invalidity가 아니다.
6. 성공적으로 반영된 Canon은 authority·default·priority 없이 현재 Publication에 자동 반영된다.
7. Atropos는 독자가 현재 보고 있는 Canon을 알 수 있게 하고 공개된 Canon들의 공통점과 차이를 탐색할 수 있게 한다.

## JRN-004.5 성공 결과

- 기존 Canon과 새 Canon이 overlap 가능한 해석적 지식 범위로 보존된다.
- shared Event identity와 scope별 차이가 구분된다.
- 독자는 어느 Canon을 보고 있는지 알 수 있다.
- 독자는 한 Canon을 다른 Canon의 정본·기본·대체본으로 오해하지 않고 공통점과 차이를 탐색할 수 있다.

## JRN-004.6 비즈니스 규칙

- Canon은 authority, exclusivity, completeness, consistency 또는 objective truth를 함의하지 않는다.
- Moirai는 정본·기본·공식·우위·priority Canon을 지정하거나 암묵적으로 전제하지 않는다.
- 출판 여부, Canon 수와 원자료 양은 Canon의 의미를 바꾸지 않는다.
- 같은 Event identity의 multi-Canon membership과 distinct Event identity 사이의 correspondence를 혼동하지 않는다.
- 성공적으로 반영된 Canon은 별도의 출판 승인 없이 자동 공개된다.
- 독자에게 적용한 Canon scope와 overlap이 명시적으로 보여야 한다.

## JRN-004.7 관련 요구사항

- [BR-001](../BR-001-clotho-authoring.md)
- [BR-002](../BR-002-lachesis-management.md)
- [BR-003](../BR-003-atropos-publication.md)
- [BR-004](../BR-004-world-expressiveness.md)
- [BR-005](../BR-005-human-governance.md)
- [BR-007](../BR-007-publication-lifecycle.md)
